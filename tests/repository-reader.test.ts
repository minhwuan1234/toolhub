import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import JSZip from 'jszip';
import type { Pool } from 'pg';
import { extractFunctions, searchFunctions } from '../lib/repository-functions';
import { analyzeRepositoryArchive, readAgentRepository } from '../lib/server/repository-reader';
import { scannerRepositoryArchive } from '../lib/server/linkedin-scanner';
import { getDesignerGraph, seedRepositoryReader, seedThinkNode, validateDesignerGraph, type DesignerGraphDocument } from '../lib/server/designer-graph';

void test('TypeScript parser finds declarations, components, nested callbacks and methods without matching comments', () => {
  const source = { path: 'src/connect.tsx', content: `// function fake() {}
const text = "function alsoFake() {}";
export function ConnectList() { return <button onClick={() => send()}>Send</button>; }
export const acceptInvitation = async (id: string) => { return id; };
class Scanner { send() { return true; } }
` };
  const result = extractFunctions(source);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.functions.map(fn => fn.name), ['ConnectList', 'ConnectList.<callback:3>', 'acceptInvitation', 'Scanner.send']);
  const method = result.functions.find(fn => fn.name === 'Scanner.send')!;
  assert.equal(method.startLine, 5);
  assert.equal(method.endLine, 5);
  assert.match(method.excerpt, /^send\(\)/);
});

void test('Python scanner respects multiline strings, nested scopes and multiline signatures', () => {
  const content = `"""
def fake():
    pass
"""
class Client:
    @decorator
    async def connect(
        self,
        user_id,
    ):
        """def another_fake():"""
        def normalize():
            return user_id
        return normalize()

    def accept(self):
        return True

def finish():
    return False
`;
  const result = extractFunctions({ path: 'client.py', content });
  assert.deepEqual(result.functions.map(fn => fn.name), ['Client.connect', 'Client.connect.normalize', 'Client.accept', 'finish']);
  assert.equal(result.functions[0].startLine, 7);
  assert.equal(result.functions[0].endLine, 14);
  assert.equal(result.functions[1].endLine, 13);
});

void test('keyword search handles camelCase and snake_case, prefers function names and does not invent semantic matches', () => {
  const functions = extractFunctions({ path: 'connect.ts', content: 'function acceptInvitation() { return true; }\nfunction log() { return "accept"; }' }).functions;
  assert.equal(searchFunctions(functions, 'accept invitation')[0].name, 'acceptInvitation');
  assert.equal(searchFunctions(functions, 'unknownFeature').length, 0);
  assert.equal(searchFunctions(functions, '').length, 2);
});

void test('on-demand archive scan skips dependencies, reports unsupported languages and can search another tool snapshot', async () => {
  const zip = new JSZip();
  zip.file('other-tool-sha/src/main.ts', 'export function exportCsv() { return "csv"; }');
  zip.file('other-tool-sha/backend/tasks.py', 'def archive_report():\n    return True\n');
  zip.file('other-tool-sha/node_modules/package/fake.js', 'function ignoreMe() {}');
  zip.file('other-tool-sha/src/worker.go', 'package main');
  const result = await analyzeRepositoryArchive(await zip.generateAsync({ type: 'uint8array' }), 'export');
  assert.equal(result.scanned_files, 2);
  assert.equal(result.total_functions, 2);
  assert.equal(result.model_calls, 0);
  assert.equal(result.functions.length, 1);
  assert.equal(result.functions[0].path, 'src/main.ts');
  assert.equal(result.functions[0].name, 'exportCsv');
  assert.equal(result.coverage, 'partial');
  assert.deepEqual(result.skipped_files, [{ path: 'src/worker.go', reason: 'Unsupported language' }]);
});

void test('Upgrading graph seeds one repository node, preserves existing nodes, and keeps marker after validation', () => {
  const first = seedRepositoryReader(null, 'custom-123', ['linkedin-scanner']);
  const validated = validateDesignerGraph(first);
  assert.equal(validated.nodes[0].kind, 'repo-reader');
  assert.equal(validated.nodes[0].repoToolId, 'linkedin-scanner');
  assert.equal(validated.repoReaderSeeded, true);
  assert.deepEqual(seedRepositoryReader(validated, 'custom-123', []), validated);
});

const originalFetch = globalThis.fetch;
const originalPat = process.env.LINKEDIN_SCANNER_PAT;
const originalDb = process.env.DATABASE_URL;
const database = globalThis as typeof globalThis & { toolhubPool?: Pool };
const originalPool = database.toolhubPool;
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalPat === undefined) delete process.env.LINKEDIN_SCANNER_PAT; else process.env.LINKEDIN_SCANNER_PAT = originalPat;
  if (originalDb === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = originalDb;
  database.toolhubPool = originalPool;
});

void test('snapshot download pins the archive to the discovered commit and rejects a bad credential before network access', async () => {
  process.env.LINKEDIN_SCANNER_PAT = 'test-pat';
  const commit = 'a'.repeat(40);
  const urls: string[] = [];
  globalThis.fetch = async (url, init) => {
    urls.push(typeof url === 'string' ? url : url instanceof URL ? url.href : url.url);
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-pat');
    return urls.length === 1 ? Response.json([{ sha: commit }]) : new Response(new Uint8Array([1, 2]));
  };
  assert.equal((await scannerRepositoryArchive()).commit, commit);
  assert.ok(urls[1].endsWith(`/zipball/${commit}`));
  process.env.LINKEDIN_SCANNER_PAT = 'bad\nkey';
  await assert.rejects(() => scannerRepositoryArchive(), /invalid characters/);
  assert.equal(urls.length, 2);
});

void test('repo reader refuses revoked tool access before downloading code or calling a model', async () => {
  process.env.DATABASE_URL = 'mock-only';
  database.toolhubPool = { query: async () => ({ rows: [] }) } as unknown as Pool;
  let requested = false;
  globalThis.fetch = async () => { requested = true; throw new Error('Unexpected network access'); };
  await assert.rejects(() => readAgentRepository('developer', 'linkedin-scanner'), /enabled in this agent card/);
  assert.equal(requested, false);
});

void test('authorized node scans GitHub snapshot with no model requests and no index dependency', async () => {
  process.env.DATABASE_URL = 'mock-only';
  process.env.LINKEDIN_SCANNER_PAT = 'test-pat';
  const zip = new JSZip();
  zip.file('repo-commit/app.py', 'def connect():\n    return True\n');
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  database.toolhubPool = { query: async (sql: string) => ({ rows: sql.includes('FROM imported_tools') ? [{ id: 'linkedin-scanner' }] : [{ id: 'developer', name: 'Upgrading Agent', role: 'Developer', mission: 'Upgrade', tool_ids: ['linkedin-scanner'] }] }) } as unknown as Pool;
  const requests: string[] = [];
  globalThis.fetch = async input => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    requests.push(url);
    assert.ok(url.startsWith('https://api.github.com/repos/'));
    return url.includes('/commits?') ? Response.json([{ sha: 'b'.repeat(40) }]) : new Response(Buffer.from(bytes));
  };
  const result = await readAgentRepository('developer', 'linkedin-scanner', 'connect');
  assert.equal(result.model_calls, 0);
  assert.equal(result.functions[0].name, 'connect');
  assert.equal(result.commit, 'b'.repeat(40));
  assert.equal(requests.length, 2);
});

void test('oversized source is reported as partial while smaller files still scan', async () => {
  const zip = new JSZip();
  zip.file('repo/src/large.ts', '// padding\n'.repeat(60000));
  zip.file('repo/src/small.ts', 'function send() {}');
  const result = await analyzeRepositoryArchive(await zip.generateAsync({ type: 'uint8array' }), '');
  assert.equal(result.scanned_files, 1);
  assert.equal(result.coverage, 'partial');
  assert.equal(result.skipped_files[0].reason, 'File size limit');
  assert.equal(result.functions[0].name, 'send');
});

void test('search matches function body after its display excerpt and does not store full source', () => {
  const functions = extractFunctions({ path: 'a.ts', content: `function task() {\n${'// filler\n'.repeat(60)}return exportCsv();\n}` }).functions;
  const result = searchFunctions(functions, 'export csv');
  assert.equal(result[0].name, 'task');
  assert.equal(result[0].searchText, undefined);
});

void test('loading the Upgrading Agent graph creates and persists its node exactly once', async () => {
  process.env.DATABASE_URL = 'mock-only';
  let saved: DesignerGraphDocument | null = null;
  let writes = 0;
  database.toolhubPool = { query: async (sql: string, values?: unknown[]) => {
    if (sql.includes('FROM agent_cards')) return { rows: [{ id: 'developer', name: 'Upgrading Agent', role: 'Developer', mission: 'Upgrade', tool_ids: ['linkedin-scanner'] }] };
    if (sql.startsWith('INSERT INTO designer_graphs')) { saved = values![1] as DesignerGraphDocument; writes++; return { rows: [{ revision: '1' }] }; }
    if (sql.includes('FROM designer_graphs')) return { rows: saved ? [{ document: saved, revision: '1' }] : [] };
    throw new Error(`Unexpected query: ${sql}`);
  } } as unknown as Pool;
  const first = await getDesignerGraph('developer');
  assert.equal(first.document?.nodes[0].name, 'Read Repository');
  const second = await getDesignerGraph('developer');
  assert.equal(second.document?.nodes.length, 6);
  assert.equal(second.document?.nodes[1].kind, 'think');
  assert.equal(second.document?.thinkSeeded, true);
  assert.equal(writes, 1);
  assert.equal(validateDesignerGraph({ ...second.document, nodes: [...second.document!.nodes, { ...second.document!.nodes[0], id: 'source', kind: 'agent' }], links: [{ source: 'source', target: second.document!.nodes[0].id, command: 'input' }] }).linkMode, 'visual');
});

void test('Think seeds once into an existing Upgrading graph without changing visual links', () => {
  const graph = seedRepositoryReader(null, 'developer', ['linkedin-scanner']);
  const seeded = seedThinkNode(graph, 'developer');
  assert.equal(seeded.nodes[1].kind, 'think');
  assert.equal(seeded.nodes[1].x, graph.nodes[0].x + 220);
  assert.deepEqual(seeded.links, graph.links);
  assert.equal(validateDesignerGraph(seeded).thinkSeeded, true);
  assert.deepEqual(seedThinkNode(seeded, 'developer'), seeded);
  assert.equal(seedThinkNode({ ...seeded, nodes: [seeded.nodes[0]] }, 'developer').nodes.length, 1);
});

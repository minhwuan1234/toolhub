import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractFunctions, type RepositorySource } from '../lib/repository-functions';
import { groupRepositoryFlows } from '../lib/repository-ui-flows';
import { repositoryReplayQuery } from '../lib/server/repository-reader';

function group(files: Record<string, string>, query = '') {
  const sources: RepositorySource[] = Object.entries(files).map(([path, content]) => ({ path, content }));
  return groupRepositoryFlows(sources, sources.flatMap(source => extractFunctions(source).functions), query);
}

void test('UI flow follows selected handlers, HTTP route, service and SQL schema', () => {
  const result = group({
    'src/app/connect/page.tsx': `import { sendInvitation } from '../../handlers'; export default function ConnectPage() { return <button onClick={sendInvitation}>Connect</button>; }`,
    'src/handlers.ts': `export async function sendInvitation() { return fetch('/api/connect', {method: 'POST'}); }\nexport function unrelated() { return fetch('/api/delete'); }`,
    'src/app/api/connect/route.ts': `import { createInvitation } from '../../../service'; export async function POST() { return createInvitation(); }`,
    'src/service.ts': `export function createInvitation() { return db.from('invitations').select('id,status').eq('status', 'pending'); }\nexport function deleteEverything() { return db.from('other').delete(); }`,
    'supabase/schema.sql': `CREATE TABLE public.invitations (id uuid, status text, PRIMARY KEY (id));`,
  }, 'connect');
  const flow = result.groups.find(flow => flow.root === 'src/app/connect/page.tsx')!;
  assert.ok(flow);
  assert.ok(flow.functions.some(fn => fn.name === 'sendInvitation'));
  assert.ok(flow.functions.some(fn => fn.name === 'createInvitation'));
  assert.ok(!flow.functions.some(fn => fn.name === 'unrelated' || fn.name === 'deleteEverything'));
  assert.deepEqual(flow.endpoints.map(route => `${route.method} ${route.route}`), ['POST /api/connect']);
  assert.deepEqual(flow.database.map(ref => ref.table), ['invitations']);
  assert.deepEqual(flow.database[0].schemaFiles, ['supabase/schema.sql']);
  assert.deepEqual(flow.database[0].schemaColumns, ['id', 'status']);
  assert.ok(flow.functions.every(fn => fn.searchText === undefined));
});

void test('shared UI imports are marked and missing routes remain unresolved', () => {
  const result = group({
    'pages/one.tsx': `import Button from '../Button'; export default function One() { return <Button/>; }`,
    'pages/two.tsx': `import Button from '../Button'; export default function Two() { return <Button/>; }`,
    'Button.tsx': `export default function Button() { return <button onClick={() => fetch('/unknown')}>Save</button>; }`,
  });
  const flows = result.groups.filter(flow => flow.kind === 'screen');
  assert.equal(flows.length, 2);
  for (const flow of flows) {
    assert.equal(flow.files.find(file => file.path === 'Button.tsx')?.shared, true);
    assert.ok(flow.unresolved.includes('Unresolved API: GET /unknown'));
    assert.deepEqual(flow.database, []);
  }
});

void test('HTML scripts retain source lines and template flow follows Python renderer', () => {
  const files = {
    'templates/home.html': `<h1>Home</h1>\n<script>\nfunction save() { return fetch('/save', {method: 'POST'}); }\n</script>`,
    'app.py': `@app.get('/')\ndef home():\n    return render_template('home.html')\n\n@app.post('/save')\ndef save():\n    return db.table('items').select('id')\n`,
  };
  assert.equal(extractFunctions({ path: 'templates/home.html', content: files['templates/home.html'] }).functions[0].startLine, 3);
  const flow = group(files).groups.find(flow => flow.root === 'templates/home.html')!;
  assert.ok(flow.functions.some(fn => fn.name === 'home'));
  assert.ok(flow.functions.some(fn => fn.path === 'app.py' && fn.name === 'save'));
  assert.equal(flow.database[0].table, 'items');
});

void test('backend-only repository still exposes matching groups', () => {
  assert.equal(group({ 'worker.py': 'def send_message():\n    return True\n' }, 'message').groups[0].kind, 'backend');
});

void test('Play reuses only model-generated queries, ignoring legacy manual values', () => {
  assert.deepEqual(repositoryReplayQuery('{"query":"message"}'), { query: '', query_source: 'exploration' });
  assert.deepEqual(repositoryReplayQuery('{"query":"connect", "query_source":"model"}'), { query: 'connect', query_source: 'model' });
  assert.equal(repositoryReplayQuery('bad json').query, '');
});

void test('comments cannot create API or database relationships and dynamic calls are marked', () => {
  const flow = group({ 'page.tsx': `export default function Page() {
    // fetch('/fake'); db.from('fake');
    /* fetch('/also-fake'); db.from('also_fake'); */
    return <button onClick={() => fetch(endpoint)}>Send</button>;
  }` }).groups[0];
  assert.deepEqual(flow.endpoints, []);
  assert.deepEqual(flow.database, []);
  assert.ok(flow.unresolved.includes('Dynamic API request in page.tsx'));
  assert.ok(!flow.unresolved.some(item => item.includes('fake')));
});

import JSZip from 'jszip';
import { Readable } from 'node:stream';
import { excludedSource, type RepositorySource } from '../repository-functions';
import { getAgentCard } from './agent-cards';
import { listImportedTools } from './imported-tools';
import { scannerRepositoryArchive } from './linkedin-scanner';

// Fetch source text once; parsing, dependencies and classification belong to the See stages.
const providers: Record<string, () => Promise<{ repository: string; commit: string; bytes: Uint8Array }>> = {
  'linkedin-scanner': scannerRepositoryArchive,
};

export async function repositoryToolsForAgent(agentId: string) {
  const [card, imported] = await Promise.all([getAgentCard(agentId), listImportedTools()]);
  return imported.filter(tool => card?.toolIds.includes(tool.id) && providers[tool.id]).map(tool => ({ id: tool.id, name: tool.name }));
}

export async function readRepositoryArchive(bytes: Uint8Array, onSources?: (sources: RepositorySource[]) => void) {
  const zip = await JSZip.loadAsync(bytes);
  const entries = Object.values(zip.files).filter(file => !file.dir).sort((a, b) => a.name.localeCompare(b.name));
  if (entries.length > 30000) throw new Error('Repository has too many files for one scan.');
  const sources: RepositorySource[] = [];
  const skipped: Array<{ path: string; reason: string }> = [];
  const files: Array<{ path: string; bytes: number; lines: number }> = [];
  let scannedFiles = 0, ignoredFiles = 0, sourceBytes = 0;
  for (const entry of entries) {
    const path = entry.name.split('/').slice(1).join('/');
    if (!path || excludedSource.test(path)) { ignoredFiles++; continue; }
    const codeFile = /\.(?:[cm]?[jt]sx?|py|html?|css|scss|sass|less|sql|go|rs|java|rb|php|cs|[ch]|cpp|hpp|vue|svelte|sh|bash|zsh|json|toml|ya?ml|graphql|gql|prisma)$/i.test(path) || /(?:^|\/)(?:Dockerfile|Makefile)$/.test(path);
    if (!codeFile || /(?:^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(path)) { ignoredFiles++; continue; }
    if (scannedFiles >= 500 || sourceBytes >= 15_000_000) { skipped.push({ path, reason: 'Scan limit' }); continue; }
    let size = 0;
    const chunks: Buffer[] = [];
    const stream = new Readable().wrap(entry.nodeStream('nodebuffer'));
    let tooLarge = false;
    for await (const chunk of stream) {
      const buffer = Buffer.from(chunk);
      size += buffer.length;
      if (size > 500000 || sourceBytes + size > 15_000_000) { tooLarge = true; stream.destroy(); break; }
      chunks.push(buffer);
    }
    if (tooLarge) { skipped.push({ path, reason: 'File size limit' }); continue; }
    sourceBytes += size;
    const content = Buffer.concat(chunks).toString('utf8');
    if (content.includes('\0')) { skipped.push({ path, reason: 'Binary file' }); continue; }
    sources.push({ path, content });
    files.push({ path, bytes: size, lines: content.split('\n').length });
    scannedFiles++;
  }
  const result = {
    operation: 'fetch_code_snapshot', model_calls: 0,
    scanned_files: scannedFiles, ignored_files: ignoredFiles, source_bytes: sourceBytes,
    coverage: skipped.length ? 'partial' : 'complete',
    skipped_files: skipped.slice(0, 100), skipped_file_count: skipped.length,
    files, returned_files: files.length, truncated: false,
  };
  while (JSON.stringify(result).length > 170000 && result.files.length) { result.files.pop(); result.truncated = true; }
  result.returned_files = result.files.length;
  onSources?.(sources);
  return result;
}

export async function readAgentRepository(agentId: string, toolId: string, onRead?: (result: Awaited<ReturnType<typeof readRepositoryArchive>> & { tool_id: string; repository: string; commit: string; scanned_at: string }, sources: RepositorySource[]) => Promise<void>) {
  const tools = await repositoryToolsForAgent(agentId);
  const selected = toolId || (tools.length === 1 ? tools[0].id : '');
  if (!selected || !tools.some(tool => tool.id === selected)) throw new Error('Select a repository tool enabled in this agent card.');
  const snapshot = await providers[selected]();
  let sources: RepositorySource[] = [];
  const result = { tool_id: selected, repository: snapshot.repository, commit: snapshot.commit, scanned_at: new Date().toISOString(), ...await readRepositoryArchive(snapshot.bytes, value => { sources = value; }) };
  await onRead?.(result, sources);
  return result;
}

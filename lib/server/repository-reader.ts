import JSZip from 'jszip';
import { Readable } from 'node:stream';
import { excludedSource, extractFunctions, searchFunctions, supportedSource, type RepositoryFunction, type RepositorySource } from '../repository-functions';
import { groupRepositoryFlows } from '../repository-ui-flows';
import { getAgentCard } from './agent-cards';
import { listImportedTools } from './imported-tools';
import { scannerRepositoryArchive } from './linkedin-scanner';

// Providers supply a snapshot; the parser and search algorithm are shared by all tools.
const providers: Record<string, () => Promise<{ repository: string; commit: string; bytes: Uint8Array }>> = {
  'linkedin-scanner': scannerRepositoryArchive,
};

export function repositoryReplayQuery(output: string | undefined): { query: string; query_source: 'model' | 'exploration' } {
  try {
    const value = JSON.parse(output || '') as { query?: unknown; query_source?: unknown };
    if (value.query_source === 'model' && typeof value.query === 'string' && value.query.length <= 500) return { query: value.query, query_source: 'model' };
  } catch { /* Older manually entered search values are not model input. */ }
  return { query: '', query_source: 'exploration' };
}

export async function repositoryToolsForAgent(agentId: string) {
  const [card, imported] = await Promise.all([getAgentCard(agentId), listImportedTools()]);
  return imported.filter(tool => card?.toolIds.includes(tool.id) && providers[tool.id]).map(tool => ({ id: tool.id, name: tool.name }));
}

export async function analyzeRepositoryArchive(bytes: Uint8Array, query: string, onSources?: (sources: RepositorySource[]) => void) {
  const zip = await JSZip.loadAsync(bytes);
  const entries = Object.values(zip.files).filter(file => !file.dir).sort((a, b) => a.name.localeCompare(b.name));
  if (entries.length > 30000) throw new Error('Repository has too many files for one scan.');
  const functions: RepositoryFunction[] = [];
  const sources: RepositorySource[] = [];
  const skipped: Array<{ path: string; reason: string }> = [];
  const errors: string[] = [];
  let scannedFiles = 0, ignoredFiles = 0, sourceBytes = 0;
  for (const entry of entries) {
    const path = entry.name.split('/').slice(1).join('/');
    if (!path || excludedSource.test(path)) { ignoredFiles++; continue; }
    const asset = /\.(?:html?|css|sql)$/i.test(path);
    if (!supportedSource.test(path) && !asset) {
      if (/\.(?:go|rs|java|rb|php|cs|c|cpp|vue|svelte)$/i.test(path)) skipped.push({ path, reason: 'Unsupported language' });
      else ignoredFiles++;
      continue;
    }
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
    const result = supportedSource.test(path) || /\.html?$/i.test(path) ? extractFunctions({ path, content }) : { functions: [], errors: [] };
    functions.push(...result.functions);
    errors.push(...result.errors);
    scannedFiles++;
  }
  const ranked = searchFunctions(functions, query, functions.length);
  const grouped = groupRepositoryFlows(sources, functions, query);
  const result = {
    algorithm: 'UI entry traversal + static imports, API routes and database references', model_calls: 0,
    supported_languages: ['JavaScript', 'TypeScript', 'JSX', 'TSX', 'Python'],
    query, scanned_files: scannedFiles, ignored_files: ignoredFiles, total_functions: functions.length,
    matched_functions: ranked.length, returned_functions: Math.min(200, ranked.length),
    truncated: ranked.length > 200, coverage: skipped.length || errors.length ? 'partial' : 'complete',
    skipped_files: skipped.slice(0, 100), skipped_file_count: skipped.length,
    errors: errors.slice(0, 100), functions: ranked.slice(0, 200),
    ...grouped, returned_groups: grouped.groups.length, groups_truncated: grouped.total_groups > grouped.groups.length,
  };
  while (JSON.stringify(result).length > 175000) {
    if (result.functions.length > 25) { result.functions.pop(); result.truncated = true; }
    else if (result.groups.length > 1) { result.groups.pop(); result.groups_truncated = true; }
    else if (result.groups[0]?.functions.length > 5) { result.groups[0].functions.pop(); result.groups[0].truncated = true; }
    else if (result.functions.length) { result.functions.pop(); result.truncated = true; }
    else if (result.groups.length) { result.groups.pop(); result.groups_truncated = true; }
    else break;
  }
  result.returned_functions = result.functions.length;
  result.returned_groups = result.groups.length;
  onSources?.(sources);
  return result;
}

export async function readAgentRepository(agentId: string, toolId: string, query = '', onRead?: (result: Awaited<ReturnType<typeof analyzeRepositoryArchive>> & { tool_id: string; repository: string; commit: string; scanned_at: string }, sources: RepositorySource[]) => Promise<void>) {
  if (query.length > 500) throw new Error('Search query is too long.');
  const tools = await repositoryToolsForAgent(agentId);
  const selected = toolId || (tools.length === 1 ? tools[0].id : '');
  if (!selected || !tools.some(tool => tool.id === selected)) throw new Error('Select a repository tool enabled in this agent card.');
  const snapshot = await providers[selected]();
  let sources: RepositorySource[] = [];
  const result = { tool_id: selected, repository: snapshot.repository, commit: snapshot.commit, scanned_at: new Date().toISOString(), ...await analyzeRepositoryArchive(snapshot.bytes, query, value => { sources = value; }) };
  await onRead?.(result, sources);
  return result;
}

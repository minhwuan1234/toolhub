import JSZip from 'jszip';
import { Readable } from 'node:stream';
import { excludedSource, extractFunctions, searchFunctions, supportedSource, type RepositoryFunction } from '../repository-functions';
import { getAgentCard } from './agent-cards';
import { listImportedTools } from './imported-tools';
import { scannerRepositoryArchive } from './linkedin-scanner';

// Providers supply a snapshot; the parser and search algorithm are shared by all tools.
const providers: Record<string, () => Promise<{ repository: string; commit: string; bytes: Uint8Array }>> = {
  'linkedin-scanner': scannerRepositoryArchive,
};

export async function repositoryToolsForAgent(agentId: string) {
  const [card, imported] = await Promise.all([getAgentCard(agentId), listImportedTools()]);
  return imported.filter(tool => card?.toolIds.includes(tool.id) && providers[tool.id]).map(tool => ({ id: tool.id, name: tool.name }));
}

export async function analyzeRepositoryArchive(bytes: Uint8Array, query: string) {
  const zip = await JSZip.loadAsync(bytes);
  const entries = Object.values(zip.files).filter(file => !file.dir).sort((a, b) => a.name.localeCompare(b.name));
  if (entries.length > 30000) throw new Error('Repository has too many files for one scan.');
  const functions: RepositoryFunction[] = [];
  const skipped: Array<{ path: string; reason: string }> = [];
  const errors: string[] = [];
  let scannedFiles = 0, ignoredFiles = 0, sourceBytes = 0;
  for (const entry of entries) {
    const path = entry.name.split('/').slice(1).join('/');
    if (!path || excludedSource.test(path)) { ignoredFiles++; continue; }
    if (!supportedSource.test(path)) {
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
    const result = extractFunctions({ path, content });
    functions.push(...result.functions);
    errors.push(...result.errors);
    scannedFiles++;
  }
  const ranked = searchFunctions(functions, query, functions.length);
  const result = {
    algorithm: 'Syntax parsing + weighted keyword search', model_calls: 0,
    supported_languages: ['JavaScript', 'TypeScript', 'JSX', 'TSX', 'Python'],
    query, scanned_files: scannedFiles, ignored_files: ignoredFiles, total_functions: functions.length,
    matched_functions: ranked.length, returned_functions: Math.min(200, ranked.length),
    truncated: ranked.length > 200, coverage: skipped.length || errors.length ? 'partial' : 'complete',
    skipped_files: skipped.slice(0, 100), skipped_file_count: skipped.length,
    errors: errors.slice(0, 100), functions: ranked.slice(0, 200),
  };
  while (JSON.stringify(result).length > 175000 && result.functions.length) {
    result.functions.pop(); result.truncated = true;
  }
  result.returned_functions = result.functions.length;
  return result;
}

export async function readAgentRepository(agentId: string, toolId: string, query = '') {
  if (query.length > 500) throw new Error('Search query is too long.');
  const tools = await repositoryToolsForAgent(agentId);
  const selected = toolId || (tools.length === 1 ? tools[0].id : '');
  if (!selected || !tools.some(tool => tool.id === selected)) throw new Error('Select a repository tool enabled in this agent card.');
  const snapshot = await providers[selected]();
  return { tool_id: selected, repository: snapshot.repository, commit: snapshot.commit, scanned_at: new Date().toISOString(), ...await analyzeRepositoryArchive(snapshot.bytes, query) };
}

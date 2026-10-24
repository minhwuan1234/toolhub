import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import type { RepositorySource } from '../repository-functions';
export type PythonFacts = { calls: string[]; signals: string[]; tables?: string[]; requests?: string[]; definitions?: string[] };
export type PythonFileAnalysis = { path: string; error?: string; imports?: Array<{ specifier: string; names: Array<{ local: string; imported: string }> }>; functions?: Array<PythonFacts & { name: string; kind: string; startLine: number; endLine: number }>; module?: PythonFacts };

export async function parsePythonSources(sources: RepositorySource[], signal?: AbortSignal): Promise<PythonFileAnalysis[]> {
  const files = sources.filter(source => source.path.endsWith('.py'));
  if (!files.length) return [];
  try {
    const result = await new Promise<string>((accept, reject) => {
      // Fixed parser + stdin data; source is never evaluated or imported.
      const process = spawn('python3', ['-I', '-S', resolve('scripts/parse-python-ast.py')], { stdio: ['pipe', 'pipe', 'pipe'], signal, timeout: 15000 });
      const chunks: Buffer[] = [];
      let bytes = 0;
      process.stdout.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > 16_000_000) { process.kill(); reject(new Error('Python AST output limit')); } else chunks.push(chunk); });
      process.stderr.resume();
      process.stdin.on('error', reject);
      process.on('error', reject);
      process.on('close', code => code === 0 ? accept(Buffer.concat(chunks).toString('utf8')) : reject(new Error('Python AST parser failed')));
      process.stdin.end(JSON.stringify(files));
    });
    return JSON.parse(result) as PythonFileAnalysis[];
  } catch {
    signal?.throwIfAborted();
    return files.map(file => ({ path: file.path, error: 'Python AST parser unavailable or resource limit reached' }));
  }
}

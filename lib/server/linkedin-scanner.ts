const repository = 'minhwuan1234/linkedin-daily-scanner';
const githubApi = `https://api.github.com/repos/${repository}`;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured on the Toolhub backend.`);
  return value;
}

function safePath(path: string): string {
  if (path === '') return '';
  const parts = path.split('/');
  if (!path || parts.some(part => !part || part === '.' || part === '..' || !/^[\w. -]+$/.test(part))) {
    throw new Error('Invalid repository path.');
  }
  return parts.map(encodeURIComponent).join('/');
}

async function githubRequest(path: string, init: RequestInit = {}): Promise<unknown> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/vnd.github+json');
  headers.set('Authorization', `Bearer ${required('LINKEDIN_SCANNER_PAT')}`);
  headers.set('X-GitHub-Api-Version', '2022-11-28');
  const response = await fetch(`${githubApi}/contents/${safePath(path)}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`GitHub request failed (${response.status}).`);
  return data;
}

export async function readScannerFile(path: string): Promise<{ path: string; sha: string; content: string }> {
  if (!path) throw new Error('File path is required.');
  const value = await githubRequest(path) as { type?: string; sha?: string; content?: string; encoding?: string };
  if (Array.isArray(value) || value.type === 'dir') throw new Error('This path is a GitHub directory. Use scanner_list_files to inspect it, then read a specific text file.');
  if (value.type !== 'file' || value.encoding !== 'base64' || !value.sha || !value.content) throw new Error('GitHub did not return readable inline text for this file. Choose a smaller text file or use scanner_table for Supabase rows.');
  return { path, sha: value.sha, content: Buffer.from(value.content.replace(/\s/g, ''), 'base64').toString('utf8') };
}

export async function listScannerPath(path: string): Promise<Array<{ path: string; type: string; sha: string }>> {
  const value = await githubRequest(path);
  if (!Array.isArray(value)) throw new Error('Path is not a directory.');
  return value.map(item => ({ path: item.path, type: item.type, sha: item.sha }));
}

export async function writeScannerFile(path: string, content: string, message: string, sha?: string): Promise<{ path: string; commit: string }> {
  if (!path) throw new Error('File path is required.');
  if (!content || content.length > 500_000) throw new Error('content must be between 1 and 500,000 characters.');
  if (!message.trim() || message.length > 200) throw new Error('commit message must be between 1 and 200 characters.');
  const result = await githubRequest(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: Buffer.from(content, 'utf8').toString('base64'), ...(sha ? { sha } : {}) }),
  }) as { commit?: { sha?: string } };
  return { path, commit: result.commit?.sha || '' };
}

type SupabaseMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

function supabaseBase(): URL {
  const base = new URL(required('LINKEDIN_SCANNER_SUPABASE_URL'));
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || (base.pathname !== '/' && base.pathname !== '')) throw new Error('Invalid Supabase project URL.');
  return base;
}

export async function listScannerTables(): Promise<Array<{ name: string; columns: string[] }>> {
  const response = await fetch(new URL('/rest/v1/', supabaseBase()), {
    headers: { apikey: required('LINKEDIN_SCANNER_SUPABASE_SECRET_KEY'), Accept: 'application/openapi+json' },
    signal: AbortSignal.timeout(15000),
  });
  const schema = await response.json().catch(() => null) as { definitions?: Record<string, { properties?: Record<string, unknown> }>; paths?: Record<string, unknown> } | null;
  if (!response.ok || !schema || typeof schema !== 'object') throw new Error(`Supabase table discovery failed (${response.status}).`);
  const definitions = schema.definitions || {};
  const paths = schema.paths || {};
  return Object.keys(paths).filter(path => /^\/[a-zA-Z_][a-zA-Z_0-9]*$/.test(path)).slice(0, 100).map(path => ({ name: path.slice(1), columns: Object.keys(definitions[path.slice(1)]?.properties || {}).slice(0, 100) }));
}

export async function scannerTableRequest(table: string, method: SupabaseMethod, query: Record<string, string>, body?: unknown): Promise<unknown> {
  if (!/^[a-zA-Z_][a-zA-Z_0-9]*$/.test(table)) throw new Error('Invalid table name.');
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method)) throw new Error('Invalid database method.');
  if (Object.keys(query).length > 20 || Object.entries(query).some(([key, value]) => !/^[\w.]+$/.test(key) || typeof value !== 'string' || value.length > 1000)) throw new Error('Invalid query parameters.');
  if ((method === 'PATCH' || method === 'DELETE') && !Object.keys(query).some(key => !['select', 'order', 'limit', 'offset'].includes(key))) {
    throw new Error('Update and delete require a row filter.');
  }
  if ((method === 'POST' || method === 'PATCH') && (body === undefined || JSON.stringify(body).length > 100_000)) throw new Error('A JSON body under 100,000 characters is required.');
  const base = supabaseBase();
  const url = new URL(`/rest/v1/${table}`, base);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  if (method === 'GET' && !url.searchParams.has('limit')) url.searchParams.set('limit', '100');
  const key = required('LINKEDIN_SCANNER_SUPABASE_SECRET_KEY');
  const response = await fetch(url, {
    method,
    headers: { apikey: key, Accept: 'application/json', Prefer: 'return=representation', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Supabase request failed (${response.status}): ${result && typeof result === 'object' && 'message' in result ? String(result.message).slice(0, 300) : 'Request rejected.'}`);
  return result;
}

export function scannerConnectionStatus() {
  return {
    repository,
    githubConfigured: Boolean(process.env.LINKEDIN_SCANNER_PAT?.trim()),
    supabaseConfigured: Boolean(process.env.LINKEDIN_SCANNER_SUPABASE_URL?.trim() && process.env.LINKEDIN_SCANNER_SUPABASE_SECRET_KEY?.trim()),
  };
}

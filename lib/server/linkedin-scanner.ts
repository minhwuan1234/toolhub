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
  const response = await fetch(`${githubApi}/contents/${safePath(path)}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${required('LINKEDIN_SCANNER_PAT')}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...init.headers,
    },
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`GitHub request failed (${response.status}).`);
  return data;
}

export async function readScannerFile(path: string): Promise<{ path: string; sha: string; content: string }> {
  if (!path) throw new Error('File path is required.');
  const value = await githubRequest(path) as { type?: string; sha?: string; content?: string; encoding?: string };
  if (value.type !== 'file' || value.encoding !== 'base64' || !value.sha || !value.content) throw new Error('Path is not a readable text file.');
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

export async function scannerTableRequest(table: string, method: SupabaseMethod, query: Record<string, string>, body?: unknown): Promise<unknown> {
  if (!/^[a-zA-Z_][a-zA-Z_0-9]*$/.test(table)) throw new Error('Invalid table name.');
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method)) throw new Error('Invalid database method.');
  if (Object.keys(query).length > 20 || Object.entries(query).some(([key, value]) => !/^[\w.]+$/.test(key) || typeof value !== 'string' || value.length > 1000)) throw new Error('Invalid query parameters.');
  if ((method === 'PATCH' || method === 'DELETE') && !Object.keys(query).some(key => !['select', 'order', 'limit', 'offset'].includes(key))) {
    throw new Error('Update and delete require a row filter.');
  }
  if ((method === 'POST' || method === 'PATCH') && (body === undefined || JSON.stringify(body).length > 100_000)) throw new Error('A JSON body under 100,000 characters is required.');
  const base = new URL(required('LINKEDIN_SCANNER_SUPABASE_URL'));
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || (base.pathname !== '/' && base.pathname !== '')) throw new Error('Invalid Supabase project URL.');
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

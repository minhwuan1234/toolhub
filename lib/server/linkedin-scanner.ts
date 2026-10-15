const repository = 'minhwuan1234/linkedin-daily-scanner';
const githubApi = `https://api.github.com/repos/${repository}`;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured on the Toolhub backend.`);
  return value;
}

function credential(name: 'LINKEDIN_SCANNER_PAT' | 'LINKEDIN_SCANNER_SUPABASE_SECRET_KEY'): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured on the Toolhub backend.`);
  if (!/^[A-Za-z0-9._~-]+$/.test(value)) throw new Error(`${name} contains invalid characters. Set the raw key as one line without quotes, spaces, or line breaks.`);
  return value;
}

function redactCredentials(message: string): string {
  let safe = message;
  for (const name of ['LINKEDIN_SCANNER_PAT', 'LINKEDIN_SCANNER_SUPABASE_SECRET_KEY'] as const) {
    const value = process.env[name];
    if (value) safe = safe.replaceAll(value, '[redacted]');
  }
  return safe.replace(/sb_secret_[A-Za-z0-9._~-]{8,}/g, '[redacted]');
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
  headers.set('Authorization', `Bearer ${credential('LINKEDIN_SCANNER_PAT')}`);
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
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || !['/', '', '/rest/v1', '/rest/v1/'].includes(base.pathname)) throw new Error('LINKEDIN_SCANNER_SUPABASE_URL must be a project URL or its /rest/v1 endpoint.');
  base.pathname = '/';
  return base;
}

function supabaseError(status: number, result: unknown, operation: string): Error {
  const details = result && typeof result === 'object' ? result as Record<string, unknown> : {};
  const code = typeof details.code === 'string' && /^[\w-]{1,60}$/.test(details.code) ? `, ${details.code}` : '';
  const message = typeof details.message === 'string' ? redactCredentials(details.message.slice(0, 300)) : '';
  return new Error(`${operation} failed (HTTP ${status}${code})${message ? `: ${message}` : '.'}`);
}

export async function listScannerTables(): Promise<Array<{ name: string; columns: string[] }>> {
  const response = await fetch(new URL('/rest/v1/', supabaseBase()), {
    headers: { apikey: credential('LINKEDIN_SCANNER_SUPABASE_SECRET_KEY'), Accept: 'application/openapi+json' },
    signal: AbortSignal.timeout(15000),
  });
  const schema = await response.json().catch(() => null) as { definitions?: Record<string, { properties?: Record<string, unknown> }>; paths?: Record<string, unknown> } | null;
  if (!response.ok) throw supabaseError(response.status, schema, 'Supabase table discovery');
  if (!schema || typeof schema !== 'object' || !schema.paths) throw new Error('Supabase table discovery returned no OpenAPI schema. Check that the Data API is enabled.');
  const definitions = schema.definitions || {};
  const paths = schema.paths || {};
  return Object.keys(paths).filter(path => /^\/[a-zA-Z_][a-zA-Z_0-9]*$/.test(path)).slice(0, 100).map(path => ({ name: path.slice(1), columns: Object.keys(definitions[path.slice(1)]?.properties || {}).slice(0, 100) }));
}

export async function sentScannerConnectsToday(now = new Date()): Promise<{ date: string; timezone: string; count: number; rows: unknown[] }> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const datePart = (type: string) => parts.find(part => part.type === type)?.value;
  const date = `${datePart('year')}-${datePart('month')}-${datePart('day')}`;
  const start = new Date(`${date}T00:00:00+07:00`);
  const end = new Date(start.getTime() + 86_400_000);
  const rows = await scannerTableRequest('outreach_prospects', 'GET', {
    select: 'id,linkedin_url,normalized_url,connect_status,last_connect_attempt_at',
    connect_status: 'eq.invitation_sent',
    and: `(last_connect_attempt_at.gte.${start.toISOString()},last_connect_attempt_at.lt.${end.toISOString()})`,
    order: 'last_connect_attempt_at.desc',
    limit: '1000',
  });
  if (!Array.isArray(rows)) throw new Error('Supabase returned an invalid sent Connect list.');
  return { date, timezone: 'Asia/Ho_Chi_Minh', count: rows.length, rows };
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
  const key = credential('LINKEDIN_SCANNER_SUPABASE_SECRET_KEY');
  const response = await fetch(url, {
    method,
    headers: { apikey: key, Accept: 'application/json', Prefer: 'return=representation', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw supabaseError(response.status, result, 'Supabase table request');
  return result;
}

export function scannerConnectionStatus() {
  return {
    repository,
    githubConfigured: Boolean(process.env.LINKEDIN_SCANNER_PAT?.trim()),
    supabaseConfigured: Boolean(process.env.LINKEDIN_SCANNER_SUPABASE_URL?.trim() && process.env.LINKEDIN_SCANNER_SUPABASE_SECRET_KEY?.trim()),
  };
}

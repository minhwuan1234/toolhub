import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { listScannerPath, listScannerTables, readScannerFile, scannerTableRequest, writeScannerFile } from '../lib/server/linkedin-scanner';

const originalFetch = globalThis.fetch;
const originalPat = process.env.LINKEDIN_SCANNER_PAT;
const originalUrl = process.env.LINKEDIN_SCANNER_SUPABASE_URL;
const originalKey = process.env.LINKEDIN_SCANNER_SUPABASE_SECRET_KEY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalPat === undefined) delete process.env.LINKEDIN_SCANNER_PAT; else process.env.LINKEDIN_SCANNER_PAT = originalPat;
  if (originalUrl === undefined) delete process.env.LINKEDIN_SCANNER_SUPABASE_URL; else process.env.LINKEDIN_SCANNER_SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.LINKEDIN_SCANNER_SUPABASE_SECRET_KEY; else process.env.LINKEDIN_SCANNER_SUPABASE_SECRET_KEY = originalKey;
});

test('GitHub connector is pinned to scanner repository and uses configured PAT', async () => {
  process.env.LINKEDIN_SCANNER_PAT = 'test-pat';
  let requests = 0;
  globalThis.fetch = async (input, init) => {
    requests++;
    assert.equal(String(input), 'https://api.github.com/repos/minhwuan1234/linkedin-daily-scanner/contents/app/settings.py');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer test-pat');
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body));
      assert.equal(body.sha, 'existing-sha');
      assert.equal(Buffer.from(body.content, 'base64').toString('utf8'), 'updated');
      return Response.json({ commit: { sha: 'commit-sha' } });
    }
    return Response.json({ type: 'file', encoding: 'base64', sha: 'existing-sha', content: Buffer.from('original').toString('base64') });
  };
  assert.deepEqual(await readScannerFile('app/settings.py'), { path: 'app/settings.py', sha: 'existing-sha', content: 'original' });
  assert.deepEqual(await writeScannerFile('app/settings.py', 'updated', 'Update settings', 'existing-sha'), { path: 'app/settings.py', commit: 'commit-sha' });
  assert.equal(requests, 2);
  await assert.rejects(() => listScannerPath('../other-repo'), /Invalid repository path/);
  assert.equal(requests, 2);
});

test('Supabase connector requires a row filter for mutations and keeps key server side', async () => {
  process.env.LINKEDIN_SCANNER_SUPABASE_URL = 'https://scanner.supabase.co';
  process.env.LINKEDIN_SCANNER_SUPABASE_SECRET_KEY = 'test-secret';
  let calls = 0;
  globalThis.fetch = async (input, init) => {
    calls++;
    assert.equal(String(input), 'https://scanner.supabase.co/rest/v1/jobs?id=eq.123');
    assert.equal(new Headers(init?.headers).get('apikey'), 'test-secret');
    assert.equal(new Headers(init?.headers).get('Authorization'), null);
    assert.equal(init?.method, 'PATCH');
    return Response.json([{ id: 123, status: 'done' }]);
  };
  await assert.rejects(() => scannerTableRequest('jobs', 'DELETE', {}), /row filter/);
  assert.deepEqual(await scannerTableRequest('jobs', 'PATCH', { id: 'eq.123' }, { status: 'done' }), [{ id: 123, status: 'done' }]);
  assert.equal(calls, 1);
});

test('Supabase table discovery returns names and columns for choosing the right data source', async () => {
  process.env.LINKEDIN_SCANNER_SUPABASE_URL = 'https://scanner.supabase.co/rest/v1';
  process.env.LINKEDIN_SCANNER_SUPABASE_SECRET_KEY = 'test-secret';
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), 'https://scanner.supabase.co/rest/v1/');
    assert.equal(new Headers(init?.headers).get('Accept'), 'application/openapi+json');
    return Response.json({ paths: { '/connect_jobs': {}, '/rpc/do_work': {} }, definitions: { connect_jobs: { properties: { id: {}, sent_at: {} } } } });
  };
  assert.deepEqual(await listScannerTables(), [{ name: 'connect_jobs', columns: ['id', 'sent_at'] }]);
});

test('Supabase discovery reports the upstream HTTP status and error code', async () => {
  process.env.LINKEDIN_SCANNER_SUPABASE_URL = 'https://scanner.supabase.co';
  process.env.LINKEDIN_SCANNER_SUPABASE_SECRET_KEY = 'test-secret';
  globalThis.fetch = async () => Response.json({ code: 'PGRST301', message: 'Invalid API key' }, { status: 401 });
  await assert.rejects(() => listScannerTables(), /Supabase table discovery failed \(HTTP 401, PGRST301\): Invalid API key/);
});

test('malformed Supabase key is rejected before request without exposing its value', async () => {
  process.env.LINKEDIN_SCANNER_SUPABASE_URL = 'https://scanner.supabase.co';
  const secret = 'sb_secret_example\nsecond-line';
  process.env.LINKEDIN_SCANNER_SUPABASE_SECRET_KEY = secret;
  let requested = false;
  globalThis.fetch = async () => { requested = true; throw new Error('Request should not be sent.'); };
  await assert.rejects(() => listScannerTables(), error => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /LINKEDIN_SCANNER_SUPABASE_SECRET_KEY contains invalid characters/);
    assert.ok(!error.message.includes(secret));
    assert.ok(!error.message.includes('sb_secret_example'));
    return true;
  });
  assert.equal(requested, false);
});

test('Supabase response diagnostics redact an echoed secret', async () => {
  process.env.LINKEDIN_SCANNER_SUPABASE_URL = 'https://scanner.supabase.co';
  const secret = 'sb_secret_test-value';
  process.env.LINKEDIN_SCANNER_SUPABASE_SECRET_KEY = secret;
  globalThis.fetch = async () => Response.json({ message: `Rejected ${secret}` }, { status: 401 });
  await assert.rejects(() => listScannerTables(), error => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /Rejected \[redacted\]/);
    assert.ok(!error.message.includes(secret));
    return true;
  });
});

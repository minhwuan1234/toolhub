import { existsSync } from 'node:fs';
import { bootstrapAdmin } from './bootstrap-admin.mjs';
import { migrate } from './migrate.mjs';

// Only these application-owned messages may be logged. Driver errors can
// contain connection strings, SQL values or other private account data.
const safeMessages = new Set([
  'DATABASE_URL is required.',
  'DATABASE_URL must be a valid PostgreSQL connection URL.',
  'BETTER_AUTH_SECRET must contain at least 32 characters.',
  'BETTER_AUTH_URL must be a valid http:// or https:// app URL.',
  'BETTER_AUTH_URL must use HTTPS in production.',
  'Set both ADMIN_EMAIL and ADMIN_PASSWORD, or remove both.',
  'ADMIN_EMAIL must be a valid email address.',
  'ADMIN_PASSWORD must contain 12 to 128 characters.',
  'Bootstrap email is already registered.',
  'Unknown admin department.',
]);
const databaseErrors = {
  ENOTFOUND: 'Database hostname could not be resolved. Check the Postgres variable reference.',
  EAI_AGAIN: 'Database DNS lookup failed temporarily.',
  ECONNREFUSED: 'Database connection refused. Check the database service and port.',
  ETIMEDOUT: 'Database connection timed out.',
  '28P01': 'Database authentication failed. Check the DATABASE_URL reference.',
  '3D000': 'The configured database does not exist.',
  '42501': 'The database account lacks permission to apply migrations.',
  '42P01': 'A required database table is missing.',
  '23505': 'A database record conflicts with an existing unique value.',
  '23503': 'A database reference is invalid.',
  ERR_MODULE_NOT_FOUND: 'A required runtime module is missing from the deployment.',
};
let stage = 'configuration';
try {
  if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32) throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters.');
  let url;
  try { url = new URL(process.env.BETTER_AUTH_URL || ''); } catch { throw new Error('BETTER_AUTH_URL must be a valid http:// or https:// app URL.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('BETTER_AUTH_URL must be a valid http:// or https:// app URL.');
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error('BETTER_AUTH_URL must use HTTPS in production.');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  try {
    const db = new URL(process.env.DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(db.protocol) || !db.hostname) throw new Error();
  } catch { throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.'); }
  console.log('[startup] Configuration validated.');
  stage = 'database migration';
  console.log('[startup] Connecting to PostgreSQL and applying migrations.');
  await migrate();
  stage = 'admin bootstrap';
  console.log('[startup] Checking initial admin.');
  await bootstrapAdmin();
  stage = 'HTTP server';
  const dockerEntry = new URL('../server.js', import.meta.url);
  await import(existsSync(dockerEntry) ? dockerEntry.href : new URL('../dist/standalone/server.js', import.meta.url).href);
} catch (error) {
  const code = typeof error?.code === 'string' && /^[A-Z0-9_]{2,40}$/.test(error.code) ? error.code : undefined;
  const detail = safeMessages.has(error?.message) ? error.message : databaseErrors[code] || 'Unexpected failure. Check this deployment stage; private error details have been withheld.';
  console.error(`[startup] Failed at ${stage}${code ? ` (${code})` : ''}: ${detail}`);
  process.exitCode = 1;
}

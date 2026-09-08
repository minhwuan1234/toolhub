import { existsSync } from 'node:fs';
import { bootstrapAdmin } from './bootstrap-admin.mjs';
import { migrate } from './migrate.mjs';

try {
  if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 32) throw new Error('Set BETTER_AUTH_SECRET to a random secret of at least 32 characters.');
  const url = new URL(process.env.BETTER_AUTH_URL || '');
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error('BETTER_AUTH_URL must use HTTPS in production.');
  await migrate();
  await bootstrapAdmin();
  const dockerEntry = new URL('../server.js', import.meta.url);
  await import(existsSync(dockerEntry) ? dockerEntry.href : new URL('../dist/standalone/server.js', import.meta.url).href);
} catch {
  console.error('[startup] Failed. Verify DATABASE_URL, BETTER_AUTH_URL, BETTER_AUTH_SECRET and optional ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_DEPARTMENT; check migration access.');
  process.exitCode = 1;
}

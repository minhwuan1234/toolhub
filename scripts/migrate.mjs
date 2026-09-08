import { Pool } from 'pg';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export async function migrate(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL is required.');
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10000 });
  let client;
  try {
    client = await pool.connect();
    // Serialize schema changes if two Railway replicas start together.
    await client.query('SELECT pg_advisory_lock(782041928)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    const dir = new URL('../db/migrations/', import.meta.url);
    for (const file of (await readdir(dir)).filter(name => name.endsWith('.sql')).sort()) {
      const sql = await readFile(new URL(file, dir), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const previous = await client.query('SELECT checksum FROM schema_migrations WHERE name = $1', [file]);
      if (previous.rowCount) {
        if (previous.rows[0].checksum !== checksum) throw new Error(`Migration changed after application: ${file}`);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [file, checksum]);
        await client.query('COMMIT');
        console.log(`[database] Applied ${file}`);
      } catch (error) { await client.query('ROLLBACK'); throw error; }
    }
  } finally {
    if (client) {
      await client.query('SELECT pg_advisory_unlock(782041928)').catch(() => {});
      client.release();
    }
    await pool.end();
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate().catch(() => { console.error('[database] Migration failed. Check DATABASE_URL and schema access.'); process.exitCode = 1; });
}

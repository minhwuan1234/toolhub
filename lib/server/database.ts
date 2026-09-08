import { Pool } from 'pg';

const globalDatabase = globalThis as typeof globalThis & { toolhubPool?: Pool };

export function getDatabase() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  if (!globalDatabase.toolhubPool) {
    globalDatabase.toolhubPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    });
    // Never log a connection string or raw query parameters.
    globalDatabase.toolhubPool.on('error', () => console.error('[database] Idle connection failed.'));
  }
  return globalDatabase.toolhubPool;
}

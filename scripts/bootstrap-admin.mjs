import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
export async function bootstrapAdmin(connectionString = process.env.DATABASE_URL, env = process.env) {
  if (!env.ADMIN_EMAIL && !env.ADMIN_PASSWORD) return;
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) throw new Error('Set both ADMIN_EMAIL and ADMIN_PASSWORD, or remove both.');
  if (env.ADMIN_PASSWORD.length < 12 || env.ADMIN_PASSWORD.length > 128) throw new Error('ADMIN_PASSWORD must contain 12 to 128 characters.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.ADMIN_EMAIL.trim())) throw new Error('ADMIN_EMAIL must be a valid email address.');
  const pool = new Pool({connectionString, max:1,connectionTimeoutMillis:10000});
  let client;
  try {
    client=await pool.connect();
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(782041929)');
    // Never reset a password or silently promote an existing account on restart.
    if ((await client.query("SELECT 1 FROM users WHERE role='admin' LIMIT 1")).rowCount) { await client.query('COMMIT'); return; }
    const email=env.ADMIN_EMAIL.trim().toLowerCase();
    if ((await client.query('SELECT 1 FROM users WHERE email=$1',[email])).rowCount) throw new Error('Bootstrap email is already registered.');
    const department=env.ADMIN_DEPARTMENT || 'Account';
    if (!(await client.query('SELECT 1 FROM departments WHERE name=$1',[department])).rowCount) throw new Error('Unknown admin department.');
    const id=randomUUID(); const password=await hashPassword(env.ADMIN_PASSWORD);
    await client.query('INSERT INTO users (id,name,email,email_verified,department,role,banned,created_at,updated_at) VALUES ($1,$2,$3,false,$4,$5,false,now(),now())',[id,env.ADMIN_NAME || 'Admin',email,department,'admin']);
    await client.query('INSERT INTO accounts (id,account_id,provider_id,user_id,password,created_at,updated_at) VALUES ($1,$2::text,$3,$2::uuid,$4,now(),now())',[randomUUID(),id,'credential',password]);
    await client.query("INSERT INTO auth_events (user_id,actor_id,event) VALUES ($1,$1,'admin_bootstrapped')",[id]);
    await client.query('COMMIT');
    console.log('[database] Initial admin created. Remove ADMIN_EMAIL and ADMIN_PASSWORD from Railway Variables.');
  } catch(error) { if(client) await client.query('ROLLBACK'); throw error; }
  finally { client?.release(); await pool.end(); }
}

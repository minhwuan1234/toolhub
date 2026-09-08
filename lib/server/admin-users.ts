import type { Pool } from 'pg';
import { departments } from '../departments';

export class AdminError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function updateUser(pool: Pool, actorId: string, input: unknown) {
  const body = input as Record<string, unknown> | null;
  if (!body || typeof body.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.id) || !departments.includes(body.department as never) || !['admin', 'user'].includes(body.role as string) || typeof body.banned !== 'boolean') throw new AdminError(400, 'Invalid account details.');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize all administrative updates, including concurrent demotions.
    await client.query('SELECT pg_advisory_xact_lock(782041929)');
    const actor = (await client.query('SELECT role, banned FROM users WHERE id=$1 FOR UPDATE', [actorId])).rows[0];
    if (!actor || actor.role !== 'admin' || actor.banned) throw new AdminError(403, 'Admin access required.');
    const target = (await client.query('SELECT id, role, department, banned FROM users WHERE id=$1 FOR UPDATE', [body.id])).rows[0];
    if (!target) throw new AdminError(404, 'Account not found.');
    if (body.id === actorId && (body.banned || body.role !== 'admin')) throw new AdminError(409, 'You cannot disable or demote your own account.');
    await client.query('UPDATE users SET department=$2, role=$3, banned=$4, updated_at=now() WHERE id=$1', [body.id, body.department, body.role, body.banned]);
    if (body.banned || body.role !== target.role) await client.query('DELETE FROM sessions WHERE user_id=$1', [body.id]);
    await client.query('INSERT INTO auth_events (user_id, actor_id, event, details) VALUES ($1,$2,$3,$4)', [body.id, actorId, 'account_updated', JSON.stringify({before:target,after:{department:body.department,role:body.role,banned:body.banned}})]);
    await client.query('COMMIT');
    return { success: true };
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

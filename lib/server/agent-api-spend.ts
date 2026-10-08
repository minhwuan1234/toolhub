import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { getDatabase } from './database';

export const AGENT_API_BUDGET_MICRO_USD = 5_000_000;
const OUTPUT_TOKEN_LIMIT = 2500;
const LUNA_PRICES = { input: 0.20, cached: 0.02, cacheWrite: 0.25, output: 1.20 };

type ResponseUsage = {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
};

function priceFor(model: string) {
  if (model === 'gpt-5.6-luna' || model.startsWith('gpt-5.6-luna-')) return LUNA_PRICES;
  throw new Error('API spend tracking supports GPT-5.6 Luna only. Configure its pricing before changing the agent model.');
}

function microUsdFromUsage(usage: ResponseUsage | null | undefined, model: string) {
  if (!usage || !Number.isFinite(usage.input_tokens) || !Number.isFinite(usage.output_tokens)) return null;
  const prices = priceFor(model);
  const input = Math.max(0, usage.input_tokens!);
  const output = Math.max(0, usage.output_tokens!);
  const cached = Math.min(input, Math.max(0, usage.input_tokens_details?.cached_tokens || 0));
  const writes = Math.min(input - cached, Math.max(0, usage.input_tokens_details?.cache_write_tokens || 0));
  return Math.ceil((input - cached - writes) * prices.input + cached * prices.cached + writes * prices.cacheWrite + output * prices.output);
}

async function withSpendLock<T>(work: (client: PoolClient) => Promise<T>) {
  const client = await getDatabase().connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM agent_api_spend WHERE id = 1 FOR UPDATE');
    // A crashed request is charged its full reservation; the meter never silently drops a possible cost.
    const expired = await client.query('DELETE FROM agent_api_spend_reservations WHERE created_at < now() - interval \'5 minutes\' RETURNING reserved_micro_usd');
    const expiredTotal = expired.rows.reduce((sum, row) => sum + Number(row.reserved_micro_usd), 0);
    if (expiredTotal) await client.query('UPDATE agent_api_spend SET spent_micro_usd = spent_micro_usd + $1, reserved_micro_usd = reserved_micro_usd - $1 WHERE id = 1', [expiredTotal]);
    const value = await work(client);
    await client.query('COMMIT');
    return value;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function getAgentApiSpend() {
  return withSpendLock(async client => {
    const result = await client.query('SELECT spent_micro_usd, reserved_micro_usd FROM agent_api_spend WHERE id = 1');
    const row = result.rows[0];
    if (!row) throw new Error('API spend tracking is unavailable.');
    return { spentUsd: Number(row.spent_micro_usd) / 1_000_000, reservedUsd: Number(row.reserved_micro_usd) / 1_000_000, budgetUsd: 5 };
  });
}

export async function reserveAgentApiSpend(model: string, instructions: string, input: string) {
  const prices = priceFor(model);
  // UTF-8 bytes conservatively bound input tokens. Include cache-write and long-prompt margins.
  const reservedMicroUsd = Math.ceil(Buffer.byteLength(instructions + input, 'utf8') * prices.cacheWrite * 2 + OUTPUT_TOKEN_LIMIT * prices.output * 1.5 + 100);
  const id = randomUUID();
  await withSpendLock(async client => {
    const result = await client.query('SELECT spent_micro_usd, reserved_micro_usd FROM agent_api_spend WHERE id = 1');
    const row = result.rows[0];
    if (!row) throw new Error('API spend tracking is unavailable.');
    if (Number(row.spent_micro_usd) + Number(row.reserved_micro_usd) + reservedMicroUsd > AGENT_API_BUDGET_MICRO_USD) {
      throw new Error('The remaining shared $5 API budget cannot cover another agent request.');
    }
    await client.query('INSERT INTO agent_api_spend_reservations (id, reserved_micro_usd) VALUES ($1, $2)', [id, reservedMicroUsd]);
    await client.query('UPDATE agent_api_spend SET reserved_micro_usd = reserved_micro_usd + $1 WHERE id = 1', [reservedMicroUsd]);
  });
  return id;
}

export async function settleAgentApiSpend(id: string, model: string, usage?: ResponseUsage | null, failedBeforeUse = false) {
  await withSpendLock(async client => {
    const reservation = await client.query('DELETE FROM agent_api_spend_reservations WHERE id = $1 RETURNING reserved_micro_usd', [id]);
    if (!reservation.rows[0]) return;
    const reserved = Number(reservation.rows[0].reserved_micro_usd);
    const measured = failedBeforeUse ? 0 : microUsdFromUsage(usage, model);
    const spent = measured === null ? reserved : measured;
    await client.query('UPDATE agent_api_spend SET spent_micro_usd = spent_micro_usd + $1, reserved_micro_usd = reserved_micro_usd - $2 WHERE id = 1', [spent, reserved]);
  });
}

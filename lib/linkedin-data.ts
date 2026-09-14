type QueryValue = string | number | boolean;

const tables = {
  connectJobs: 'outreach_jobs',
  connectTargets: 'outreach_job_targets',
  acceptanceChecks: 'outreach_acceptance_checks',
  prospects: 'outreach_prospects',
  messageTargets: 'outreach_message_targets',
  messageBatches: 'outreach_message_batches',
} as const;

function configuration() {
  const url = process.env.OUTREACH_SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.OUTREACH_SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error('LinkedIn database is not configured.');
  return { url, key };
}

async function readTable(table: string, filters: Record<string, QueryValue> = {}, limit = 50) {
  const { url, key } = configuration();
  const query = new URLSearchParams({ select: '*', limit: String(Math.min(Math.max(limit, 1), 100)) });
  for (const [field, value] of Object.entries(filters)) query.set(field, `eq.${value}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const result = await fetch(`${url}/rest/v1/${table}?${query}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!result.ok) throw new Error(`LinkedIn database request failed (${result.status}).`);
    const data = await result.json() as unknown;
    return Array.isArray(data) ? data : [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function readLinkedInData(name: string, args: Record<string, unknown>) {
  const limit = typeof args.limit === 'number' ? args.limit : 50;
  const jobId = typeof args.job_id === 'string' ? args.job_id : undefined;
  if (name === 'linkedin_connect_data') {
    const jobs = await readTable(tables.connectJobs, jobId ? { id: jobId } : {}, limit);
    const targets = jobId ? await readTable(tables.connectTargets, { source_job_id: jobId }, limit) : [];
    return { jobs, targets };
  }
  if (name === 'linkedin_acceptance_data') {
    const checks = await readTable(tables.acceptanceChecks, jobId ? { source_job_id: jobId } : {}, limit);
    return { checks };
  }
  if (name === 'linkedin_message_data') {
    const targets = await readTable(tables.messageTargets, {}, limit);
    const batches = await readTable(tables.messageBatches, {}, limit);
    return { targets, batches };
  }
  throw new Error(`Unknown LinkedIn data tool: ${name}`);
}

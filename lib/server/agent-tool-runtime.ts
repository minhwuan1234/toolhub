import { getAgentCard } from './agent-cards';
import { isToolImported } from './imported-tools';
import { listScannerPath, listScannerTables, readScannerFile, scannerTableRequest, sentScannerConnectsToday, writeScannerFile } from './linkedin-scanner';

export type FunctionTool = { type: 'function'; name: string; description: string; parameters: Record<string, unknown>; strict: true };

const str = { type: 'string' };
function tool(name: string, description: string, properties: Record<string, unknown>): FunctionTool {
  return { type: 'function', name, description, parameters: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false }, strict: true };
}

const scannerFunctions = [
  tool('scanner_list_files', 'List a directory in the LinkedIn Scanner GitHub repository. Empty path lists the root.', { path: str }),
  tool('scanner_read_file', 'Read one specific text file in the LinkedIn Scanner GitHub source repository, not a directory or sent Connect records. First use scanner_list_files to find a file. Returns its current SHA.', { path: str }),
  tool('scanner_write_file', 'Create or update a text file in the LinkedIn Scanner GitHub repository and commit it. Use the current SHA from read_file when updating; an empty SHA creates a file.', { path: str, content: str, message: str, sha: str }),
  tool('scanner_list_tables', 'Discover available LinkedIn Scanner Supabase tables and their column names before querying operational records such as sent Connect activity.', {}),
  tool('scanner_sent_connects_today', 'Read the LinkedIn Connect invitations sent today in Asia/Ho_Chi_Minh from outreach_prospects. Use this directly for requests about Connects sent today; do not discover tables first. Read only.', {}),
  tool('scanner_table', 'Read or change LinkedIn Scanner Supabase table rows, including operational records when stored there. Call scanner_list_tables first to discover real table and column names. Do not use GitHub file tools to look up sent Connect data. query_json is a JSON object of PostgREST query parameters, e.g. {"id":"eq.123"}. body_json is a JSON object or array for POST/PATCH, otherwise "null". PATCH/DELETE require a row filter. No SQL or schema changes.', { table: str, method: { type: 'string', enum: ['GET', 'POST', 'PATCH', 'DELETE'] }, query_json: str, body_json: str }),
] as const;

export async function functionsForAgent(toolIds: string[]): Promise<FunctionTool[]> {
  return toolIds.includes('linkedin-scanner') && await isToolImported('linkedin-scanner') ? [...scannerFunctions] : [];
}

export async function executeAgentFunction(agentId: string, name: string, args: unknown): Promise<unknown> {
  const card = await getAgentCard(agentId);
  if (!card?.toolIds.includes('linkedin-scanner') || !await isToolImported('linkedin-scanner')) throw new Error('Tool access was not granted or was revoked.');
  if (!scannerFunctions.some(tool => tool.name === name)) throw new Error('Tool is not available to this agent.');
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Invalid tool arguments.');
  const a = args as Record<string, unknown>;
  if (name === 'scanner_list_files' && typeof a.path === 'string') return { files: await listScannerPath(a.path) };
  if (name === 'scanner_read_file' && typeof a.path === 'string') return readScannerFile(a.path);
  if (name === 'scanner_write_file' && typeof a.path === 'string' && typeof a.content === 'string' && typeof a.message === 'string' && typeof a.sha === 'string') return writeScannerFile(a.path, a.content, a.message, a.sha || undefined);
  if (name === 'scanner_list_tables') return { tables: await listScannerTables() };
  if (name === 'scanner_sent_connects_today') return sentScannerConnectsToday();
  if (name === 'scanner_table' && typeof a.table === 'string' && ['GET', 'POST', 'PATCH', 'DELETE'].includes(String(a.method)) && typeof a.query_json === 'string' && typeof a.body_json === 'string') {
    const query = JSON.parse(a.query_json) as unknown;
    const body = JSON.parse(a.body_json) as unknown;
    if (!query || typeof query !== 'object' || Array.isArray(query)) throw new Error('query_json must be an object.');
    return { rows: await scannerTableRequest(a.table, a.method as 'GET' | 'POST' | 'PATCH' | 'DELETE', query as Record<string, string>, body === null ? undefined : body) };
  }
  throw new Error('Invalid tool arguments.');
}

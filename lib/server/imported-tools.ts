import { isToolId, toolCatalog, type ToolId } from '../tool-catalog';
import { getDatabase } from './database';

export async function listImportedTools() {
  if (!process.env.DATABASE_URL) return [];
  const { rows } = await getDatabase().query<{ id: string }>('SELECT id FROM imported_tools ORDER BY imported_at, id');
  const imported = new Set(rows.map(row => row.id));
  return toolCatalog.filter(tool => imported.has(tool.id));
}

export async function importTool(id: string) {
  if (!isToolId(id)) throw new Error('Unknown tool ID.');
  await getDatabase().query('INSERT INTO imported_tools (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [id]);
  return toolCatalog.find(tool => tool.id === id)!;
}

export async function removeImportedTool(id: string) {
  if (!isToolId(id)) throw new Error('Unknown tool ID.');
  const client = await getDatabase().connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE agent_cards SET tool_ids=array_remove(tool_ids, $1), updated_at=now() WHERE $1=ANY(tool_ids)', [id]);
    await client.query('DELETE FROM imported_tools WHERE id=$1', [id]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function isToolImported(id: ToolId): Promise<boolean> {
  return (await listImportedTools()).some(tool => tool.id === id);
}

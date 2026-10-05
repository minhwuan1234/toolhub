import { defaultAgentCards, defaultAgentIds, validateAgentCard, type AgentCard } from '../agent-cards';
import { getDatabase } from './database';

type CardRow = Omit<AgentCard, 'useDesignGuidelines'> & { use_design_guidelines: boolean };

function fromRow(row: CardRow): AgentCard {
  return { id: row.id, name: row.name, role: row.role, mission: row.mission, responsibilities: row.responsibilities, inputs: row.inputs, outputs: row.outputs, collaboration: row.collaboration, useDesignGuidelines: row.use_design_guidelines, x: row.x, y: row.y };
}

export async function listAgentCards(): Promise<AgentCard[]> {
  if (!process.env.DATABASE_URL) return defaultAgentCards;
  const { rows } = await getDatabase().query<CardRow>('SELECT id, name, role, mission, responsibilities, inputs, outputs, collaboration, use_design_guidelines, x, y FROM agent_cards ORDER BY updated_at, id');
  const saved = new Map(rows.map(row => [row.id, fromRow(row)]));
  return [...defaultAgentCards.map(card => saved.get(card.id) ?? card), ...rows.filter(row => !defaultAgentIds.includes(row.id)).map(fromRow)];
}

export async function getAgentCard(id: string): Promise<AgentCard | undefined> {
  return (await listAgentCards()).find(card => card.id === id);
}

export async function saveAgentCard(value: unknown, positionOnly = false): Promise<AgentCard> {
  const card = validateAgentCard(value);
  if (positionOnly && !defaultAgentIds.includes(card.id)) {
    const result = await getDatabase().query('UPDATE agent_cards SET x=$2, y=$3, updated_at=now() WHERE id=$1', [card.id, card.x, card.y]);
    if (!result.rowCount) throw new Error('Agent card not found.');
    return card;
  }
  await getDatabase().query(
    `INSERT INTO agent_cards (id, name, role, mission, responsibilities, inputs, outputs, collaboration, use_design_guidelines, x, y)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (id) DO UPDATE SET ${positionOnly ? 'x=EXCLUDED.x, y=EXCLUDED.y, updated_at=now()' : `name=EXCLUDED.name, role=EXCLUDED.role, mission=EXCLUDED.mission,
       responsibilities=EXCLUDED.responsibilities, inputs=EXCLUDED.inputs, outputs=EXCLUDED.outputs,
       collaboration=EXCLUDED.collaboration, use_design_guidelines=EXCLUDED.use_design_guidelines,
       x=EXCLUDED.x, y=EXCLUDED.y, updated_at=now()`}`,
    [card.id, card.name, card.role, card.mission, card.responsibilities, card.inputs, card.outputs, card.collaboration, card.useDesignGuidelines, card.x, card.y],
  );
  return card;
}

export async function deleteAgentCard(id: string): Promise<void> {
  if (defaultAgentIds.includes(id)) throw new Error('Built-in agent cards cannot be deleted.');
  if (!/^custom-[0-9a-f-]{36}$/.test(id)) throw new Error('Invalid agent card ID.');
  await getDatabase().query('DELETE FROM agent_cards WHERE id=$1', [id]);
}

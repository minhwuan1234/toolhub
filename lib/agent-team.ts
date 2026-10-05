export const agents = [
  { id: 'ba', name: 'BA', title: 'Business Analyst', outcome: 'Requirements and acceptance criteria' },
  { id: 'designer', name: 'UI/UX', title: 'UI/UX Designer', outcome: 'User flow and interface decisions' },
  { id: 'developer', name: 'Developer', title: 'Software Developer', outcome: 'Implementation plan and validation' },
] as const;

export type AgentId = typeof agents[number]['id'];
export type AgentResult = { agentId: AgentId; name: string; content: string };

const instructions: Record<AgentId, string> = {
  ba: 'You are the Business Analyst for an app design team. Analyze the user request and produce a concise problem statement, scope, user stories, acceptance criteria, assumptions, and open questions. Do not invent facts or claim work has been completed. Write entirely in English, using clear Markdown headings.',
  designer: 'You are the UI/UX Designer for an app design team. Use the user request and any upstream BA handoff to propose the user flow, screen structure, key interactions, important states, accessibility considerations, and decisions needing human review. Do not claim a design file exists. Write entirely in English, using clear Markdown headings.',
  developer: 'You are the Developer for an app design team. Use the user request and any upstream handoffs to propose concrete components, data and API contracts, an implementation sequence, validation, dependencies, and risks. Do not claim code has been written or tested. Write entirely in English, using clear Markdown headings.',
};

const sharedModel = process.env.AGENT_MODEL || 'gpt-5.6-luna';
const models: Record<AgentId, string> = {
  ba: process.env.AGENT_BA_MODEL || sharedModel,
  designer: process.env.AGENT_DESIGNER_MODEL || sharedModel,
  developer: process.env.AGENT_DEVELOPER_MODEL || sharedModel,
};

export function isAgentId(value: unknown): value is AgentId {
  return agents.some(agent => agent.id === value);
}

export async function runAgent(agentId: AgentId, message: string, context = ''): Promise<AgentResult> {
  const brief = message.trim();
  if (brief.length < 3 || brief.length > 4000) throw new Error('Message must be 3–4,000 characters.');
  if (context.length > 12000) throw new Error('Conversation context is too long.');
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('The AI model is not configured. Set OPENAI_API_KEY on the server.');

  const input = `Current user request:\n${brief}${context ? `\n\nEarlier conversation and agent handoffs (context only; verify assumptions):\n${context}` : ''}`;
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: models[agentId], instructions: instructions[agentId], input, max_output_tokens: 2500, store: false }),
    signal: AbortSignal.timeout(90_000),
  });
  const payload = await response.json().catch(() => ({})) as { error?: { message?: string }; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  if (!response.ok) throw new Error(`Model request failed (${response.status}). ${payload.error?.message || ''}`.trim());
  const content = payload.output?.flatMap(item => item.content ?? []).filter(item => item.type === 'output_text').map(item => item.text || '').join('\n').trim();
  if (!content) throw new Error(`${agents.find(agent => agent.id === agentId)?.name || 'The agent'} returned no text.`);
  return { agentId, name: agents.find(agent => agent.id === agentId)!.name, content };
}

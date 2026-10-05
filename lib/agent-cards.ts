export type AgentCard = {
  id: string;
  name: string;
  role: string;
  mission: string;
  responsibilities: string;
  inputs: string;
  outputs: string;
  collaboration: string;
  useDesignGuidelines: boolean;
  x: number;
  y: number;
};

export const defaultAgentCards: AgentCard[] = [
  {
    id: 'ba', name: 'BA Agent', role: 'Business Analyst',
    mission: 'Listen to and capture customer needs, analyze and validate requirements, and propose and evaluate solutions.',
    responsibilities: 'Clarify the customer request, scope, assumptions, user stories, acceptance criteria, and solution options.',
    inputs: 'Customer requests, feedback, and existing product context.',
    outputs: 'Validated requirements, proposed solutions, tradeoffs, and a clear handoff for design and development.',
    collaboration: 'Work with the UI/UX Designer and Developer to resolve questions and verify that the solution meets customer needs.',
    useDesignGuidelines: false, x: 60, y: 220,
  },
  {
    id: 'designer', name: 'UI/UX Agent', role: 'UI/UX Designer',
    mission: 'Design useful, accessible interfaces and improve the user experience using the current Toolhub DESIGN.md guidance.',
    responsibilities: 'Define user flows, screen structure, interaction patterns, states, and usability improvements.',
    inputs: 'Customer needs, the BA handoff, product constraints, and the current Toolhub design guidelines.',
    outputs: 'UI/UX decisions, flows, interface specifications, and questions for review.',
    collaboration: 'Work with the BA to validate needs and with the Developer to ensure the design can be implemented.',
    useDesignGuidelines: true, x: 265, y: 220,
  },
  {
    id: 'developer', name: 'Developer Agent', role: 'Developer',
    mission: 'Focus on frontend and backend coding, system architecture, system design, and performance and reliability improvements.',
    responsibilities: 'Plan components, data models, APIs, implementation steps, validation, and system optimization.',
    inputs: 'Customer request, BA requirements, UI/UX specifications, and existing code and system constraints.',
    outputs: 'Implementation plan, architecture decisions, code guidance, validation plan, dependencies, and risks.',
    collaboration: 'Work with the BA on requirement clarity and with the UI/UX Designer on feasible interactions.',
    useDesignGuidelines: false, x: 470, y: 220,
  },
];

export const defaultAgentIds = defaultAgentCards.map(card => card.id);

export function validateAgentCard(value: unknown): AgentCard {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Agent card must be an object.');
  const card = value as Record<string, unknown>;
  if (typeof card.id !== 'string' || !(/^(ba|designer|developer)$/.test(card.id) || /^custom-[0-9a-f-]{36}$/.test(card.id))) throw new Error('Invalid agent card ID.');
  const fields = { name: 80, role: 80, mission: 1000, responsibilities: 2000, inputs: 1000, outputs: 1000, collaboration: 1000 } as const;
  for (const [key, limit] of Object.entries(fields)) {
    if (typeof card[key] !== 'string' || !card[key].trim() || card[key].length > limit) throw new Error(`${key} must be 1–${limit} characters.`);
  }
  if (typeof card.useDesignGuidelines !== 'boolean') throw new Error('useDesignGuidelines must be true or false.');
  if (typeof card.x !== 'number' || !Number.isFinite(card.x) || Math.abs(card.x) > 10000 || typeof card.y !== 'number' || !Number.isFinite(card.y) || Math.abs(card.y) > 10000) throw new Error('Agent card position is invalid.');
  return { id: card.id, name: (card.name as string).trim(), role: (card.role as string).trim(), mission: (card.mission as string).trim(), responsibilities: (card.responsibilities as string).trim(), inputs: (card.inputs as string).trim(), outputs: (card.outputs as string).trim(), collaboration: (card.collaboration as string).trim(), useDesignGuidelines: card.useDesignGuidelines, x: card.x, y: card.y };
}

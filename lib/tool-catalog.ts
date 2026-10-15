export const toolCatalog = [
  { id: 'linkedin-scanner', tag: '#linkedin-scanner', name: 'LinkedIn Scanner', description: 'Read and write the scanner GitHub repository and Supabase data.' },
] as const;

export type ToolId = typeof toolCatalog[number]['id'];

export function isToolId(value: unknown): value is ToolId {
  return typeof value === 'string' && toolCatalog.some(tool => tool.id === value);
}

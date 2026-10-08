export type StructuredOutputValidation = { ok: true; formatted: string; schema: Record<string, unknown> } | { ok: false; error: string };

export const defaultStructuredOutputSchema = JSON.stringify({
  type: 'object',
  properties: { html: { type: 'string' }, css: { type: 'string' }, js: { type: 'string' } },
  required: ['html', 'css', 'js'],
  additionalProperties: false,
}, null, 2);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function checkSchema(schema: Record<string, unknown>, depth = 0): string | null {
  if (depth > 6) return 'JSON Schema is too deeply nested.';
  const type = schema.type;
  if (typeof type !== 'string' || !['object', 'array', 'string', 'number', 'integer', 'boolean'].includes(type)) return 'Every schema field needs a supported type.';
  const allowed = type === 'object' ? ['type', 'description', 'properties', 'required', 'additionalProperties'] : type === 'array' ? ['type', 'description', 'items'] : ['type', 'description'];
  if (Object.keys(schema).some(key => !allowed.includes(key))) return 'JSON Schema contains an unsupported field.';
  if (schema.description !== undefined && typeof schema.description !== 'string') return 'Schema descriptions must be text.';
  if (type === 'object') {
    if (!isRecord(schema.properties) || !Object.keys(schema.properties).length) return 'Object schemas need properties.';
    if (schema.additionalProperties !== false) return 'Object schemas need additionalProperties: false.';
    const names = Object.keys(schema.properties);
    const required = schema.required;
    if (!Array.isArray(required) || required.length !== names.length || names.some(name => !required.includes(name))) return 'Every object property must be required.';
    for (const name of names) {
      const child = schema.properties[name];
      if (!isRecord(child)) return `Property “${name}” needs a schema object.`;
      const error = checkSchema(child, depth + 1);
      if (error) return error;
    }
  }
  if (type === 'array') {
    if (!isRecord(schema.items)) return 'Array schemas need an items schema.';
    return checkSchema(schema.items, depth + 1);
  }
  return null;
}

export function validateStructuredOutput(value: string): StructuredOutputValidation {
  if (!value.trim()) return { ok: false, error: 'Enter a JSON Schema for structured output.' };
  if (value.length > 16000) return { ok: false, error: 'JSON is over the 16,000 character limit.' };
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed) || parsed.type !== 'object') return { ok: false, error: 'Structured output needs an object JSON Schema.' };
    const error = checkSchema(parsed);
    if (error) return { ok: false, error };
    return { ok: true, formatted: JSON.stringify(parsed, null, 2), schema: parsed };
  } catch {
    return { ok: false, error: 'Enter valid JSON.' };
  }
}

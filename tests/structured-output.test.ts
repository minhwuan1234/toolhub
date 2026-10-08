import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultStructuredOutputSchema, validateStructuredOutput } from '../lib/structured-output';

void test('structured output saves a formatted JSON object', () => {
  const result = validateStructuredOutput(defaultStructuredOutputSchema);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(Object.keys(result.schema.properties as object), ['html', 'css', 'js']);
});

void test('structured output rejects invalid JSON and non-object roots', () => {
  assert.equal(validateStructuredOutput('{invalid').ok, false);
  assert.equal(validateStructuredOutput('[]').ok, false);
  assert.equal(validateStructuredOutput('null').ok, false);
  assert.equal(validateStructuredOutput('  ').ok, false);
  assert.equal(validateStructuredOutput('{"type":"object","properties":{"html":{"type":"string"}},"required":[],"additionalProperties":false}').ok, false);
  assert.equal(validateStructuredOutput('{"type":"object","properties":{"html":{"type":"string","pattern":".*"}},"required":["html"],"additionalProperties":false}').ok, false);
});

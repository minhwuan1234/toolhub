import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePythonSources } from '../lib/server/python-ast';
import { astLayers, dependencyGraph, ruleClassifier, layerAssignment } from '../lib/repository-see';
import type { LayerRule, SeeSymbol } from '../lib/see-contract';

const metadata = { run_id: 'native-python', source_node_id: 'reader', repository: 'r', commit: 'c', tool_id: 'tool', coverage: 'complete' };
void test('native Python AST finds real scopes and ignores calls embedded in docstrings', async () => {
  const sources = [{ path: 'app.py', content: `"""def fake(): time.monotonic(); page.goto('fake')"""\nclass Client:\n    async def run(self):\n        """logging.info('fake')"""\n        return self.load()\n    def load(self):\n        return db.table('items').select('id')\n` }];
  const native = await parsePythonSources(sources);
  assert.ok(!native[0].error);
  assert.deepEqual(native[0].functions?.map(fn => fn.name), ['Client.run', 'Client.load']);
  assert.deepEqual(native[0].functions?.[0].calls, ['self.load']);
  assert.ok(!native[0].functions?.[0].signals.includes('utility_logging'));
  const ast = astLayers(sources, '', metadata, native);
  assert.equal((ast.items as SeeSymbol[]).find(item => item.name === 'Client.run')?.parser, 'python-ast');
});

void test('deadline helpers from the reported example classify as utility with native evidence', async () => {
  const sources = [{ path: 'app/linkedin_acceptance_checker.py', content: `import time\nPROFILE_TIMEOUT_MS = 1000\ndef _build_deadline() -> float:\n    return time.monotonic() + (PROFILE_TIMEOUT_MS / 1000)\ndef _check_deadline(deadline):\n    if time.monotonic() > deadline:\n        raise TimeoutError('deadline exceeded')\n` }];
  const native = await parsePythonSources(sources);
  const assigned = layerAssignment(ruleClassifier(dependencyGraph(astLayers(sources, '', metadata, native))));
  const rows = assigned.items as Array<LayerRule & { layer: string }>;
  for (const name of ['_build_deadline', '_check_deadline']) {
    const row = rows.find(row => row.name === name)!;
    assert.equal(row.layer, 'shared_utility');
    assert.equal(row.basis, 'utility');
    assert.match(row.evidence.join(' '), /Python AST/);
  }
});

void test('AST supports aliased timing/logging and separates real automation/retry orchestration', async () => {
  const sources = [{ path: 'app.py', content: `from time import monotonic as clock\nimport logging as log\nimport time\nlogger = log.getLogger(__name__)\ndef deadline():\n    return clock() + 2\ndef report(message):\n    logger.warning(message)\ndef connect(page):\n    return page.locator('button').click()\ndef retry(operation):\n    for i in range(3):\n        try:\n            return operation()\n        except ValueError:\n            time.sleep(i + 1)\n` }];
  const native = await parsePythonSources(sources);
  const rows = layerAssignment(ruleClassifier(dependencyGraph(astLayers(sources, '', metadata, native)))).items as Array<LayerRule & { layer: string }>;
  assert.equal(rows.find(row => row.name === 'deadline')?.layer, 'shared_utility');
  assert.equal(rows.find(row => row.name === 'report')?.layer, 'shared_utility');
  assert.equal(rows.find(row => row.name === 'connect')?.layer, 'business_logic');
  assert.equal(rows.find(row => row.name === 'retry')?.layer, 'business_logic');
});

void test('invalid Python syntax is explicit partial coverage and never silently called native AST success', async () => {
  const sources = [{ path: 'broken.py', content: 'def broken(:\n pass' }];
  const native = await parsePythonSources(sources);
  assert.match(native[0].error || '', /SyntaxError/);
  const ast = astLayers(sources, '', metadata, native);
  assert.equal(ast.coverage, 'partial');
  const rows = layerAssignment(ruleClassifier(dependencyGraph(ast))).items as Array<LayerRule & { layer: string }>;
  assert.equal(rows[0].layer, 'unknown');
  assert.match(rows[0].unknown_reason || '', /Python AST/);
});

void test('native parsing does not import or execute supplied source', async () => {
  const native = await parsePythonSources([{ path: 'untrusted.py', content: `import module_that_does_not_exist\nraise RuntimeError('executed')\ndef real():\n    return 1\n` }]);
  assert.ok(!native[0].error);
  assert.equal(native[0].functions?.[0].name, 'real');
});

void test('docstrings cannot fabricate database access or API routes', async () => {
  const sources = [{ path: 'fake.py', content: `def plain():
    """db.table('fake'); fetch('/fake'); @app.get('/fake')"""
    return 1
` }];
  const native = await parsePythonSources(sources);
  const rows = layerAssignment(ruleClassifier(dependencyGraph(astLayers(sources, '', metadata, native)))).items as Array<LayerRule & { layer: string }>;
  assert.equal(rows.find(row => row.name === 'plain')?.layer, 'unknown');
});

void test('a parameter named time cannot masquerade as the standard-library clock', async () => {
  const native = await parsePythonSources([{ path: 'shadow.py', content: `import time
def custom(time):
    return time.monotonic()
` }]);
  assert.ok(!native[0].functions?.[0].signals.includes('utility_timing'));
});

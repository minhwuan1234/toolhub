import ts from 'typescript';
import { extractFunctions, searchFunctions, type RepositorySource } from './repository-functions';
import { withoutComments, imports, resolveImport, endpoints, requestRoutes, databaseReferences } from './repository-ui-flows';
import type { PythonFileAnalysis } from './server/python-ast';
import type { CodeLayer, LayerRule, SeeOutput, SeeSymbol } from './see-contract';

type Metadata = Pick<SeeOutput, 'run_id' | 'source_node_id' | 'repository' | 'commit' | 'tool_id' | 'coverage'>;
const notes = ['Static source analysis only; no model calls or live database access.', 'Python uses an indentation scanner and static heuristics, HTML/CSS/SQL use source adapters. Dynamic calls, aliases and runtime routes may remain unresolved.'];
function finish(output: SeeOutput): SeeOutput {
  while (JSON.stringify(output).length > 170000 && output.items.length) { output.items.pop(); output.truncated = true; }
  return output;
}

export function astLayers(sources: RepositorySource[], query: string, metadata: Metadata, pythonAnalysis?: PythonFileAnalysis[]): SeeOutput {
  const paths = new Set(sources.map(source => source.path));
  const nativePython = new Map(pythonAnalysis?.map(file => [file.path, file]) || []);
  const parsedResults = sources.filter(source => /\.(?:[cm]?[jt]sx?|py|html?)$/i.test(source.path)).map(source => {
    if (!source.path.endsWith('.py') || !pythonAnalysis) return extractFunctions(source);
    const file = nativePython.get(source.path);
    if (!file || file.error) return { functions: [], errors: [`${source.path}: ${file?.error || 'Python AST result missing'}`] };
    const lines = source.content.split('\n');
    return { errors: [], functions: (file.functions || []).map(fn => {
      const text = lines.slice(fn.startLine - 1, fn.endLine).join('\n');
      return { path: source.path, name: fn.name, kind: fn.kind, startLine: fn.startLine, endLine: fn.endLine, signature: text.split('\n')[0].trim(), excerpt: text.slice(0, 500), searchText: text, score: 0 };
    }) };
  });
  const parsed = parsedResults.flatMap(result => result.functions);
  const parseErrors = parsedResults.flatMap(result => result.errors);
  const unsupported = sources.some(source => !/\.(?:[cm]?[jt]sx?|py|html?|css|sql)$/i.test(source.path));
  const cachedImports = new Map(sources.map(source => [source.path, (nativePython.get(source.path)?.imports || imports(source)).slice(0, 15).map(ref => ({ ...ref, names: ref.names.slice(0, 15), target: resolveImport(source.path, ref.specifier, paths) }))]));
  const cachedEndpoints = new Map(sources.map(source => [source.path, endpoints(source, parsed.filter(fn => fn.path === source.path))]));
  const byId = new Map(parsed.map(fn => [`${fn.path}:${fn.startLine}:${fn.name}`, fn]));
  const ranked = searchFunctions(parsed, query, parsed.length);
  const relevantPaths = new Set(ranked.map(fn => fn.path));
  const ordered = [...sources.filter(source => relevantPaths.has(source.path)), ...sources.filter(source => !relevantPaths.has(source.path))];
  const symbols: SeeSymbol[] = [];
  let detailsTruncated = false;
  const add = (source: RepositorySource, name: string, kind: string, startLine: number, endLine: number, content: string) => {
    const code = withoutComments(source.path, content);
    const calls = new Set<string>();
    let ui = false, control = false, transform = false, mutation = false;
    const python = source.path.endsWith('.py'), native = nativePython.get(source.path), nativeFacts = kind === 'module' ? native?.module : native?.functions?.find(fn => fn.name === name && fn.startLine === startLine), supported = /\.[cm]?[jt]sx?$/i.test(source.path), adapted = /\.(?:html?|css|sql)$/i.test(source.path);
    if (python && pythonAnalysis) {
      for (const call of nativeFacts?.calls || []) calls.add(call);
      control = nativeFacts?.signals.includes('control_flow') || false;
      transform = nativeFacts?.signals.includes('data_transform') || false;
      mutation = nativeFacts?.signals.includes('mutation_or_effect') || false;
    } else if (supported) {
      const tree = ts.createSourceFile(source.path, code, ts.ScriptTarget.Latest, true, /\.[jt]sx$/.test(source.path) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node)) {
          calls.add(node.expression.getText(tree));
          if (isTransformCall(node.expression.getText(tree))) transform = true;
        }
        if (ts.isBinaryExpression(node)) {
          if (node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) mutation = true;
          else if ([ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken, ts.SyntaxKind.AsteriskToken, ts.SyntaxKind.SlashToken, ts.SyntaxKind.PercentToken].includes(node.operatorToken.kind)) transform = true;
        }
        if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator)) mutation = true;
        if (ts.isAwaitExpression(node) || ts.isNewExpression(node) || ts.isThrowStatement(node)) mutation = true;
        if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isPropertyAccessExpression(node) && ['innerHTML', 'outerHTML', 'textContent', 'classList', 'style'].includes(node.name.text)) ui = true;
        if (ts.isIfStatement(node) || ts.isSwitchStatement(node) || ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isWhileStatement(node)) control = true;
        ts.forEachChild(node, visit);
      };
      visit(tree);
    } else if (python || adapted) {
      for (const match of code.matchAll(/\b([\w]+(?:\.[\w]+)*)\s*\(/g)) if (!/(?:def|class)\s+$/.test(code.slice(0, match.index))) calls.add(match[1]);
      transform = [...calls].some(isTransformCall) || /\breturn\s+\w+\s*[+*/%-]\s*\w+/.test(code);
      mutation = /\b(?:await|yield|raise)\b|\.[\w]+\s*=/.test(code);
      control = /\b(?:if|for|while)\b/.test(code);
    }
    const signals: string[] = [...(nativeFacts?.signals || [])];
    if (ui || /\.(?:html?|css)$/.test(source.path) || [...calls].some(call => /^(?:document\.|React\.createElement|st\.(?:button|title|header|form)|streamlit\.)/.test(call))) signals.push('ui_render');
    if ([...calls].some(call => /(?:addEventListener|querySelector|getElementById|setAttribute|appendChild)$/.test(call))) signals.push('dom_interaction');
    if (control) signals.push('control_flow');
    if (transform) signals.push('data_transform');
    if (mutation) signals.push('mutation_or_effect');
    if (name === source.content.match(/export\s+default\s+(?:(?:async\s+)?function\s+|class\s+)?(\w+)/)?.[1]) signals.push('default_export');
    if ([...calls].some(call => /^(?:db|supabase|cursor|conn|connection|prisma|session)(?:\.[\w]+)*\.(?:execute|executemany|fetchone|fetchall|findMany|findUnique|findFirst|upsert|commit|rollback)$/.test(call))) signals.push('database_client_call');
    if (/(?:^|\/)(?:services?|domain|business|workers?|workflows?)(?:[/.]|$)/i.test(source.path)) signals.push('domain_path');
    if (/\.sql$/i.test(source.path) && /\b(?:CREATE|ALTER)\s+TABLE\b/i.test(code)) signals.push('database_schema');
    const refs = python && pythonAnalysis ? (nativeFacts?.tables || []).map(table => ({ table })) : databaseReferences(source.path, code, startLine).filter(() => python || adapted || [...calls].some(call => /(?:\.(?:from|table|query|execute)|^query|^execute)$/.test(call)));
    if (refs.length) signals.push('database_query');
    const routes = python && pythonAnalysis ? nativeFacts?.requests || [] : requestRoutes(code).map(route => `${route.method || 'GET'} ${route.route}`);
    const routeDefinitions = python && pythonAnalysis ? (nativeFacts?.definitions || []).map(route => { const [method, ...path] = route.split(' '); return { method, route: path.join(' ') }; }) : (cachedEndpoints.get(source.path) || []).filter(route => kind === 'module' || route.symbol === name);
    if (routeDefinitions.length) signals.push('api_handler');
    if (calls.size > 30 || imports(source).length > 15 || routes.length + routeDefinitions.length > 20 || refs.length > 20) detailsTruncated = true;
    symbols.push({ id: `${source.path}:${startLine}:${name}`, path: source.path, name, kind, startLine, endLine,
      excerpt: content.slice(0, 500), parser: python ? pythonAnalysis ? native?.error || !native ? 'python-ast-error' : 'python-ast' : 'python-indentation-scanner' : adapted ? 'source-adapter' : supported ? 'typescript-ast' : 'unsupported', signals: [...new Set(signals)],
      calls: [...calls].slice(0, 30), imports: cachedImports.get(source.path) || [],
      routes: [...routes, ...routeDefinitions.map(route => `defines ${route.method} ${route.route}`)].slice(0, 20), tables: [...new Set(refs.map(ref => ref.table))].slice(0, 20) });
  };
  const selectedFunctions = [...ranked, ...parsed.filter(fn => !ranked.some(hit => hit.path === fn.path && hit.startLine === fn.startLine && hit.name === fn.name))].slice(0, 250);
  for (const hit of selectedFunctions) {
    const fn = byId.get(`${hit.path}:${hit.startLine}:${hit.name}`)!;
    const source = sources.find(source => source.path === fn.path)!;
    add(source, fn.name, fn.kind, fn.startLine, fn.endLine, fn.searchText || fn.excerpt);
  }
  for (const source of ordered.slice(0, 100)) add(source, '(module)', 'module', 1, source.content.split('\n').length, source.content);
  return finish({ ...metadata, coverage: metadata.coverage === 'partial' || parseErrors.length || unsupported ? 'partial' : 'complete', stage: 'ast-layers', analysis_query: query, model_calls: 0, notes: [...notes.map(note => pythonAnalysis ? note.replace('Python uses an indentation scanner and static heuristics', 'Python uses the standard-library AST parser without executing source') : note), ...parseErrors.slice(0, 10), ...(unsupported ? ['Some fetched file languages have no AST adapter and remain unclassified.'] : [])], truncated: detailsTruncated || parsed.length > selectedFunctions.length || sources.length > 100,
    total_items: parsed.length + sources.length, items: symbols });
}

export function dependencyGraph(ast: SeeOutput): SeeOutput {
  if (ast.stage !== 'ast-layers') throw new Error('Dependency Graph requires AST Layers output.');
  const symbols = [...ast.items] as SeeSymbol[];
  const edges: NonNullable<SeeOutput['edges']> = [], unresolved = new Set<string>();
  for (const symbol of symbols) {
    for (const ref of symbol.imports) {
      const target = symbols.find(item => item.path === ref.target && item.kind === 'module');
      if (target) edges.push({ source: symbol.id, target: target.id, relation: 'imports', evidence: ref.specifier });
      else if (ref.specifier.startsWith('.') || ref.specifier.startsWith('@/')) unresolved.add(`${symbol.path}: import ${ref.specifier}`);
    }
    for (const call of symbol.calls) {
      const direct = symbols.filter(item => item.kind !== 'module' && item.path === symbol.path && (item.name === call || item.name === `${symbol.name}.${call}` || /^(?:self|this)\./.test(call) && item.name === `${symbol.name.split('.').slice(0, -1).join('.')}.${call.split('.').slice(1).join('.')}`));
      const imported = symbol.imports.flatMap(ref => ref.names.filter(name => call === name.local || call.startsWith(`${name.local}.`)).flatMap(name => symbols.filter(item => item.path === ref.target && item.kind !== 'module' && (name.imported === '*' ? item.name === call.split('.').slice(1).join('.') : name.imported === 'default' ? item.signals.includes('default_export') : item.name === name.imported))));
      const candidates = [...new Map([...direct, ...imported].map(item => [item.id, item])).values()];
      if (candidates.length === 1) edges.push({ source: symbol.id, target: candidates[0].id, relation: 'calls', evidence: call });
      else if (candidates.length > 1) unresolved.add(`${symbol.path}: ambiguous call ${call}`);
    }
    for (const route of symbol.routes.filter(route => !route.startsWith('defines '))) {
      const targets = symbols.filter(item => item.kind !== 'module' && item.routes.includes(`defines ${route}`));
      for (const target of targets) edges.push({ source: symbol.id, target: target.id, relation: 'http', evidence: route });
      if (!targets.length) unresolved.add(`${symbol.path}: API ${route}`);
    }
  }
  const unique = [...new Map(edges.map(edge => [`${edge.source}:${edge.target}:${edge.relation}:${edge.evidence}`, edge])).values()];
  const output: SeeOutput = { ...ast, stage: 'dependency-graph', symbols, items: unique.slice(0, 400), total_items: unique.length, unresolved: [...unresolved].slice(0, 60), truncated: ast.truncated || unique.length > 400 || unresolved.size > 60 };
  // Keep node identities needed by the classifier within the saved-output budget.
  while (JSON.stringify(output).length > 170000 && output.symbols!.length > 1) { output.symbols!.pop(); output.truncated = true; }
  const ids = new Set(output.symbols!.map(symbol => symbol.id));
  output.items = (output.items as NonNullable<SeeOutput['edges']>).filter(edge => ids.has(edge.source) && ids.has(edge.target));
  return finish(output);
}

function isTransformCall(call: string) {
  return /^(?:String|Number|Boolean|parseInt|parseFloat|str|int|float|len|round|sorted|sum|min|max|abs|Math\.\w+|JSON\.(?:parse|stringify))$/.test(call) || /\.(?:trim|toLowerCase|toUpperCase|slice|substring|split|join|replace|replaceAll|map|filter|reduce|includes|startsWith|endsWith|toFixed|strip|lower|upper|format)$/.test(call);
}

export function ruleClassifier(graph: SeeOutput): SeeOutput {
  if (graph.stage !== 'dependency-graph' || !graph.symbols) throw new Error('Rule Classifier requires Dependency Graph output.');
  const symbols = new Map(graph.symbols.map(symbol => [symbol.id, symbol]));
  // Imports alone do not establish responsibility. Use resolved calls and HTTP edges only.
  const relations = (graph.items as NonNullable<SeeOutput['edges']>).filter(edge => edge.relation !== 'imports' && edge.source !== edge.target && symbols.get(edge.source)?.kind !== 'module');
  const incoming = (id: string) => [...new Set(relations.filter(edge => edge.target === id).map(edge => edge.source))];
  const outgoing = (id: string) => [...new Set(relations.filter(edge => edge.source === id).map(edge => edge.target))];
  const items: LayerRule[] = graph.symbols.map(symbol => {
    const candidates = new Set<CodeLayer>(), evidence: string[] = [];
    if (symbol.signals.some(signal => ['ui_render', 'dom_interaction'].includes(signal))) { candidates.add('presentation'); evidence.push('UI syntax or DOM interaction'); }
    if (symbol.signals.some(signal => ['database_query', 'database_schema', 'database_client_call'].includes(signal))) { candidates.add('database'); evidence.push(`Data query/schema/client${symbol.tables.length ? `: ${symbol.tables.join(', ')}` : ''}`); }
    const utility = symbol.signals.some(signal => ['utility_timing', 'utility_logging'].includes(signal));
    if (utility) { candidates.add('shared_utility'); evidence.push('Python AST: bounded timing/deadline or logging helper; no unrelated operational calls'); }
    if (!utility && (symbol.signals.includes('domain_path') && symbol.signals.includes('control_flow') || symbol.signals.includes('api_handler') || symbol.signals.includes('browser_automation') || symbol.signals.includes('retry_orchestration'))) { candidates.add('business_logic'); evidence.push(symbol.signals.includes('api_handler') ? 'API handler / orchestration (candidate)' : symbol.signals.includes('browser_automation') ? 'Python AST: browser automation calls (candidate)' : symbol.signals.includes('retry_orchestration') ? 'Python AST: retry loop with exception handling and backoff (candidate)' : 'Domain/service path with control flow (candidate)'); }
    return { id: symbol.id, path: symbol.path, name: symbol.name, startLine: symbol.startLine, endLine: symbol.endLine, excerpt: symbol.excerpt, candidates: [...candidates], evidence, basis: utility ? 'utility' : candidates.size ? 'direct' : 'unresolved', confidence: candidates.has('business_logic') || utility ? 'medium' : candidates.size ? 'high' : 'low' };
  });
  const byId = new Map(items.map(item => [item.id, item]));
  // Bounded, synchronous passes prevent scan order from changing inferred labels.
  for (let pass = 0; pass < 3; pass++) {
    const updates: Array<{ item: LayerRule; layers: CodeLayer[]; evidence: string; basis: LayerRule['basis'] }> = [];
    for (const item of items.filter(item => item.basis === 'unresolved')) {
      const symbol = symbols.get(item.id)!;
      if (['unsupported', 'python-ast-error'].includes(symbol.parser) || symbol.kind === 'module') continue;
      const callees = outgoing(item.id).map(id => byId.get(id)!);
      const callers = incoming(item.id).map(id => byId.get(id)!);
      const pureTransform = symbol.signals.includes('data_transform') && !symbol.signals.includes('mutation_or_effect') && symbol.calls.every(isTransformCall);
      if (pureTransform) {
        const roles = new Set(callers.flatMap(caller => caller.candidates));
        if (callers.length && callers.every(caller => caller.candidates.length === 1) && roles.size === 1 && !roles.has('shared_utility')) {
          updates.push({ item, layers: [...roles], basis: 'dependency', evidence: `Data transform used by ${callers.map(caller => `${caller.path}:${caller.startLine} ${caller.name}`).join(', ')} (caller context)` });
        } else updates.push({ item, layers: ['shared_utility'], basis: 'utility', evidence: roles.size > 1 ? `Side-effect-free data transform reused across roles: ${[...roles].join(', ')}` : 'Reusable data transform with only recognized pure operations; no architecture layer assumed' });
        continue;
      }
      if (!callees.length) continue;
      const roles = new Set(callees.flatMap(callee => callee.candidates));
      if (callees.every(callee => callee.candidates.length === 1) && roles.size === 1 && !roles.has('shared_utility')) {
        const onlyRole = [...roles][0];
        // Preserve orchestration as business logic; do not label all DB callers as DB access.
        const layer = onlyRole === 'database' && symbol.signals.includes('control_flow') ? 'business_logic' : onlyRole;
        const isWrapper = !symbol.signals.includes('control_flow') && !symbol.signals.includes('mutation_or_effect') && symbol.calls.every(call => relations.some(edge => edge.source === item.id && edge.evidence === call));
        if (isWrapper || layer === 'business_logic' && symbol.signals.includes('control_flow')) updates.push({ item, layers: [layer], basis: 'dependency', evidence: `${isWrapper ? 'Delegates to' : 'Coordinates'} ${callees.map(callee => `${callee.path}:${callee.startLine} ${callee.name}`).join(', ')} (${onlyRole})` });
      }
    }
    if (!updates.length) break;
    for (const update of updates) { update.item.candidates = update.layers; update.item.evidence.push(update.evidence); update.item.basis = update.basis; update.item.confidence = 'medium'; }
  }
  for (const item of items.filter(item => symbols.get(item.id)?.kind === 'module' && !item.candidates.length)) {
    const children = items.filter(child => child.path === item.path && child.id !== item.id);
    if (children.length && children.every(child => child.candidates.length)) {
      item.candidates = [...new Set(children.flatMap(child => child.candidates))]; item.basis = 'module_summary'; item.confidence = 'medium';
      item.evidence.push('File summary of classified functions; not additional function-level evidence');
    }
  }
  for (const item of items.filter(item => !item.candidates.length)) {
    const symbol = symbols.get(item.id)!;
    item.unknown_reason = symbol.parser === 'python-ast-error' ? 'Python AST parsing failed or parser unavailable' : symbol.parser === 'unsupported' ? 'No parser adapter for this file type' : symbol.kind === 'module' ? 'File contains unclassified responsibilities' : outgoing(item.id).length ? 'Dependencies have mixed or unresolved roles; no safe inference' : 'No matching direct rule or resolved dependency evidence';
    item.evidence.push(item.unknown_reason);
  }
  return finish({ ...graph, stage: 'rule-classifier', symbols: undefined, edges: graph.items as NonNullable<SeeOutput['edges']>, notes: [...graph.notes, 'Dependency/utility labels are medium-confidence static inferences. Imports alone never propagate a layer.'], items, total_items: items.length });
}

export function layerAssignment(classified: SeeOutput): SeeOutput {
  if (classified.stage !== 'rule-classifier') throw new Error('layer_assignment requires Rule Classifier output.');
  const counts: Record<string, number> = { presentation: 0, business_logic: 0, database: 0, shared_utility: 0, mixed: 0, unknown: 0 };
  const items = (classified.items as LayerRule[]).map(item => {
    const layer = item.candidates.length > 1 ? 'mixed' : item.candidates[0] || 'unknown'; counts[layer]++;
    return { ...item, layer };
  });
  const output = finish({ ...classified, stage: 'layer-assignment', items, counts, total_items: items.length });
  output.unknown_counts = {};
  for (const item of output.items as LayerRule[]) if (!item.candidates.length) { const reason = item.unknown_reason || 'Unspecified'; output.unknown_counts[reason] = (output.unknown_counts[reason] || 0) + 1; }
  return output;
}

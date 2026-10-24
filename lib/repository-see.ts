import ts from 'typescript';
import { extractFunctions, searchFunctions, type RepositorySource } from './repository-functions';
import { withoutComments, imports, resolveImport, endpoints, requestRoutes, databaseReferences } from './repository-ui-flows';
import type { CodeLayer, LayerRule, SeeOutput, SeeSymbol } from './see-contract';

type Metadata = Pick<SeeOutput, 'run_id' | 'source_node_id' | 'repository' | 'commit' | 'tool_id' | 'coverage'>;
const notes = ['Static source analysis only; no model calls or live database access.', 'Python uses an indentation scanner and static heuristics, HTML/CSS/SQL use source adapters. Dynamic calls, aliases and runtime routes may remain unresolved.'];
function finish(output: SeeOutput): SeeOutput {
  while (JSON.stringify(output).length > 170000 && output.items.length) { output.items.pop(); output.truncated = true; }
  return output;
}

export function astLayers(sources: RepositorySource[], query: string, metadata: Metadata): SeeOutput {
  const paths = new Set(sources.map(source => source.path));
  const parsedResults = sources.filter(source => /\.(?:[cm]?[jt]sx?|py|html?)$/i.test(source.path)).map(source => extractFunctions(source));
  const parsed = parsedResults.flatMap(result => result.functions);
  const parseErrors = parsedResults.flatMap(result => result.errors);
  const unsupported = sources.some(source => !/\.(?:[cm]?[jt]sx?|py|html?|css|sql)$/i.test(source.path));
  const cachedImports = new Map(sources.map(source => [source.path, imports(source).slice(0, 15).map(ref => ({ ...ref, names: ref.names.slice(0, 15), target: resolveImport(source.path, ref.specifier, paths) }))]));
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
    let ui = false, control = false;
    const python = source.path.endsWith('.py'), supported = /\.[cm]?[jt]sx?$/i.test(source.path), adapted = /\.(?:html?|css|sql)$/i.test(source.path);
    if (supported) {
      const tree = ts.createSourceFile(source.path, code, ts.ScriptTarget.Latest, true, /\.[jt]sx$/.test(source.path) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node)) calls.add(node.expression.getText(tree));
        if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isPropertyAccessExpression(node) && ['innerHTML', 'outerHTML', 'textContent', 'classList', 'style'].includes(node.name.text)) ui = true;
        if (ts.isIfStatement(node) || ts.isSwitchStatement(node) || ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isWhileStatement(node)) control = true;
        ts.forEachChild(node, visit);
      };
      visit(tree);
    } else if (python || adapted) {
      for (const match of code.matchAll(/\b([\w]+(?:\.[\w]+)*)\s*\(/g)) calls.add(match[1]);
      control = /\b(?:if|for|while)\b/.test(code);
    }
    const signals: string[] = [];
    if (ui || /\.(?:html?|css)$/.test(source.path) || [...calls].some(call => /^(?:document\.|React\.createElement|st\.(?:button|title|header|form)|streamlit\.)/.test(call))) signals.push('ui_render');
    if ([...calls].some(call => /(?:addEventListener|querySelector|getElementById|setAttribute|appendChild)$/.test(call))) signals.push('dom_interaction');
    if (control) signals.push('control_flow');
    if (/(?:^|\/)(?:services?|domain|business|workers?|workflows?)(?:[/.]|$)/i.test(source.path)) signals.push('domain_path');
    if (/\.sql$/i.test(source.path) && /\b(?:CREATE|ALTER)\s+TABLE\b/i.test(code)) signals.push('database_schema');
    const refs = databaseReferences(source.path, code, startLine).filter(() => python || adapted || [...calls].some(call => /(?:\.(?:from|table|query|execute)|^query|^execute)$/.test(call)));
    if (refs.length) signals.push('database_query');
    const routes = requestRoutes(code).map(route => `${route.method || 'GET'} ${route.route}`);
    const routeDefinitions = (cachedEndpoints.get(source.path) || []).filter(route => kind === 'module' || route.symbol === name);
    if (routeDefinitions.length) signals.push('api_handler');
    if (calls.size > 30 || imports(source).length > 15 || routes.length + routeDefinitions.length > 20 || refs.length > 20) detailsTruncated = true;
    symbols.push({ id: `${source.path}:${startLine}:${name}`, path: source.path, name, kind, startLine, endLine,
      excerpt: content.slice(0, 500), parser: python ? 'python-indentation-scanner' : adapted ? 'source-adapter' : supported ? 'typescript-ast' : 'unsupported', signals,
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
  return finish({ ...metadata, coverage: metadata.coverage === 'partial' || parseErrors.length || unsupported ? 'partial' : 'complete', stage: 'ast-layers', analysis_query: query, model_calls: 0, notes: [...notes, ...parseErrors.slice(0, 10), ...(unsupported ? ['Some fetched file languages have no AST adapter and remain unclassified.'] : [])], truncated: detailsTruncated || parsed.length > selectedFunctions.length || sources.length > 100,
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
      const direct = symbols.filter(item => item.kind !== 'module' && item.path === symbol.path && (item.name === call || item.name === `${symbol.name}.${call}`));
      const imported = symbol.imports.flatMap(ref => ref.names.filter(name => call === name.local || call.startsWith(`${name.local}.`)).flatMap(name => symbols.filter(item => item.path === ref.target && item.kind !== 'module' && (name.imported === '*' ? item.name === call.split('.').slice(1).join('.') : name.imported === 'default' ? false : item.name === name.imported))));
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

export function ruleClassifier(graph: SeeOutput): SeeOutput {
  if (graph.stage !== 'dependency-graph' || !graph.symbols) throw new Error('Rule Classifier requires Dependency Graph output.');
  const items: LayerRule[] = graph.symbols.map(symbol => {
    const candidates = new Set<CodeLayer>(), evidence: string[] = [];
    if (symbol.signals.some(signal => ['ui_render', 'dom_interaction'].includes(signal))) { candidates.add('presentation'); evidence.push('UI syntax or DOM interaction'); }
    if (symbol.signals.some(signal => ['database_query', 'database_schema'].includes(signal))) { candidates.add('database'); evidence.push(`Data query/schema${symbol.tables.length ? `: ${symbol.tables.join(', ')}` : ''}`); }
    if (symbol.signals.includes('domain_path') && symbol.signals.includes('control_flow') || symbol.signals.includes('api_handler')) { candidates.add('business_logic'); evidence.push(symbol.signals.includes('api_handler') ? 'API handler / orchestration (candidate)' : 'Domain/service path with control flow (candidate)'); }
    if (!candidates.size) evidence.push('Insufficient static evidence');
    return { id: symbol.id, path: symbol.path, name: symbol.name, startLine: symbol.startLine, endLine: symbol.endLine, excerpt: symbol.excerpt, candidates: [...candidates], evidence, confidence: candidates.has('business_logic') ? 'medium' : candidates.size ? 'high' : 'low' };
  });
  return finish({ ...graph, stage: 'rule-classifier', symbols: undefined, edges: graph.items as NonNullable<SeeOutput['edges']>, items, total_items: items.length });
}

export function layerAssignment(classified: SeeOutput): SeeOutput {
  if (classified.stage !== 'rule-classifier') throw new Error('layer_assignment requires Rule Classifier output.');
  const counts: Record<string, number> = { presentation: 0, business_logic: 0, database: 0, mixed: 0, unknown: 0 };
  const items = (classified.items as LayerRule[]).map(item => {
    const layer = item.candidates.length > 1 ? 'mixed' : item.candidates[0] || 'unknown'; counts[layer]++;
    return { ...item, layer };
  });
  return finish({ ...classified, stage: 'layer-assignment', items, counts, total_items: items.length });
}

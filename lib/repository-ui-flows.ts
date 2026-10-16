import ts from 'typescript';
import { posix } from 'node:path';
import { searchFunctions, type RepositoryFunction, type RepositorySource } from './repository-functions';

type ImportRef = { specifier: string; names: Array<{ local: string; imported: string }> };
type Endpoint = { method: string; route: string; path: string; line: number; symbol?: string };
type DatabaseRef = { table: string; columns: string[]; path: string; line: number; schemaFiles: string[]; schemaColumns: string[] };
type FlowFile = { path: string; role: 'ui' | 'api' | 'logic' | 'style' | 'database'; reason: string; shared: boolean };
export type RepositoryFlow = {
  id: string; name: string; kind: 'screen' | 'component' | 'backend'; root: string; score: number;
  files: FlowFile[]; functions: RepositoryFunction[]; endpoints: Endpoint[]; database: DatabaseRef[];
  unresolved: string[]; truncated: boolean;
};

function withoutComments(path: string, code: string): string {
  if (/\.html?$/i.test(path)) return code.replace(/<!--[\s\S]*?-->/g, comment => comment.replace(/[^\n]/g, ' '));
  if (path.endsWith('.py')) {
    let result = '', quote = '';
    for (let i = 0; i < code.length;) {
      if (quote) {
        if (code[i] === '\\') { result += code.slice(i, i + 2); i += 2; }
        else if (code.startsWith(quote, i)) { result += quote; i += quote.length; quote = ''; }
        else result += code[i++];
      } else if (code[i] === '#') {
        while (i < code.length && code[i] !== '\n') { result += ' '; i++; }
      } else if (code[i] === '"' || code[i] === "'") {
        quote = code.startsWith(code[i].repeat(3), i) ? code[i].repeat(3) : code[i];
        result += quote; i += quote.length;
      } else result += code[i++];
    }
    return result;
  }
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.JSX, code);
  const chars = code.split('');
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token !== ts.SyntaxKind.SingleLineCommentTrivia && token !== ts.SyntaxKind.MultiLineCommentTrivia) continue;
    for (let i = scanner.getTokenStart(); i < scanner.getTokenEnd(); i++) if (chars[i] !== '\n') chars[i] = ' ';
  }
  return chars.join('');
}

function identifiers(code: string) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.JSX, code);
  const result = new Set<string>();
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) if (token === ts.SyntaxKind.Identifier) result.add(scanner.getTokenText());
  return result;
}

function imports(source: RepositorySource): ImportRef[] {
  const result: ImportRef[] = [];
  if (source.path.endsWith('.py')) {
    for (const match of source.content.matchAll(/^\s*from\s+([.\w]+)\s+import\s+([^\n]+)/gm)) {
      result.push({ specifier: match[1], names: match[2].replace(/[()]/g, '').split(',').map(part => { const [imported, alias] = part.trim().split(/\s+as\s+/); return { local: alias || imported, imported }; }) });
    }
    for (const match of source.content.matchAll(/^\s*import\s+([\w.]+)(?:\s+as\s+(\w+))?/gm)) result.push({ specifier: match[1], names: [{ local: match[2] || match[1].split('.')[0], imported: '*' }] });
    return result;
  }
  const file = ts.createSourceFile(source.path, source.content, ts.ScriptTarget.Latest, true, /\.[jt]sx$/i.test(source.path) ? ts.ScriptKind.TSX : ts.ScriptKind.JS);
  for (const node of file.statements) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const names: ImportRef['names'] = [];
      if (node.importClause?.name) names.push({ local: node.importClause.name.text, imported: 'default' });
      const bindings = node.importClause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) names.push({ local: bindings.name.text, imported: '*' });
      if (bindings && ts.isNamedImports(bindings)) names.push(...bindings.elements.filter(item => !item.isTypeOnly).map(item => ({ local: item.name.text, imported: item.propertyName?.text || item.name.text })));
      if (node.importClause?.phaseModifier !== ts.SyntaxKind.TypeKeyword) result.push({ specifier: node.moduleSpecifier.text, names });
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) result.push({ specifier: node.moduleSpecifier.text, names: node.exportClause && ts.isNamedExports(node.exportClause) ? node.exportClause.elements.map(item => ({ local: item.name.text, imported: item.propertyName?.text || item.name.text })) : [] });
  }
  for (const match of source.content.matchAll(/(?:require\(|<script[^>]*\bsrc=|<link[^>]*\bhref=)\s*['"]([^'"]+)['"]/g)) result.push({ specifier: match[1], names: [] });
  return result;
}

function resolveImport(source: string, specifier: string, paths: Set<string>): string | undefined {
  const parent = posix.dirname(source);
  const roots: string[] = [];
  if (source.endsWith('.py')) {
    const leading = specifier.match(/^\.+/)?.[0].length || 0;
    const modulePath = specifier.slice(leading).replace(/\./g, '/');
    roots.push(leading ? posix.join(parent, '../'.repeat(leading - 1), modulePath) : modulePath);
  } else if (specifier.startsWith('.')) roots.push(posix.join(parent, specifier));
  else if (specifier.startsWith('@/') || specifier.startsWith('~/')) roots.push(specifier.slice(2), `src/${specifier.slice(2)}`);
  else if (specifier.startsWith('/')) roots.push(specifier.slice(1), `public/${specifier.slice(1)}`, `static/${specifier.slice(1)}`);
  else roots.push(specifier, posix.join(parent, specifier));
  for (const root of roots) {
    const base = root.replace(/\.(?:js|jsx|mjs|cjs)$/, '');
    const candidates = [root, ...['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '/index.ts', '/index.tsx', '/index.js', '/__init__.py'].map(ext => base + ext)];
    const found = candidates.find(path => paths.has(path));
    if (found) return found;
  }
  return undefined;
}

function routeKey(route: string) {
  return route.split('?')[0].replace(/\$\{[^}]+\}|:[\w]+|\[[^\]]+\]|<[^>]+>/g, ':param').replace(/\/+$/, '') || '/';
}

function endpoints(source: RepositorySource, functions: RepositoryFunction[]): Endpoint[] {
  const result: Endpoint[] = [];
  const next = source.path.match(/(?:^|\/)(?:app\/(api\/.*)\/route|pages\/(api\/.*))\.[cm]?[jt]sx?$/);
  if (next) for (const fn of functions.filter(fn => /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(fn.name))) result.push({ path: source.path, route: `/${(next[1] || next[2]).replace(/\/index$/, '')}`, method: fn.name, symbol: fn.name, line: fn.startLine });
  const pattern = source.path.endsWith('.py') ? /@\w+(?:\.\w+)*\.(get|post|put|patch|delete|route)\(\s*['"]([^'"]+)['"]([^\n]*)/g : /\b(?:app|router|server)\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]\s*,\s*([\w$]*)/g;
  const prefix = source.path.endsWith('.py') ? source.content.match(/(?:APIRouter|Blueprint)\([^)]*?(?:prefix|url_prefix)\s*=\s*['"]([^'"]+)['"]/)?.[1] || '' : '';
  for (const match of source.content.matchAll(pattern)) {
    const line = source.content.slice(0, match.index).split('\n').length;
    const nextFunction = source.path.endsWith('.py') ? functions.find(fn => fn.startLine > line) : functions.find(fn => fn.name.split('.').pop() === match[3]) || functions.find(fn => fn.startLine <= line && fn.endLine >= line);
    const methods = match[1] === 'route' ? [...(match[3] || '').matchAll(/['"](GET|POST|PUT|PATCH|DELETE)['"]/g)].map(item => item[1]) : [match[1].toUpperCase()];
    for (const method of methods.length ? methods : ['GET']) result.push({ method, route: prefix + match[2], path: source.path, line, symbol: nextFunction?.name });
  }
  return result;
}

function requestRoutes(code: string): Array<{ route: string; method?: string }> {
  const result: Array<{ route: string; method?: string }> = [];
  for (const match of code.matchAll(/\bfetch\(\s*(['"`])([^'"`]+)\1\s*(?:,\s*\{([^}]*))?/g)) result.push({ route: match[2], method: match[3]?.match(/method\s*:\s*['"](\w+)['"]/)?.[1].toUpperCase() || 'GET' });
  for (const match of code.matchAll(/\b\w+\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]+)\2/g)) if (match[3].startsWith('/')) result.push({ route: match[3], method: match[1].toUpperCase() });
  for (const match of code.matchAll(/<form[^>]*\baction=['"]([^'"]+)['"][^>]*>/gi)) result.push({ route: match[1], method: match[0].match(/method=['"]([^'"]+)['"]/i)?.[1].toUpperCase() || 'GET' });
  return result;
}

function databaseReferences(path: string, code: string, startLine: number): DatabaseRef[] {
  const refs: DatabaseRef[] = [];
  const patterns = [/\.(?:from|table)\(\s*['"]([\w.]+)['"]\s*\)/g, /\b(?:FROM|JOIN|INTO|UPDATE)\s+["`]?([\w.]+)["`]?/gi];
  for (const pattern of patterns) for (const match of code.matchAll(pattern)) {
    if (pattern === patterns[1] && !/\b(?:SELECT|INSERT|UPDATE|DELETE)\b/i.test(code)) continue;
    if (['set', 'select', 'where'].includes(match[1].toLowerCase())) continue;
    const chain = code.slice(match.index, match.index + 1500).split(/;|\n\s*\n/)[0];
    const columns = new Set<string>();
    const selection = chain.match(/\.select\(\s*['"]([^'"]+)['"]/)?.[1];
    if (selection) for (const column of selection.split(',')) if (/^\w+$/.test(column.trim())) columns.add(column.trim());
    for (const column of chain.matchAll(/\.(?:eq|neq|gt|gte|lt|lte|order)\(\s*['"](\w+)['"]/g)) columns.add(column[1]);
    refs.push({ table: match[1], columns: [...columns], path, line: startLine + code.slice(0, match.index).split('\n').length - 1, schemaFiles: [], schemaColumns: [] });
  }
  return refs;
}

export function groupRepositoryFlows(sources: RepositorySource[], allFunctions: RepositoryFunction[], query: string): { groups: RepositoryFlow[]; total_groups: number; grouping_notes: string[] } {
  sources = sources.map(source => ({ ...source, content: withoutComments(source.path, source.content) }));
  const byPath = new Map(sources.map(source => [source.path, source]));
  const paths = new Set(byPath.keys());
  const byFunction = new Map<string, RepositoryFunction[]>();
  for (const fn of allFunctions) { const list = byFunction.get(fn.path) || []; list.push(fn); byFunction.set(fn.path, list); }
  const dependencies = new Map(sources.map(source => [source.path, imports(source).map(ref => ({ ...ref, target: resolveImport(source.path, ref.specifier, paths) }))]));
  const isUI = (source: RepositorySource) => /\.(?:tsx|jsx|html?)$/i.test(source.path) && !/(?:^|\/)(?:api|__tests__|tests)(?:\/|$)|\.(?:test|spec)\./.test(source.path) || source.path.endsWith('.py') && /\b(?:st|streamlit)\.(?:button|title|header|sidebar|form)\b/.test(source.content);
  const ui = sources.filter(isUI);
  const importedUI = new Set(ui.flatMap(source => (dependencies.get(source.path) || []).map(ref => ref.target).filter((path): path is string => Boolean(path))));
  const roots = ui.filter(source => !importedUI.has(source.path) || /(?:^|\/)(?:pages\/.*|app\/(?:.*\/)?page)\.[jt]sx?$/.test(source.path));
  const routes = sources.flatMap(source => endpoints(source, byFunction.get(source.path) || []));
  const rankedFunctions = searchFunctions(allFunctions, query, allFunctions.length);
  const scores = new Map(rankedFunctions.map(fn => [`${fn.path}:${fn.startLine}:${fn.name}`, fn.score]));
  const groups: RepositoryFlow[] = [];
  function makeGroup(root: RepositorySource, kind: RepositoryFlow['kind']) {
    const files = new Map<string, FlowFile>(), selected = new Map<string, RepositoryFunction>(), foundRoutes = new Map<string, Endpoint>(), database = new Map<string, DatabaseRef>(), unresolved = new Set<string>();
    const queue: Array<{ path: string; symbols?: string[]; reason: string }> = [{ path: root.path, reason: kind === 'backend' ? 'Matching code entry' : 'UI entry' }];
    const processed = new Map<string, Set<string>>();
    let truncated = false;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const item = queue[cursor];
      const source = byPath.get(item.path); if (!source) continue;
      if (files.size >= 100 && !files.has(item.path)) { truncated = true; continue; }
      const symbols = item.symbols || ['*'];
      const previous = processed.get(item.path) || new Set<string>();
      if (symbols.every(symbol => previous.has(symbol)) || previous.has('*')) continue;
      symbols.forEach(symbol => previous.add(symbol)); processed.set(item.path, previous);
      const fileFunctions = byFunction.get(item.path) || [];
      const isDefault = symbols.includes('default');
      const defaultName = source.content.match(/export\s+default\s+(?:(?:async\s+)?function\s+|class\s+)?(\w+)/)?.[1];
      let chosen = symbols.includes('*') ? fileFunctions : fileFunctions.filter(fn => symbols.some(symbol => fn.name === symbol || fn.name.startsWith(`${symbol}.`)) || isDefault && (fn.name === defaultName || fn.name.startsWith(`${defaultName}.`)));
      if (!chosen.length && isDefault && fileFunctions.length === 1) chosen = fileFunctions;
      if (!chosen.length && fileFunctions.length && !symbols.includes('*')) unresolved.add(`Unresolved symbol in ${item.path}: ${symbols.join(', ')}`);
      let code = chosen.map(fn => fn.searchText || fn.excerpt).join('\n');
      if (symbols.includes('*') || !fileFunctions.length) code = source.content;
      // Expand references to local helpers before following imports or HTTP calls.
      for (let pass = 0; pass < 8; pass++) {
        const names = identifiers(code);
        const extra = fileFunctions.filter(fn => !chosen.includes(fn) && (names.has(fn.name.split('.').pop()!) || chosen.some(parent => fn.startLine >= parent.startLine && fn.endLine <= parent.endLine)));
        if (!extra.length) break;
        chosen = [...chosen, ...extra]; code += `\n${extra.map(fn => fn.searchText || fn.excerpt).join('\n')}`;
      }
      for (const fn of chosen) {
        const { searchText: _searchText, ...clean } = fn;
        selected.set(`${fn.path}:${fn.startLine}:${fn.name}`, { ...clean, score: scores.get(`${fn.path}:${fn.startLine}:${fn.name}`) || 0 });
      }
      const role: FlowFile['role'] = isUI(source) ? 'ui' : /\.css$/i.test(item.path) ? 'style' : routes.some(route => route.path === item.path) ? 'api' : 'logic';
      files.set(item.path, { path: item.path, role, reason: item.reason, shared: false });
      const used = identifiers(code);
      for (const ref of dependencies.get(item.path) || []) {
        const names = ref.names.filter(name => used.has(name.local));
        if (ref.names.length && !names.length) continue;
        if (ref.target) queue.push({ path: ref.target, symbols: ref.names.length ? names.map(name => name.imported) : undefined, reason: `Imported by ${item.path}` });
        else if (ref.specifier.startsWith('.') || ref.specifier.startsWith('@/')) unresolved.add(`Unresolved import: ${item.path} → ${ref.specifier}`);
      }
      const staticCode = withoutComments(item.path, code);
      if (/\bfetch\(\s*[^'"`\s]/.test(staticCode)) unresolved.add(`Dynamic API request in ${item.path}`);
      for (const request of requestRoutes(staticCode)) {
        const matches = routes.filter(route => routeKey(route.route) === routeKey(request.route) && (!request.method || request.method === route.method));
        if (!matches.length) { unresolved.add(`Unresolved API: ${request.method || ''} ${request.route}`); continue; }
        for (const route of matches) {
          foundRoutes.set(`${route.path}:${route.line}:${route.method}`, route);
          queue.push({ path: route.path, symbols: route.symbol ? [route.symbol] : undefined, reason: `${route.method} ${route.route} called from ${item.path}` });
        }
      }
      if (/\.html?$/i.test(root.path)) for (const route of routes) {
        const handler = (byFunction.get(route.path) || []).find(fn => fn.name === route.symbol);
        const template = (handler?.searchText || '').match(/\brender_template\(\s*['"]([^'"]+)['"]/)?.[1];
        if (template && (root.path === `templates/${template}` || root.path.endsWith(`/templates/${template}`))) {
          foundRoutes.set(`${route.path}:${route.line}:${route.method}`, route);
          queue.push({ path: route.path, symbols: route.symbol ? [route.symbol] : undefined, reason: `Renders ${root.path}` });
        }
      }
      for (const fn of chosen) for (const ref of databaseReferences(item.path, withoutComments(item.path, fn.searchText || fn.excerpt), fn.startLine)) database.set(`${ref.path}:${ref.line}:${ref.table}`, ref);
    }
    for (const ref of database.values()) for (const schema of sources.filter(source => /\.sql$/i.test(source.path))) {
      const escaped = ref.table.split('.').pop()!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = schema.content.match(new RegExp(`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:[\\w]+\\.)?["\x60]?${escaped}["\x60]?\\s*\\(([\\s\\S]*?)\\);`, 'i'));
      if (!match) continue;
      ref.schemaFiles.push(schema.path);
      ref.schemaColumns = [...new Set([...ref.schemaColumns, ...Array.from(match[1].matchAll(/(?:^|,)\s*["`]?([\w]+)["`]?\s+[\w]/g), column => column[1]).filter(column => !['primary', 'foreign', 'constraint', 'unique', 'check'].includes(column.toLowerCase()))])];
      files.set(schema.path, { path: schema.path, role: 'database', reason: `Schema for ${ref.table}`, shared: false });
    }
    const functions = [...selected.values()].sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.startLine - b.startLine);
    const title = root.content.match(/<(?:h1|title)[^>]*>\s*([^<{\n]+)/i)?.[1]?.trim();
    const tokens = query.toLowerCase().split(/\W+/).filter(Boolean);
    const name = title || (/^(?:page|index)\./.test(posix.basename(root.path)) ? posix.basename(posix.dirname(root.path)) : posix.basename(root.path));
    const score = functions.slice(0, 5).reduce((sum, fn) => sum + fn.score, 0) + tokens.filter(token => `${name} ${root.path}`.toLowerCase().includes(token)).length * 8;
    return { id: root.path, name, kind, root: root.path, score, files: [...files.values()].slice(0, 60), functions: functions.slice(0, 40), endpoints: [...foundRoutes.values()].slice(0, 20), database: [...database.values()].slice(0, 20), unresolved: [...unresolved].slice(0, 20), truncated: truncated || files.size > 60 || functions.length > 40 || foundRoutes.size > 20 || database.size > 20 || unresolved.size > 20 };
  }
  for (const root of roots) groups.push(makeGroup(root, /(?:^|\/)(?:pages|templates)\/|(?:^|\/)page\./.test(root.path) || /\.html?$/.test(root.path) ? 'screen' : 'component'));
  const represented = new Set(groups.flatMap(group => group.functions.map(fn => `${fn.path}:${fn.startLine}:${fn.name}`)));
  const unmatchedPaths = [...new Set(rankedFunctions.filter(fn => !represented.has(`${fn.path}:${fn.startLine}:${fn.name}`)).map(fn => fn.path))];
  for (const path of unmatchedPaths.slice(0, 40)) { const source = byPath.get(path); if (source) groups.push(makeGroup(source, 'backend')); }
  const usage = new Map<string, number>();
  for (const group of groups) for (const file of group.files) usage.set(file.path, (usage.get(file.path) || 0) + 1);
  for (const group of groups) for (const file of group.files) file.shared = (usage.get(file.path) || 0) > 1;
  const matched = groups.filter(group => !query.trim() || group.score > 0).sort((a, b) => b.score - a.score || a.root.localeCompare(b.root));
  return { groups: matched.slice(0, 20), total_groups: matched.length, grouping_notes: ['Static references from the scanned commit only. Dynamic imports, runtime routing, and database schema not present in source may be unresolved.'] };
}

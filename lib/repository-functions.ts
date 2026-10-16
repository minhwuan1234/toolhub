import ts from 'typescript';

export type RepositorySource = { path: string; content: string };
export type RepositoryFunction = { path: string; name: string; kind: string; startLine: number; endLine: number; signature: string; excerpt: string; score: number; searchText?: string };
export const supportedSource = /\.(?:[cm]?[jt]sx?|py)$/i;
export const excludedSource = /(?:^|\/)(?:node_modules|vendor|dist|build|coverage|\.git|\.next|__pycache__|\.venv|venv)(?:\/|$)|(?:\.min\.[jt]s|\.d\.ts)$/i;

function record(path: string, name: string, kind: string, content: string, start: number, end: number): RepositoryFunction {
  const code = content.slice(start, end);
  return { path, name, kind, startLine: content.slice(0, start).split('\n').length, endLine: content.slice(0, end).split('\n').length, signature: code.split('\n')[0].slice(0, 180), excerpt: code.slice(0, 360) + (code.length > 360 ? '\n…' : ''), score: 0, searchText: code };
}

export function extractFunctions({ path, content }: RepositorySource): { functions: RepositoryFunction[]; errors: string[] } {
  if (path.endsWith('.py')) return extractPythonFunctions(path, content);
  const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true, /\.[jt]sx$/i.test(path) ? ts.ScriptKind.TSX : /\.[cm]?js$/i.test(path) ? ts.ScriptKind.JS : ts.ScriptKind.TS);
  const functions: RepositoryFunction[] = [];
  function visit(node: ts.Node, scope: string[]) {
    let nextScope = scope;
    if (ts.isClassDeclaration(node) && node.name) nextScope = [...scope, node.name.text];
    const callable = ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node) || ts.isGetAccessor(node) || ts.isSetAccessor(node) || ts.isConstructorDeclaration(node);
    if (callable && node.body) {
      let name = ts.isConstructorDeclaration(node) ? 'constructor' : 'name' in node && node.name ? node.name.getText(source) : '';
      if (!name && ts.isVariableDeclaration(node.parent)) name = node.parent.name.getText(source);
      if (!name && ts.isPropertyAssignment(node.parent)) name = node.parent.name.getText(source);
      if (!name && ts.isPropertyDeclaration(node.parent) && node.parent.name) name = node.parent.name.getText(source);
      if (!name) name = `<callback:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}>`;
      const fullName = [...scope, name].join('.');
      const kind = ts.isArrowFunction(node) ? 'arrow' : ts.isMethodDeclaration(node) || ts.isConstructorDeclaration(node) ? 'method' : 'function';
      const item = record(path, fullName, kind, content, node.getStart(source), node.end);
      item.signature = content.slice(node.getStart(source), node.body.getStart(source)).replace(/\s+/g, ' ').trim().slice(0, 180);
      functions.push(item);
      nextScope = [...scope, name];
    }
    ts.forEachChild(node, child => visit(child, nextScope));
  }
  visit(source, []);
  const diagnostics = (source as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics || [];
  return { functions, errors: diagnostics.length ? [`${path}: syntax errors; extracted functions may be incomplete.`] : [] };
}

function extractPythonFunctions(path: string, content: string) {
  // Indentation scanner masks strings and comments before recognizing declarations.
  // It reports function boundaries, including async functions and class methods.
  const lines = content.split('\n');
  let quote = '';
  const masked = lines.map(line => {
    let result = '';
    for (let i = 0; i < line.length;) {
      if (quote) {
        if (line[i] === '\\') { result += '  '; i += 2; }
        else if (line.startsWith(quote, i)) { result += ' '.repeat(quote.length); i += quote.length; quote = ''; }
        else { result += line[i] === '\t' ? '\t' : ' '; i++; }
      } else if (line[i] === '#') { result += ' '.repeat(line.length - i); break; }
      else if (line[i] === '"' || line[i] === "'") { quote = line.startsWith(line[i].repeat(3), i) ? line[i].repeat(3) : line[i]; result += ' '.repeat(quote.length); i += quote.length; }
      else result += line[i++];
    }
    if (quote.length === 1 && !line.endsWith('\\')) quote = '';
    return result;
  });
  const indentation = (line: string) => (line.match(/^\s*/)?.[0] || '').replace(/\t/g, '        ').length;
  const scopes: Array<{ indent: number; name: string; kind: string }> = [];
  const functions: RepositoryFunction[] = [];
  let offset = 0, continuationDepth = 0;
  for (let index = 0; index < lines.length; index++) {
    const clean = masked[index];
    const indent = indentation(clean);
    if (clean.trim() && continuationDepth === 0) while (scopes.length && scopes.at(-1)!.indent >= indent) scopes.pop();
    const match = continuationDepth === 0 ? clean.match(/^\s*(?:(?:async\s+)?def\s+([\w]+)\s*\(|class\s+([\w]+)\b)/) : null;
    if (match) {
      const name = match[1] || match[2];
      const kind = match[2] ? 'class' : scopes.at(-1)?.kind === 'class' ? 'method' : 'function';
      if (match[1]) {
        let last = index;
        let depth = 0;
        for (let j = index; j < lines.length; j++) {
          if (j > index && depth === 0 && masked[j].trim() && indentation(masked[j]) <= indent) break;
          for (const char of masked[j]) { if ('([{'.includes(char)) depth++; else if (')]}'.includes(char)) depth--; }
          last = j;
        }
        while (last > index && !lines[last].trim()) last--;
        const end = offset + lines.slice(index, last + 1).join('\n').length;
        functions.push(record(path, [...scopes.map(scope => scope.name), name].join('.'), kind, content, offset + lines[index].search(/\S/), end));
      }
      scopes.push({ indent, name, kind });
    }
    for (const char of clean) { if ('([{'.includes(char)) continuationDepth++; else if (')]}'.includes(char)) continuationDepth--; }
    offset += lines[index].length + 1;
  }
  return { functions, errors: quote.length === 3 ? [`${path}: unterminated Python string; extraction may be incomplete.`] : [] };
}

function words(value: string) {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

export function searchFunctions(functions: RepositoryFunction[], query: string, limit = 200): RepositoryFunction[] {
  const terms = [...new Set(words(query))];
  return functions.map(item => {
    const name = words(item.name), path = words(item.path), body = words(item.searchText || `${item.signature} ${item.excerpt}`);
    const score = terms.reduce((sum, term) => sum + (name.includes(term) ? 8 : 0) + (path.includes(term) ? 4 : 0) + (body.includes(term) ? 1 : 0), 0);
    const { searchText: _searchText, ...result } = item;
    return { ...result, score };
  }).filter(item => !terms.length || item.score > 0).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.startLine - b.startLine).slice(0, limit);
}

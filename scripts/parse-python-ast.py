"""Parse source supplied on stdin. Never import or execute repository code."""
import ast
import json
import sys

if sys.platform == 'linux':
    import resource
    resource.setrlimit(resource.RLIMIT_CPU, (12, 12))
    resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024, 512 * 1024 * 1024))


def dotted(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        parent = dotted(node.value)
        return parent + '.' + node.attr if parent else ''
    if isinstance(node, ast.Call):
        return dotted(node.func)
    return ''


def analyze(source):
    tree = ast.parse(source['content'], filename=source['path'])
    aliases, imports = {}, []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for item in node.names:
                local = item.asname or item.name.split('.')[0]
                aliases[local] = item.name if item.asname else local
                imports.append({'specifier': item.name, 'names': [{'local': local, 'imported': '*'}]})
        elif isinstance(node, ast.ImportFrom):
            module = '.' * node.level + (node.module or '')
            imports.append({'specifier': module, 'names': [{'local': item.asname or item.name, 'imported': item.name} for item in node.names]})
            for item in node.names:
                aliases[item.asname or item.name] = module + '.' + item.name

    def canonical(call):
        first, _, rest = call.partition('.')
        return aliases.get(first, first) + ('.' + rest if rest else '')

    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.Call) and canonical(dotted(node.value.func)) == 'logging.getLogger':
            for target in node.targets:
                if isinstance(target, ast.Name):
                    aliases[target.id] = 'logging'

    def facts(node):
        # Child functions/classes own their bodies; docstrings and comments are never calls.
        nodes = []
        def collect(current):
            nodes.append(current)
            for child in ast.iter_child_nodes(current):
                if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                    continue
                collect(child)
        collect(node)
        calls = list(dict.fromkeys(dotted(item.func) for item in nodes if isinstance(item, ast.Call) and dotted(item.func)))
        raised = {dotted(item.func) for current in nodes if isinstance(current, ast.Raise) for item in ast.walk(current) if isinstance(item, ast.Call)}
        parameters = {arg.arg for arg in ast.walk(node.args) if isinstance(arg, ast.arg)} if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) else set()
        active = [('local.' + call if call.split('.')[0] in parameters else canonical(call)) for call in calls if call not in raised]
        signals = []
        if any(isinstance(item, (ast.If, ast.For, ast.AsyncFor, ast.While, ast.Try, ast.Match)) for item in nodes):
            signals.append('control_flow')
        if any(isinstance(item, (ast.Await, ast.Yield, ast.Raise, ast.AugAssign)) for item in nodes):
            signals.append('mutation_or_effect')
        if any(isinstance(item, (ast.Assign, ast.AnnAssign)) and any(isinstance(child, (ast.Attribute, ast.Subscript)) for child in ast.iter_child_nodes(item)) for item in nodes):
            signals.append('mutation_or_effect')
        transforms = {'str', 'int', 'float', 'len', 'round', 'sorted', 'sum', 'min', 'max', 'abs'}
        def transform(call):
            return call in transforms or call.rsplit('.', 1)[-1] in {'strip', 'lower', 'upper', 'split', 'join', 'replace', 'format'}
        if any(isinstance(item, ast.BinOp) for item in nodes) or any(transform(call) for call in active):
            signals.append('data_transform')
        clock = {'time.monotonic', 'time.perf_counter', 'time.time', 'time.sleep', 'asyncio.sleep'}
        logging = any(call.startswith('logging.') for call in active)
        timing = any(call in clock for call in active)
        utility_only = all(call in clock or call.startswith('logging.') or transform(call) for call in active)
        if active and utility_only:
            if timing:
                signals.append('utility_timing')
            if logging:
                signals.append('utility_logging')
        if timing and not utility_only and any(isinstance(item, (ast.For, ast.While)) for item in nodes) and any(isinstance(item, ast.Try) for item in nodes):
            signals.append('retry_orchestration')
        if any(call.startswith(('page.locator', 'page.get_by_', 'page.goto', 'browser.new_', 'context.new_page')) for call in calls):
            signals.append('browser_automation')
        if any(call.rsplit('.', 1)[-1] in {'execute', 'executemany', 'fetchone', 'fetchall', 'commit', 'rollback'} and call.split('.')[0] in {'db', 'cursor', 'conn', 'connection', 'session'} for call in calls):
            signals.append('database_client_call')
        tables, requests, definitions = [], [], []
        for item in nodes:
            if not isinstance(item, ast.Call) or not item.args or not isinstance(item.args[0], ast.Constant) or not isinstance(item.args[0].value, str):
                continue
            call = dotted(item.func)
            argument = item.args[0].value
            if call.rsplit('.', 1)[-1] in {'table', 'from_'}:
                tables.append(argument)
            if call.split('.')[0] in {'requests', 'httpx', 'client'} and call.rsplit('.', 1)[-1] in {'get', 'post', 'put', 'patch', 'delete'} and argument.startswith('/'):
                requests.append(call.rsplit('.', 1)[-1].upper() + ' ' + argument)
        for decorator in getattr(node, 'decorator_list', []):
            if isinstance(decorator, ast.Call) and decorator.args and isinstance(decorator.args[0], ast.Constant) and isinstance(decorator.args[0].value, str):
                method = dotted(decorator.func).rsplit('.', 1)[-1]
                if method in {'get', 'post', 'put', 'patch', 'delete', 'route'}:
                    methods = ['GET'] if method == 'route' else [method.upper()]
                    for keyword in decorator.keywords:
                        if keyword.arg == 'methods' and isinstance(keyword.value, (ast.List, ast.Tuple)):
                            methods = [item.value.upper() for item in keyword.value.elts if isinstance(item, ast.Constant) and isinstance(item.value, str)]
                    definitions.extend(method + ' ' + decorator.args[0].value for method in methods)
        return {'calls': calls, 'signals': list(dict.fromkeys(signals)), 'tables': list(dict.fromkeys(tables)), 'requests': list(dict.fromkeys(requests)), 'definitions': definitions}

    functions = []
    def walk(node, scope=(), class_scope=False):
        for child in ast.iter_child_nodes(node):
            if isinstance(child, ast.ClassDef):
                walk(child, scope + (child.name,), True)
            elif isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                functions.append({'name': '.'.join(scope + (child.name,)), 'kind': 'method' if class_scope else 'function', 'startLine': child.lineno, 'endLine': child.end_lineno, **facts(child)})
                walk(child, scope + (child.name,), False)
            else:
                walk(child, scope, class_scope)
    walk(tree)
    module_facts = facts(tree)
    return {'path': source['path'], 'imports': imports, 'functions': functions, 'module': module_facts}


if __name__ == '__main__':
    result = []
    for source in json.load(sys.stdin):
        try:
            result.append(analyze(source))
        except (SyntaxError, ValueError, RecursionError, MemoryError) as error:
            result.append({'path': source['path'], 'error': 'Python AST: ' + type(error).__name__ + ((' at line ' + str(error.lineno)) if isinstance(error, SyntaxError) else '')})
    json.dump(result, sys.stdout, ensure_ascii=True)

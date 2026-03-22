"""Parse Python import statements to map names to source modules."""
import ast
import sys

# stdlib module names (subset of most common)
_STDLIB = set(sys.stdlib_module_names) if hasattr(sys, "stdlib_module_names") else set()

def parse_imports(source: str) -> dict[str, str]:
    """Parse source code, return {imported_name: module_path}.

    Example: 'from database.repo import find_user' -> {"find_user": "database.repo"}
    Skips stdlib imports.
    """
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return {}

    result = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            module = node.module or ""
            # Relative imports: prepend dots
            if node.level > 0:
                module = "." * node.level + module
            # Skip stdlib
            top_level = module.lstrip(".").split(".")[0] if module else ""
            if top_level in _STDLIB:
                continue
            for alias in (node.names or []):
                name = alias.asname or alias.name
                if name != "*":
                    result[name] = module

    return result

"""Symbol extractor: AST-based, zero LLM."""
import ast
from dataclasses import dataclass, field


@dataclass
class SymbolEntry:
    qualified_name: str
    kind: str  # "function" | "class" | "method" | "async_function" | "async_method"
    signature: str
    file: str
    line: int
    docstring: str = ""
    calls: list[str] = field(default_factory=list)
    called_by: list[str] = field(default_factory=list)
    metadata_class_name: str = ""  # for methods: owning class (C1 resolution)


def extract_symbols(
    source: str, repo: str, module_path: str, file_path: str
) -> list[SymbolEntry]:
    """Extract all functions, classes, methods from Python source."""
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return []

    symbols: list[SymbolEntry] = []

    # Build parent map for class detection
    for node in ast.walk(tree):
        for child in ast.iter_child_nodes(node):
            child._parent = node  # type: ignore[attr-defined]

    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if node.name.startswith("__") and node.name != "__init__":
                continue
            parent = getattr(node, "_parent", None)
            is_method = isinstance(parent, ast.ClassDef)
            class_name = parent.name if is_method else ""

            if is_method:
                qname = f"{repo}::{module_path}::{parent.name}.{node.name}"
                kind = (
                    "async_method"
                    if isinstance(node, ast.AsyncFunctionDef)
                    else "method"
                )
            else:
                qname = f"{repo}::{module_path}::{node.name}"
                kind = (
                    "async_function"
                    if isinstance(node, ast.AsyncFunctionDef)
                    else "function"
                )

            sig = _format_signature(node, class_name)
            calls = _extract_calls(node)
            doc = ast.get_docstring(node) or ""
            if doc and "\n" in doc:
                doc = doc.split("\n")[0]

            symbols.append(
                SymbolEntry(
                    qualified_name=qname,
                    kind=kind,
                    signature=sig,
                    file=file_path,
                    line=node.lineno,
                    docstring=doc,
                    calls=calls,
                    metadata_class_name=class_name,
                )
            )

        elif isinstance(node, ast.ClassDef):
            qname = f"{repo}::{module_path}::{node.name}"
            init = next(
                (
                    n
                    for n in node.body
                    if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
                    and n.name == "__init__"
                ),
                None,
            )
            sig = (
                _format_signature(init, node.name, as_class=True)
                if init
                else f"{node.name}()"
            )
            doc = ast.get_docstring(node) or ""
            symbols.append(
                SymbolEntry(
                    qualified_name=qname,
                    kind="class",
                    signature=sig,
                    file=file_path,
                    line=node.lineno,
                    docstring=doc,
                )
            )

    # Extract module-level constants (UPPER_CASE or _UPPER)
    for node in ast.iter_child_nodes(tree):
        if isinstance(node, ast.Assign) and len(node.targets) == 1:
            target = node.targets[0]
            if isinstance(target, ast.Name):
                name = target.id
                if name.isupper() or (name.startswith("_") and name[1:].isupper()):
                    qname = f"{repo}::{module_path}::{name}"
                    symbols.append(
                        SymbolEntry(
                            qualified_name=qname,
                            kind="constant",
                            signature=f"{name} = ...",
                            file=file_path,
                            line=node.lineno,
                        )
                    )

    return symbols


def _format_signature(
    node: ast.FunctionDef | ast.AsyncFunctionDef | None,
    class_name: str = "",
    as_class: bool = False,
) -> str:
    """Build signature string from AST node."""
    if node is None:
        return ""
    args = []
    for arg in node.args.args:
        if arg.arg in ("self", "cls"):
            continue
        ann = f": {ast.unparse(arg.annotation)}" if arg.annotation else ""
        args.append(f"{arg.arg}{ann}")
    # defaults
    defaults = node.args.defaults
    offset = len(node.args.args) - len(defaults)
    for i, default in enumerate(defaults):
        idx = i + offset
        if idx < len(args):
            args[idx] += f" = {ast.unparse(default)}"
    ret = f" -> {ast.unparse(node.returns)}" if node.returns else ""
    name = class_name if as_class else node.name
    return f"{name}({', '.join(args)}){ret}"


def _extract_calls(node: ast.AST) -> list[str]:
    """Extract function/method names called within this node."""
    calls: set[str] = set()
    for child in ast.walk(node):
        if isinstance(child, ast.Call):
            if isinstance(child.func, ast.Name):
                calls.add(child.func.id)
            elif isinstance(child.func, ast.Attribute):
                calls.add(child.func.attr)
    return sorted(calls)


def build_reverse_index(all_symbols: list[SymbolEntry]) -> None:
    """Populate called_by for all symbols (mutates in place)."""
    name_to_symbols: dict[str, list[SymbolEntry]] = {}
    for sym in all_symbols:
        bare = sym.qualified_name.split("::")[-1].split(".")[-1]
        name_to_symbols.setdefault(bare, []).append(sym)

    for caller in all_symbols:
        for call_name in caller.calls:
            for target in name_to_symbols.get(call_name, []):
                if caller.qualified_name not in target.called_by:
                    target.called_by.append(caller.qualified_name)

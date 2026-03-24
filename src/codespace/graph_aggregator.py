"""Resolve bare call names to qualified edges, aggregate to module level."""
from collections import defaultdict
from dataclasses import dataclass, field
from codespace.symbols import SymbolEntry
from codespace.imports import parse_imports

COMMON_NAMES = frozenset({
    "get", "set", "run", "create", "update", "delete", "init",
    "open", "close", "read", "write", "start", "stop", "join",
    "append", "extend", "pop", "keys", "values", "items",
    "format", "strip", "split", "replace", "lower", "upper",
    "print", "len", "str", "int", "float", "bool", "list", "dict",
    "isinstance", "hasattr", "getattr", "setattr",
})


@dataclass
class ResolvedEdge:
    source: str  # qualified name
    target: str  # qualified name
    type: str = "call"
    confidence: str = "high"  # "high" | "medium" | "low"
    scope: str = "inter"  # "inter" (cross-module) | "intra" (same-module)


def _extract_module(qname: str) -> str:
    """'repo::auth.service::login' -> 'repo::auth.service'"""
    parts = qname.split("::")
    return "::".join(parts[:2]) if len(parts) >= 2 else qname


def _bare_name(qname: str) -> str:
    """'repo::auth.service::AuthService.login' -> 'login'"""
    return qname.split("::")[-1].split(".")[-1]


def _module_overlap(qname: str, import_path: str) -> int:
    """Score how well a qualified name matches an import path."""
    module_part = qname.split("::")[1] if "::" in qname else ""
    import_clean = import_path.lstrip(".")
    parts_m = module_part.split(".")
    parts_i = import_clean.split(".")
    overlap = 0
    for a, b in zip(parts_m, parts_i):
        if a == b:
            overlap += 1
        else:
            break
    return overlap


def _resolve(
    candidates: list[str],
    caller_module: str,
    caller_imports: dict[str, str],
) -> list[tuple[str, str]]:
    """Resolve candidates with priority: import > same-module > unique > ambiguous."""
    call_name = _bare_name(candidates[0])

    # Priority 1: Import-aware
    if call_name in caller_imports:
        import_module = caller_imports[call_name]
        for c in candidates:
            module_part = c.split("::")[1] if "::" in c else ""
            if import_module.replace(".", ".") in module_part.replace(".", "."):
                return [(c, "high")]
        # Import found but no candidate matches -- still use import as hint
        # Pick candidate whose module path has the most overlap
        best = max(candidates, key=lambda c: _module_overlap(c, import_module))
        return [(best, "high")]

    # Priority 2: Same module
    same = [c for c in candidates if _extract_module(c) == caller_module]
    if len(same) == 1:
        return [(same[0], "high")]

    # Priority 3: Unique in repo
    non_same = [c for c in candidates if _extract_module(c) != caller_module]
    if len(non_same) == 1:
        return [(non_same[0], "medium")]

    # Priority 4: Ambiguous
    if len(non_same) > 1:
        return [(c, "low") for c in non_same]

    return []


def aggregate_edges(
    symbols: list[SymbolEntry],
    file_contents: dict[str, str],
) -> tuple[list[ResolvedEdge], dict[tuple[str, str], dict]]:
    """Resolve calls to qualified edges, aggregate to module level.

    Returns: (function_edges, module_edges)
    """
    # Step 1: Build lookup index
    name_to_qualified: dict[str, list[str]] = defaultdict(list)
    for sym in symbols:
        bare = _bare_name(sym.qualified_name)
        name_to_qualified[bare].append(sym.qualified_name)

    # Cache parsed imports per file
    import_cache: dict[str, dict[str, str]] = {}

    def get_imports(file_path: str) -> dict[str, str]:
        if file_path not in import_cache:
            source = file_contents.get(file_path, "")
            import_cache[file_path] = parse_imports(source)
        return import_cache[file_path]

    # Step 2: Resolve calls to qualified edges
    func_edges: list[ResolvedEdge] = []

    for sym in symbols:
        caller_module = _extract_module(sym.qualified_name)
        caller_imports = get_imports(sym.file)

        for call_name in sym.calls:
            # Skip common names unless import-aware
            if call_name in COMMON_NAMES and call_name not in caller_imports:
                continue

            candidates = name_to_qualified.get(call_name, [])
            if not candidates:
                continue

            resolved = _resolve(candidates, caller_module, caller_imports)
            for target_qname, confidence in resolved:
                target_module = _extract_module(target_qname)
                scope = "intra" if caller_module == target_module else "inter"
                # Skip self-calls
                if target_qname == sym.qualified_name:
                    continue
                func_edges.append(ResolvedEdge(
                    source=sym.qualified_name,
                    target=target_qname,
                    confidence=confidence,
                    scope=scope,
                ))

    # Step 3: Aggregate to module level (inter edges only)
    module_edges: dict[tuple[str, str], dict] = defaultdict(
        lambda: {"weight": 0, "children": []}
    )
    for edge in func_edges:
        if edge.scope == "intra":
            continue
        key = (_extract_module(edge.source), _extract_module(edge.target))
        module_edges[key]["weight"] += 1
        module_edges[key]["children"].append(
            f"{_bare_name(edge.source)}->{_bare_name(edge.target)}"
        )

    return func_edges, dict(module_edges)

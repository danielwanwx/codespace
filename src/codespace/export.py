"""Export codespace_graph.json for G6 frontend."""
from datetime import datetime, timezone
from codespace.clusters import Cluster
from codespace.symbols import SymbolEntry
from codespace.graph_aggregator import ResolvedEdge


def build_codespace_graph(
    repo_name: str,
    clusters: list[Cluster],
    symbols: list[SymbolEntry],
    func_edges: list[ResolvedEdge],
    mod_edges: dict[tuple[str, str], dict],
    global_context: str = "",
    summaries: dict[str, str] | None = None,
    wiki_paths: dict[str, str] | None = None,
    importance_scores: dict[str, float] | None = None,
    categories: dict[str, str] | None = None,
) -> dict:
    """Assemble the full codespace_graph.json structure."""
    summaries = summaries or {}
    wiki_paths = wiki_paths or {}
    nodes = []
    edges = []

    # Repo node
    nodes.append({
        "id": repo_name,
        "type": "repo",
        "label": repo_name,
        "semantic_label": repo_name,
        "parent": None,
        "repo": repo_name,
        "summary_l1": summaries.get(repo_name),
        "wiki_path": wiki_paths.get(repo_name),
    })

    # Cluster (module) nodes
    for cluster in clusters:
        nodes.append({
            "id": cluster.id,
            "type": "module",
            "label": cluster.name,
            "semantic_label": cluster.semantic_label,
            "parent": cluster.parent_id,
            "repo": repo_name,
            "path": cluster.path,
            "file_count": cluster.file_count,
            "symbol_count": cluster.symbol_count,
            "summary_l1": summaries.get(cluster.id),
            "wiki_path": wiki_paths.get(cluster.id),
        })

    # Symbol (function/class) nodes
    for sym in symbols:
        parts = sym.qualified_name.split("::")
        parent_module = f"{parts[0]}::{parts[1]}" if len(parts) >= 2 else repo_name
        nodes.append({
            "id": sym.qualified_name,
            "type": sym.kind if sym.kind in ("class",) else "function",
            "label": sym.signature or sym.qualified_name.split("::")[-1],
            "semantic_label": None,
            "parent": parent_module,
            "repo": repo_name,
            "file": sym.file,
            "line": sym.line,
            "signature": sym.signature,
            "docstring": sym.docstring,
            "class_name": sym.metadata_class_name,
            "calls": sym.calls,
            "called_by": sym.called_by,
            "summary_l1": summaries.get(sym.qualified_name),
            "wiki_path": wiki_paths.get(sym.qualified_name),
            "importance": importance_scores.get(sym.qualified_name) if importance_scores else None,
            "category": categories.get(sym.qualified_name) if categories else None,
        })

    # Module-level edges
    for (src_mod, tgt_mod), data in mod_edges.items():
        edges.append({
            "source": src_mod,
            "target": tgt_mod,
            "type": "call",
            "weight": data["weight"],
            "children_edges": data["children"],
        })

    # Function-level edges
    for e in func_edges:
        edges.append({
            "source": e.source,
            "target": e.target,
            "type": e.type,
            "weight": 1,
            "confidence": e.confidence,
        })

    return {
        "metadata": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "repos": [repo_name],
            "stats": {
                "repos": 1,
                "modules": len(clusters),
                "functions": sum(1 for s in symbols if s.kind != "class"),
                "classes": sum(1 for s in symbols if s.kind == "class"),
                "edges": len(edges),
            },
        },
        "global_context": global_context,
        "nodes": nodes,
        "edges": edges,
    }

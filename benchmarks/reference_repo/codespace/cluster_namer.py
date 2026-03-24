"""Generate semantic names for clusters using LLM."""
from codespace.clusters import Cluster
from codespace.llm import LLMClient
from codespace.symbols import SymbolEntry


def _build_naming_prompt(cluster: Cluster, symbols_summary: str) -> str:
    return (
        f"This code module is at path '{cluster.path}' with directory name '{cluster.name}'.\n"
        f"It contains these symbols: {symbols_summary}\n\n"
        f"Give a 1-3 word semantic name describing what this module does. "
        f"Examples: 'Authentication', 'Data Persistence', 'API Gateway', 'Payment Processing'.\n"
        f"Reply with ONLY the name, nothing else."
    )


def _get_symbols_for_cluster(cluster: Cluster, symbols: list[SymbolEntry]) -> str:
    """Get a summary of symbols belonging to this cluster."""
    prefix = cluster.id.replace(cluster.parent_id + "::", "")
    matching = [s for s in symbols if prefix in s.qualified_name]
    names = [s.qualified_name.split("::")[-1] for s in matching[:15]]
    return ", ".join(names) if names else cluster.name


def name_clusters(
    clusters: list[Cluster],
    symbols_by_module: dict[str, list[SymbolEntry]],
    llm_client: LLMClient | None = None,
) -> None:
    """Populate semantic_label for each cluster (mutates in place)."""
    for cluster in clusters:
        if llm_client and llm_client.provider != "none":
            syms = symbols_by_module.get(cluster.id, [])
            summary = ", ".join(s.qualified_name.split("::")[-1] for s in syms[:15])
            prompt = _build_naming_prompt(cluster, summary or cluster.name)
            try:
                label = llm_client.complete(prompt, max_tokens=20).strip().strip('"\'')
                cluster.semantic_label = label if label else cluster.name
            except Exception:
                cluster.semantic_label = cluster.name
        else:
            cluster.semantic_label = cluster.name

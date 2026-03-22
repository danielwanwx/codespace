"""Cluster formation: modules → visual clusters."""
from dataclasses import dataclass, field
from codespace.indexer import Module
from codespace.symbols import SymbolEntry

@dataclass
class Cluster:
    id: str           # "myrepo::src.auth"
    name: str         # "auth"
    path: str         # "src/auth"
    parent_id: str    # "myrepo"
    file_count: int = 0
    symbol_count: int = 0
    semantic_label: str = ""  # LLM-generated, filled later

def form_clusters(
    modules: list[Module],
    symbols: list[SymbolEntry],
    repo_name: str,
) -> list[Cluster]:
    """Convert modules to clusters. Modules already handle merge-small via indexer."""
    # Count symbols per module
    module_symbol_count: dict[str, int] = {}
    for sym in symbols:
        parts = sym.qualified_name.split("::")
        if len(parts) >= 2:
            mod_key = f"{parts[0]}::{parts[1]}"
            module_symbol_count[mod_key] = module_symbol_count.get(mod_key, 0) + 1

    clusters = []
    for mod in modules:
        cluster_id = f"{repo_name}::{mod.slug}"
        clusters.append(Cluster(
            id=cluster_id,
            name=mod.name,
            path=mod.path,
            parent_id=repo_name,
            file_count=len(mod.files),
            symbol_count=module_symbol_count.get(cluster_id, 0),
        ))

    return clusters

"""Graph-topology importance scoring for symbols."""
from codespace.symbols import SymbolEntry
from codespace.graph_aggregator import ResolvedEdge


def score_importance(
    symbols: list[SymbolEntry],
    func_edges: list[ResolvedEdge],
) -> dict[str, float]:
    """Score each symbol 0.0-1.0 based on graph topology.

    Signals:
      - fan_in: number of distinct callers (from called_by)
      - fan_out: number of distinct callees (from calls)
      - cross_module: number of cross-module edges involving this symbol
      - edge_confidence: bonus for high-confidence edges
    """
    if not symbols:
        return {}

    # Count cross-module edges per symbol from resolved func_edges
    cross_module_count: dict[str, int] = {}
    high_conf_count: dict[str, int] = {}
    for edge in func_edges:
        for qname in (edge.source, edge.target):
            cross_module_count[qname] = cross_module_count.get(qname, 0) + 1
            if edge.confidence == "high":
                high_conf_count[qname] = high_conf_count.get(qname, 0) + 1

    raw_scores: dict[str, float] = {}
    for sym in symbols:
        fan_in = len(sym.called_by)
        fan_out = len(sym.calls)
        cross = cross_module_count.get(sym.qualified_name, 0)
        high_conf = high_conf_count.get(sym.qualified_name, 0)

        # Weighted combination (fan-in most important)
        raw = (
            fan_in * 3.0
            + fan_out * 1.0
            + cross * 2.0
            + high_conf * 0.5
        )
        raw_scores[sym.qualified_name] = raw

    # Normalize to 0.0-1.0
    max_raw = max(raw_scores.values()) if raw_scores else 1.0
    if max_raw == 0:
        max_raw = 1.0

    return {
        name: round(raw / max_raw, 4)
        for name, raw in raw_scores.items()
    }


def classify_symbols(
    symbols: list[SymbolEntry],
    func_edges: list[ResolvedEdge],
) -> dict[str, str]:
    """Classify symbols into categories based on graph topology.

    Categories:
      - 'hub': high fan-in AND high fan-out (orchestrators)
      - 'api': high fan-in, low fan-out, cross-module callers (entry points)
      - 'test': zero fan-in AND zero cross-module edges (leaf callers)
      - 'util': private functions (_prefix) with low connectivity
      - 'internal': everything else
    """
    if not symbols:
        return {}

    # Count cross-module IN-edges (someone calls this symbol from another module)
    cross_in_count: dict[str, int] = {}
    cross_module_count: dict[str, int] = {}
    for edge in func_edges:
        cross_in_count[edge.target] = cross_in_count.get(edge.target, 0) + 1
        for qname in (edge.source, edge.target):
            cross_module_count[qname] = cross_module_count.get(qname, 0) + 1

    categories: dict[str, str] = {}
    for sym in symbols:
        fan_in = len(sym.called_by)
        fan_out = len(sym.calls)
        cross = cross_module_count.get(sym.qualified_name, 0)
        cross_in = cross_in_count.get(sym.qualified_name, 0)
        bare_name = sym.qualified_name.split("::")[-1].split(".")[-1]

        if fan_in >= 4 and fan_out >= 4:
            categories[sym.qualified_name] = "hub"
        elif fan_out >= 6 and fan_in == 0:
            # High fan-out entry point with no callers → hub (e.g. main())
            categories[sym.qualified_name] = "hub"
        elif fan_in >= 3 and cross >= 2:
            categories[sym.qualified_name] = "api"
        elif fan_in >= 2 and not bare_name.startswith("_"):
            # Called by multiple symbols, public name → api
            categories[sym.qualified_name] = "api"
        elif fan_in >= 1 and fan_out >= 4 and not bare_name.startswith("_"):
            # Public pipeline function with substantial fan-out → api
            categories[sym.qualified_name] = "api"
        elif fan_in == 0 and cross_in == 0 and fan_out <= 2:
            # No callers and low fan-out → test/noise
            categories[sym.qualified_name] = "test"
        elif bare_name.startswith("_") and fan_in <= 1 and fan_out <= 1:
            categories[sym.qualified_name] = "util"
        elif bare_name.startswith("_"):
            categories[sym.qualified_name] = "util"
        else:
            categories[sym.qualified_name] = "internal"

    return categories

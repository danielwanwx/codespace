import json
from codespace.export import build_codespace_graph
from codespace.clusters import Cluster
from codespace.symbols import SymbolEntry
from codespace.graph_aggregator import ResolvedEdge

def test_export_structure():
    clusters = [Cluster(id="r::auth", name="auth", path="src/auth",
                        parent_id="r", semantic_label="Authentication")]
    symbols = [SymbolEntry(
        qualified_name="r::auth.service::login", kind="function",
        signature="login(email, password)", file="src/auth/service.py",
        line=42, docstring="Login user.", calls=["find_user"],
    )]
    func_edges = [ResolvedEdge(source="r::auth.service::login",
                                target="r::db.repo::find_user", confidence="high")]
    mod_edges = {("r::auth.service", "r::db.repo"): {"weight": 1, "children": ["login->find_user"]}}

    graph = build_codespace_graph("myrepo", clusters, symbols, func_edges, mod_edges)

    assert "metadata" in graph
    assert "nodes" in graph
    assert "edges" in graph
    assert graph["metadata"]["repos"] == ["myrepo"]

def test_export_has_all_node_types():
    clusters = [Cluster(id="r::auth", name="auth", path="src/auth",
                        parent_id="r", semantic_label="Auth")]
    symbols = [SymbolEntry(
        qualified_name="r::auth.service::login", kind="function",
        signature="login()", file="f.py", line=1,
    )]
    graph = build_codespace_graph("r", clusters, symbols, [], {})
    types = {n["type"] for n in graph["nodes"]}
    assert "repo" in types
    assert "module" in types
    assert "function" in types

def test_export_valid_json():
    clusters = [Cluster(id="r::m", name="m", path="src/m", parent_id="r")]
    graph = build_codespace_graph("r", clusters, [], [], {})
    # Should be JSON-serializable
    json.dumps(graph)

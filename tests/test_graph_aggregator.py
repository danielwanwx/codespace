# tests/test_graph_aggregator.py
from codespace.symbols import SymbolEntry
from codespace.graph_aggregator import aggregate_edges, ResolvedEdge

def _make_symbols():
    """Two modules: auth and database, with cross-module calls."""
    return [
        SymbolEntry(
            qualified_name="myrepo::auth.service::login",
            kind="function", signature="login(email, password)",
            file="src/auth/service.py", line=10,
            calls=["find_user", "verify_hash", "encode_token"],
        ),
        SymbolEntry(
            qualified_name="myrepo::auth.service::register",
            kind="function", signature="register(email)",
            file="src/auth/service.py", line=30,
            calls=["create_user"],
        ),
        SymbolEntry(
            qualified_name="myrepo::database.repo::find_user",
            kind="function", signature="find_user(email)",
            file="src/database/repo.py", line=5,
            calls=["query"],
        ),
        SymbolEntry(
            qualified_name="myrepo::database.repo::create_user",
            kind="function", signature="create_user(email)",
            file="src/database/repo.py", line=15,
            calls=["insert"],
        ),
    ]

# File content map for import parsing
FILE_CONTENTS = {
    "src/auth/service.py": "from database.repo import find_user, create_user\n",
    "src/database/repo.py": "",
}

def test_resolves_cross_module_calls():
    symbols = _make_symbols()
    func_edges, mod_edges = aggregate_edges(symbols, FILE_CONTENTS)
    sources = {(e.source, e.target) for e in func_edges}
    assert ("myrepo::auth.service::login", "myrepo::database.repo::find_user") in sources

def test_import_aware_high_confidence():
    symbols = _make_symbols()
    func_edges, _ = aggregate_edges(symbols, FILE_CONTENTS)
    edge = next(e for e in func_edges
                if e.source.endswith("::login") and e.target.endswith("::find_user"))
    assert edge.confidence == "high"

def test_module_edge_aggregation():
    symbols = _make_symbols()
    _, mod_edges = aggregate_edges(symbols, FILE_CONTENTS)
    key = ("myrepo::auth.service", "myrepo::database.repo")
    assert key in mod_edges
    assert mod_edges[key]["weight"] >= 2  # login->find_user + register->create_user

def test_skips_same_module_calls():
    symbols = _make_symbols()
    func_edges, _ = aggregate_edges(symbols, FILE_CONTENTS)
    # find_user calling query -- both in database.repo, should not appear
    sources = {(e.source, e.target) for e in func_edges}
    for s, t in sources:
        assert not (s.startswith("myrepo::database") and t.startswith("myrepo::database"))

def test_skips_common_names_without_import():
    symbols = [
        SymbolEntry(
            qualified_name="myrepo::auth.service::handler",
            kind="function", signature="handler()",
            file="src/auth/service.py", line=1,
            calls=["get", "run", "find_user"],  # get/run are common names
        ),
        SymbolEntry(
            qualified_name="myrepo::database.repo::find_user",
            kind="function", signature="find_user(email)",
            file="src/database/repo.py", line=1,
            calls=[],
        ),
    ]
    func_edges, _ = aggregate_edges(symbols, FILE_CONTENTS)
    targets = {e.target for e in func_edges}
    # find_user should resolve, but get/run should not create edges
    assert any("find_user" in t for t in targets)
    assert not any("get" in t or "run" in t for t in targets)

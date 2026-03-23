from codespace.symbols import SymbolEntry
from codespace.graph_aggregator import ResolvedEdge
from codespace.importance import score_importance, classify_symbols


def _make_hub_and_leaf():
    """Hub function called by 5 others; leaf called by nobody."""
    symbols = [
        SymbolEntry(
            qualified_name="r::core.api::handle_request", kind="function",
            signature="handle_request()", file="src/core/api.py", line=10,
            calls=["validate", "process", "respond"],
            called_by=["route_a", "route_b", "route_c", "route_d", "route_e"],
        ),
        SymbolEntry(
            qualified_name="r::utils.helpers::format_date", kind="function",
            signature="format_date()", file="src/utils/helpers.py", line=5,
            calls=[], called_by=[],
        ),
    ]
    edges = [
        ResolvedEdge(source="r::routes.a::route_a", target="r::core.api::handle_request", confidence="high"),
        ResolvedEdge(source="r::routes.b::route_b", target="r::core.api::handle_request", confidence="high"),
        ResolvedEdge(source="r::routes.c::route_c", target="r::core.api::handle_request", confidence="high"),
        ResolvedEdge(source="r::routes.d::route_d", target="r::core.api::handle_request", confidence="high"),
        ResolvedEdge(source="r::routes.e::route_e", target="r::core.api::handle_request", confidence="high"),
    ]
    return symbols, edges


def test_hub_scores_higher_than_leaf():
    symbols, edges = _make_hub_and_leaf()
    scores = score_importance(symbols, edges)
    assert scores["r::core.api::handle_request"] > scores["r::utils.helpers::format_date"]


def test_scores_between_0_and_1():
    symbols, edges = _make_hub_and_leaf()
    scores = score_importance(symbols, edges)
    for name, score in scores.items():
        assert 0.0 <= score <= 1.0, f"{name} score {score} out of range"


def test_isolated_symbol_gets_low_score():
    symbols = [
        SymbolEntry(
            qualified_name="r::tests.test_foo::test_bar", kind="function",
            signature="test_bar()", file="tests/test_foo.py", line=1,
            calls=[], called_by=[],
        ),
    ]
    scores = score_importance(symbols, [])
    assert scores["r::tests.test_foo::test_bar"] < 0.3


def test_cross_module_edges_boost_score():
    """Symbol with cross-module connections scores higher than same-module-only."""
    cross = SymbolEntry(
        qualified_name="r::core.api::validate", kind="function",
        signature="validate()", file="src/core/api.py", line=1,
        calls=["check_auth", "check_schema"],
        called_by=["handle_a", "handle_b"],
    )
    local = SymbolEntry(
        qualified_name="r::core.api::_helper", kind="function",
        signature="_helper()", file="src/core/api.py", line=20,
        calls=["format"],
        called_by=["validate", "other"],
    )
    edges = [
        ResolvedEdge(source="r::auth.service::handle_a", target="r::core.api::validate", confidence="high"),
        ResolvedEdge(source="r::web.handler::handle_b", target="r::core.api::validate", confidence="high"),
        ResolvedEdge(source="r::core.api::validate", target="r::auth.service::check_auth", confidence="high"),
        ResolvedEdge(source="r::core.api::validate", target="r::schema.checker::check_schema", confidence="high"),
        # _helper has 2 called_by but all same-module (no cross-module edges in func_edges)
    ]
    scores = score_importance([cross, local], edges)
    assert scores["r::core.api::validate"] > scores["r::core.api::_helper"]


def test_empty_symbols():
    scores = score_importance([], [])
    assert scores == {}


# ── classify_symbols tests ──────────────────────────────────────


def test_classify_test_by_isolation():
    """Symbols with zero fan-in AND zero cross-module edges -> 'test'."""
    sym = SymbolEntry(
        qualified_name="r::tests.test_auth::test_login", kind="function",
        signature="test_login()", file="tests/test_auth.py", line=1,
        calls=["login", "assert_equal"], called_by=[],
    )
    categories = classify_symbols([sym], [])
    assert categories["r::tests.test_auth::test_login"] == "test"


def test_classify_hub():
    """High fan-in + high fan-out -> 'hub'."""
    sym = SymbolEntry(
        qualified_name="r::core.api::dispatch", kind="function",
        signature="dispatch()", file="src/core/api.py", line=1,
        calls=["a", "b", "c", "d", "e"],
        called_by=["x", "y", "z", "w", "v"],
    )
    edges = [
        ResolvedEdge(source=f"r::mod{i}::caller", target="r::core.api::dispatch", confidence="high")
        for i in range(5)
    ]
    categories = classify_symbols([sym], edges)
    assert categories["r::core.api::dispatch"] == "hub"


def test_classify_api():
    """High fan-in, low fan-out, cross-module callers -> 'api'."""
    sym = SymbolEntry(
        qualified_name="r::core.api::get_user", kind="function",
        signature="get_user(id)", file="src/core/api.py", line=1,
        calls=["query"],
        called_by=["handler_a", "handler_b", "handler_c"],
    )
    edges = [
        ResolvedEdge(source=f"r::mod{i}::handler", target="r::core.api::get_user", confidence="high")
        for i in range(3)
    ]
    categories = classify_symbols([sym], edges)
    assert categories["r::core.api::get_user"] == "api"


def test_classify_internal():
    """Some connections but not dominant in any direction -> 'internal'."""
    sym = SymbolEntry(
        qualified_name="r::core.utils::sanitize", kind="function",
        signature="sanitize(s)", file="src/core/utils.py", line=1,
        calls=["strip"], called_by=["handler"],
    )
    categories = classify_symbols([sym], [])
    assert categories["r::core.utils::sanitize"] == "internal"


def test_classify_util_private():
    """Private function (starts with _) with low connectivity -> 'util'."""
    sym = SymbolEntry(
        qualified_name="r::core.utils::_parse_int", kind="function",
        signature="_parse_int(s)", file="src/core/utils.py", line=1,
        calls=[], called_by=["validate"],
    )
    categories = classify_symbols([sym], [])
    assert categories["r::core.utils::_parse_int"] == "util"

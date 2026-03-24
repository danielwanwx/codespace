"""End-to-end tests for the full multi-layer wiki pipeline.

Tests the complete pipeline: Index -> Extract -> Edges -> Score -> Cluster -> Name -> Wiki -> Export

Two modes:
  1. Mock LLM (always runs): deterministic, verifies full pipeline structure
  2. Real MiniMax API (when MINIMAX_API_KEY set): live E2E with real LLM

Run mock tests:  uv run pytest tests/test_e2e_wiki_pipeline.py -v
Run real tests:  MINIMAX_API_KEY=<key> uv run pytest tests/test_e2e_wiki_pipeline.py -v -s
"""
import json
import os
import pytest
from pathlib import Path
from dataclasses import dataclass

from codespace.llm import LLMClient
from codespace.indexer import scan_repo
from codespace.symbols import extract_symbols, build_reverse_index
from codespace.graph_aggregator import aggregate_edges
from codespace.clusters import form_clusters
from codespace.cluster_namer import name_clusters
from codespace.importance import score_importance, classify_symbols
from codespace.wiki_generator import generate_wiki_pages
from codespace.export import build_codespace_graph
from codespace.wiki_layers import WikiLayers
from codespace.mcp_server import detect_intent, load_index, load_module_wiki, search_wiki


# ---------- Mock LLM that produces realistic wiki markdown ----------

MOCK_WIKI_RESPONSES = {
    "auth": """\
# Authentication Service

> Handles user authentication and session management via JWT tokens.

**Path:** `auth` · **Files:** 2 · **Symbols:** 6

## Overview

This module provides the core authentication layer for the application.
It validates credentials, issues JWT tokens, and manages user sessions.

## Public API

- `login(email, password)` — Authenticate user, return JWT token
- `verify_token(token)` — Validate JWT, return user context
- `find_user(email)` — Look up user by email address

## Dependencies

### Depends On
- `auth.models` — User data class

### Used By
- `api.routes` — All protected endpoint handlers

## Architecture Context

Central auth hub — the API routes module depends on this for all authentication.
""",
    "api": """\
# API Gateway

> Provides HTTP route handlers for login and profile endpoints.

**Path:** `api` · **Files:** 1 · **Symbols:** 2

## Overview

This module exposes the REST API endpoints. It delegates authentication
to the auth service and returns structured JSON responses.

## Public API

- `handle_login(request)` — POST /login endpoint handler
- `handle_profile(request)` — GET /profile endpoint handler (requires auth)

## Dependencies

### Depends On
- `auth.service` — Authentication functions (login, verify_token)

## Architecture Context

Thin routing layer that delegates business logic to auth.service.
""",
}


@dataclass
class MockLLMClient:
    """Deterministic LLM that returns pre-written wiki markdown."""
    provider: str = "mock"
    api_key: str = ""
    model: str = ""
    _call_count: int = 0

    def complete(self, prompt: str, max_tokens: int = 100) -> str:
        self._call_count += 1
        # Detect which module the prompt is about
        prompt_lower = prompt.lower()
        for key, response in MOCK_WIKI_RESPONSES.items():
            if key in prompt_lower:
                return response
        # Fallback: return the first response
        return list(MOCK_WIKI_RESPONSES.values())[0]


# ---------- Shared Fixtures ----------

@pytest.fixture(scope="module")
def mini_repo(tmp_path_factory) -> Path:
    """Create a minimal Python repo for E2E testing."""
    repo = tmp_path_factory.mktemp("mini_repo")

    # Module 1: auth
    auth_dir = repo / "auth"
    auth_dir.mkdir()
    (auth_dir / "__init__.py").write_text("")
    (auth_dir / "service.py").write_text('''\
"""Authentication service module."""

from auth.models import User


def login(email: str, password: str) -> str:
    """Authenticate user and return JWT token."""
    user = find_user(email)
    if user and verify_password(password, user.hashed_pw):
        return create_token(user.id)
    raise ValueError("Invalid credentials")


def verify_token(token: str) -> dict:
    """Validate JWT token and return user context."""
    import jwt
    payload = jwt.decode(token, "secret", algorithms=["HS256"])
    return {"user_id": payload["sub"]}


def find_user(email: str):
    """Look up user by email."""
    return None


def verify_password(plain: str, hashed: str) -> bool:
    """Check password against hash."""
    return plain == hashed


def create_token(user_id: int) -> str:
    """Create a JWT token for the given user."""
    return f"token_{user_id}"
''')
    (auth_dir / "models.py").write_text('''\
"""User data models."""

class User:
    """Represents a registered user."""
    def __init__(self, id: int, email: str, hashed_pw: str):
        self.id = id
        self.email = email
        self.hashed_pw = hashed_pw
''')

    # Module 2: api
    api_dir = repo / "api"
    api_dir.mkdir()
    (api_dir / "__init__.py").write_text("")
    (api_dir / "routes.py").write_text('''\
"""API route handlers."""

from auth.service import login, verify_token


def handle_login(request: dict) -> dict:
    """Handle POST /login."""
    token = login(request["email"], request["password"])
    return {"token": token, "status": "ok"}


def handle_profile(request: dict) -> dict:
    """Handle GET /profile — requires auth."""
    ctx = verify_token(request["token"])
    return {"user_id": ctx["user_id"], "status": "ok"}
''')

    return repo


@pytest.fixture(scope="module")
def pipeline_result(mini_repo, tmp_path_factory):
    """Run the full pipeline with mock LLM and cache results for all tests."""
    repo_path = str(mini_repo)
    repo_name = "mini_repo"
    wiki_output_dir = str(tmp_path_factory.mktemp("wiki_output"))
    mock_llm = MockLLMClient()

    # Step 1: Index
    modules = scan_repo(repo_path)

    # Step 2: Extract symbols
    all_symbols = []
    file_contents = {}
    for mod in modules:
        for f in mod.files:
            symbols = extract_symbols(f.content, repo_name, mod.slug, f.rel_path)
            all_symbols.extend(symbols)
            file_contents[f.rel_path] = f.content
    build_reverse_index(all_symbols)

    # Step 3: Resolve edges
    func_edges, mod_edges = aggregate_edges(all_symbols, file_contents)

    # Step 4: Score
    importance_scores = score_importance(all_symbols, func_edges)
    categories = classify_symbols(all_symbols, func_edges)

    # Step 5: Clusters
    clusters = form_clusters(modules, all_symbols, repo_name)

    # Step 6: Name clusters (mock LLM falls back to dir names)
    symbols_by_module = {}
    for sym in all_symbols:
        parts = sym.qualified_name.split("::")
        if len(parts) >= 2:
            mod_key = f"{parts[0]}::{parts[1]}"
            symbols_by_module.setdefault(mod_key, []).append(sym)
    name_clusters(clusters, symbols_by_module, llm_client=mock_llm)

    # Step 7: Generate wiki — the core feature we're testing
    wiki_paths, l0_summaries, l1_summaries = generate_wiki_pages(
        clusters, all_symbols, file_contents,
        func_edges, mod_edges, mock_llm, wiki_output_dir,
        wiki_depth="modules",
    )

    # Step 8: Export graph
    graph = build_codespace_graph(
        repo_name, clusters, all_symbols, func_edges, mod_edges,
        summaries=l0_summaries, l1_summaries=l1_summaries,
        wiki_paths=wiki_paths,
        importance_scores=importance_scores, categories=categories,
    )

    return {
        "wiki_dir": Path(wiki_output_dir),
        "wiki_paths": wiki_paths,
        "l0_summaries": l0_summaries,
        "l1_summaries": l1_summaries,
        "graph": graph,
        "clusters": clusters,
        "all_symbols": all_symbols,
        "mock_llm": mock_llm,
    }


# =====================================================================
# E2E TESTS — Full Pipeline Verification
# =====================================================================

class TestPipelineBasics:
    """Verify the pipeline ran without errors."""

    def test_pipeline_indexed_modules(self, pipeline_result):
        assert len(pipeline_result["clusters"]) >= 2

    def test_pipeline_extracted_symbols(self, pipeline_result):
        assert len(pipeline_result["all_symbols"]) >= 5

    def test_llm_was_called(self, pipeline_result):
        assert pipeline_result["mock_llm"]._call_count >= 2, "LLM should be called at least once per module"


class TestWikiMarkdownGeneration:
    """Verify MD files (source of truth) are created correctly."""

    def test_md_files_exist_for_each_module(self, pipeline_result):
        wiki_dir = pipeline_result["wiki_dir"]
        module_mds = [f for f in wiki_dir.glob("*.md") if f.name != "_index.md"]
        cluster_count = len(pipeline_result["clusters"])
        assert len(module_mds) >= cluster_count, (
            f"Expected >= {cluster_count} module .md files, got {len(module_mds)}: {[f.name for f in module_mds]}"
        )

    def test_md_files_have_content(self, pipeline_result):
        wiki_dir = pipeline_result["wiki_dir"]
        for md_file in wiki_dir.glob("*.md"):
            content = md_file.read_text()
            assert len(content) > 50, f"{md_file.name} is too short ({len(content)} chars)"

    def test_md_files_have_markdown_structure(self, pipeline_result):
        wiki_dir = pipeline_result["wiki_dir"]
        for md_file in wiki_dir.glob("*.md"):
            if md_file.name == "_index.md":
                continue
            content = md_file.read_text()
            assert content.startswith("#"), f"{md_file.name} doesn't start with a heading"
            assert "##" in content, f"{md_file.name} has no H2 sections"

    def test_md_is_source_of_truth(self, pipeline_result):
        """MD files should contain the full L2 wiki content, not just summaries."""
        wiki_dir = pipeline_result["wiki_dir"]
        for md_file in wiki_dir.glob("*.md"):
            if md_file.name == "_index.md":
                continue
            content = md_file.read_text()
            # Full wiki should have Overview + Public API sections
            assert "## Overview" in content or "## Public API" in content, (
                f"{md_file.name} missing expected wiki sections"
            )


class TestWikiHTMLGeneration:
    """Verify HTML files are rendered from MD."""

    def test_html_files_exist_for_each_module(self, pipeline_result):
        wiki_dir = pipeline_result["wiki_dir"]
        html_files = list(wiki_dir.glob("*.html"))
        cluster_count = len(pipeline_result["clusters"])
        assert len(html_files) >= cluster_count

    def test_html_is_self_contained(self, pipeline_result):
        wiki_dir = pipeline_result["wiki_dir"]
        for html_file in wiki_dir.glob("*.html"):
            content = html_file.read_text()
            assert "<!DOCTYPE html>" in content
            assert "<style>" in content
            assert "Codespace" in content

    def test_html_has_rendered_content(self, pipeline_result):
        """HTML should contain rendered versions of the markdown content."""
        wiki_dir = pipeline_result["wiki_dir"]
        for html_file in wiki_dir.glob("*.html"):
            content = html_file.read_text()
            assert "<h2>" in content, f"{html_file.name} has no rendered H2 headings"


class TestIndexGeneration:
    """Verify _index.md is created with L0 summaries."""

    def test_index_exists(self, pipeline_result):
        index_path = pipeline_result["wiki_dir"] / "_index.md"
        assert index_path.exists(), "_index.md not found"

    def test_index_has_module_count(self, pipeline_result):
        index_path = pipeline_result["wiki_dir"] / "_index.md"
        content = index_path.read_text()
        assert "# Module Index" in content
        cluster_count = len(pipeline_result["clusters"])
        assert f"{cluster_count} modules" in content

    def test_index_lists_all_modules(self, pipeline_result):
        index_path = pipeline_result["wiki_dir"] / "_index.md"
        content = index_path.read_text()
        for cluster in pipeline_result["clusters"]:
            label = cluster.semantic_label or cluster.name
            assert label in content, f"Module '{label}' not found in _index.md"


class TestLayerExtraction:
    """Verify L0/L1/L2 layers are properly extracted from LLM output."""

    def test_l0_summaries_exist_for_all_modules(self, pipeline_result):
        l0 = pipeline_result["l0_summaries"]
        clusters = pipeline_result["clusters"]
        assert len(l0) == len(clusters), f"Expected {len(clusters)} L0 summaries, got {len(l0)}"

    def test_l0_is_single_line_clean_text(self, pipeline_result):
        for key, val in pipeline_result["l0_summaries"].items():
            assert len(val) > 10, f"L0 for {key} is too short: '{val}'"
            assert "**" not in val, f"L0 for {key} has raw markdown bold: '{val}'"
            assert "`" not in val, f"L0 for {key} has raw markdown code: '{val}'"
            assert "\n" not in val, f"L0 for {key} is multi-line: '{val}'"

    def test_l1_summaries_exist_for_all_modules(self, pipeline_result):
        l1 = pipeline_result["l1_summaries"]
        clusters = pipeline_result["clusters"]
        assert len(l1) == len(clusters), f"Expected {len(clusters)} L1 summaries, got {len(l1)}"

    def test_l1_has_structure(self, pipeline_result):
        for key, val in pipeline_result["l1_summaries"].items():
            assert len(val) > 20, f"L1 for {key} is too short: '{val}'"
            assert "##" in val, f"L1 for {key} has no section headings"

    def test_l1_includes_bullets(self, pipeline_result):
        for key, val in pipeline_result["l1_summaries"].items():
            assert "- " in val, f"L1 for {key} has no bullet points"

    def test_l1_is_shorter_than_l2(self, pipeline_result):
        """L1 should be a compressed version of L2 — fewer chars."""
        wiki_dir = pipeline_result["wiki_dir"]
        l1 = pipeline_result["l1_summaries"]
        for cluster in pipeline_result["clusters"]:
            if cluster.id not in l1:
                continue
            l1_text = l1[cluster.id]
            # Find the corresponding L2 markdown file
            for md_file in wiki_dir.glob("*.md"):
                if md_file.name == "_index.md":
                    continue
                l2_text = md_file.read_text()
                # Match by cluster id in filename
                safe_id = cluster.id.replace("::", "__")
                if safe_id in md_file.stem:
                    assert len(l1_text) < len(l2_text), (
                        f"L1 ({len(l1_text)} chars) should be shorter than L2 ({len(l2_text)} chars) for {cluster.id}"
                    )
                    break

    def test_l1_excludes_paragraphs(self, pipeline_result):
        """L1 should NOT contain full paragraphs (multi-sentence prose)."""
        for key, val in pipeline_result["l1_summaries"].items():
            # L1 should not have the "validates credentials" paragraph from Overview
            assert "validates" not in val.lower() or "credentials" not in val.lower(), (
                f"L1 for {key} contains paragraph text that should be excluded"
            )


class TestGraphExport:
    """Verify the exported graph has l1_summary and summary_l1 fields."""

    def test_graph_structure(self, pipeline_result):
        graph = pipeline_result["graph"]
        assert "metadata" in graph
        assert "nodes" in graph
        assert "edges" in graph
        assert graph["metadata"]["repos"] == ["mini_repo"]

    def test_graph_has_l1_summary_on_all_modules(self, pipeline_result):
        graph = pipeline_result["graph"]
        module_nodes = [n for n in graph["nodes"] if n["type"] == "module"]
        assert len(module_nodes) >= 2
        for node in module_nodes:
            assert "l1_summary" in node, f"Module {node['id']} missing l1_summary"
            assert node["l1_summary"], f"Module {node['id']} has empty l1_summary"

    def test_graph_has_summary_l1_backward_compat(self, pipeline_result):
        graph = pipeline_result["graph"]
        module_nodes = [n for n in graph["nodes"] if n["type"] == "module"]
        for node in module_nodes:
            assert node.get("summary_l1"), f"Module {node['id']} missing summary_l1 (L0)"

    def test_graph_l1_summary_differs_from_summary_l1(self, pipeline_result):
        """l1_summary (structured) should differ from summary_l1 (one-liner)."""
        graph = pipeline_result["graph"]
        module_nodes = [n for n in graph["nodes"] if n["type"] == "module"]
        for node in module_nodes:
            l0 = node.get("summary_l1", "")
            l1 = node.get("l1_summary", "")
            if l0 and l1:
                assert l0 != l1, f"L0 and L1 should differ for {node['id']}"
                assert len(l1) > len(l0), f"L1 should be longer than L0 for {node['id']}"

    def test_graph_is_json_serializable(self, pipeline_result):
        graph = pipeline_result["graph"]
        json_str = json.dumps(graph, indent=2)
        assert len(json_str) > 100
        parsed = json.loads(json_str)
        assert parsed["metadata"]["repos"] == ["mini_repo"]

    def test_graph_wiki_paths_point_to_html(self, pipeline_result):
        graph = pipeline_result["graph"]
        module_nodes = [n for n in graph["nodes"] if n["type"] == "module"]
        for node in module_nodes:
            wp = node.get("wiki_path")
            assert wp, f"Module {node['id']} has no wiki_path"
            assert wp.endswith(".html"), f"wiki_path should be .html: {wp}"
            assert wp.startswith("wiki/"), f"wiki_path should start with wiki/: {wp}"


class TestMCPServerIntegration:
    """Verify MCP server functions work against the generated wiki."""

    def test_load_index(self, pipeline_result):
        wiki_dir = pipeline_result["wiki_dir"]
        result = load_index(wiki_dir)
        assert "# Module Index" in result
        assert "REPO_NOT_FOUND" not in result

    def test_load_module_auto_returns_l1(self, pipeline_result):
        """auto depth should return L1 (structured summary, not full content)."""
        wiki_dir = pipeline_result["wiki_dir"]
        # Find a module md file
        md_files = [f for f in wiki_dir.glob("*.md") if f.name != "_index.md"]
        assert len(md_files) > 0
        name = md_files[0].stem  # e.g. "mini_repo__auth"
        result = load_module_wiki(wiki_dir, name, depth="auto")
        assert "##" in result  # has section headings
        # Should NOT include full paragraphs
        assert "validates credentials" not in result.lower()

    def test_load_module_full_returns_l2(self, pipeline_result):
        wiki_dir = pipeline_result["wiki_dir"]
        md_files = [f for f in wiki_dir.glob("*.md") if f.name != "_index.md"]
        name = md_files[0].stem
        result = load_module_wiki(wiki_dir, name, depth="full")
        # Full should include paragraphs
        assert "## Overview" in result

    def test_search_finds_relevant_module(self, pipeline_result):
        wiki_dir = pipeline_result["wiki_dir"]
        result = search_wiki(wiki_dir, "authentication JWT")
        assert "auth" in result.lower()

    def test_search_no_results(self, pipeline_result):
        wiki_dir = pipeline_result["wiki_dir"]
        result = search_wiki(wiki_dir, "xyznonexistent")
        assert "No results" in result


# =====================================================================
# LIVE API TESTS — Only run when MINIMAX_API_KEY is set
# =====================================================================

MINIMAX_API_KEY = os.environ.get("MINIMAX_API_KEY", "")


@pytest.mark.skipif(not MINIMAX_API_KEY, reason="MINIMAX_API_KEY not set")
class TestMiniMaxLiveAPI:
    """Live tests against real MiniMax API (requires balance)."""

    def test_minimax_basic_completion(self):
        client = LLMClient(provider="minimax", api_key=MINIMAX_API_KEY, model="MiniMax-M1")
        result = client.complete("Say 'hello' and nothing else.", max_tokens=10)
        assert len(result) > 0
        assert "hello" in result.lower()

    def test_minimax_wiki_generation(self):
        client = LLMClient(provider="minimax", api_key=MINIMAX_API_KEY, model="MiniMax-M1")
        result = client.complete(
            "Write a one-paragraph summary of what Python is.",
            max_tokens=200,
        )
        assert len(result) > 50
        assert "python" in result.lower()

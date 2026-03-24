"""Codespace CLI — code graph generator."""
import argparse
import json
import sys

from codespace.indexer import scan_repo
from codespace.symbols import extract_symbols, build_reverse_index
from codespace.graph_aggregator import aggregate_edges
from codespace.clusters import form_clusters
from codespace.cluster_namer import name_clusters
from codespace.export import build_codespace_graph
from codespace.importance import score_importance, classify_symbols
from codespace.wiki_generator import generate_wiki_pages
from codespace.llm import LLMClient

FRONTEND_DIST_DIR = "frontend/dist"


def main():
    # Dispatch wiki subcommand before argparse
    if len(sys.argv) > 1 and sys.argv[1] == "wiki":
        from codespace.wiki_cli import wiki_main
        sys.exit(wiki_main(sys.argv[2:]))

    parser = argparse.ArgumentParser(description="Codespace — code graph generator")
    parser.add_argument("repo_path", help="Path to local git repo")
    parser.add_argument("--output", "-o", default="codespace_graph.json", help="Output JSON path")
    parser.add_argument("--llm-provider", choices=["anthropic", "openai", "minimax", "minimax-global", "deepseek", "none"], default="none")
    parser.add_argument("--llm-api-key", default=None)
    parser.add_argument("--llm-model", default=None, help="Override default LLM model")
    parser.add_argument(
        "--wiki-depth", choices=["none", "modules", "full"], default=None,
        help="Wiki generation depth: none, modules (default when LLM configured), or full",
    )
    parser.add_argument(
        "--serve", action="store_true",
        help="After generating the graph, copy it into the frontend dist/ and start a local HTTP server on port 3000",
    )
    parser.add_argument("--port", type=int, default=3000, help="Port for --serve (default: 3000)")
    args = parser.parse_args()

    import os
    repo_path = os.path.abspath(args.repo_path)
    repo_name = os.path.basename(repo_path)
    print(f"Codespace: analyzing {repo_path}")

    # Resolve wiki depth default
    wiki_depth = args.wiki_depth
    if wiki_depth is None:
        wiki_depth = "modules" if (args.llm_provider and args.llm_provider != "none") else "none"

    total_steps = 8 if wiki_depth != "none" else 7

    # Step 1: Index
    print(f"  [1/{total_steps}] Indexing repo...")
    modules = scan_repo(repo_path)
    print(f"         Found {len(modules)} modules")

    # Step 2: Extract symbols
    print(f"  [2/{total_steps}] Extracting symbols...")
    all_symbols = []
    file_contents: dict[str, str] = {}
    for mod in modules:
        for f in mod.files:
            symbols = extract_symbols(f.content, repo_name, mod.slug, f.rel_path)
            all_symbols.extend(symbols)
            file_contents[f.rel_path] = f.content
    build_reverse_index(all_symbols)
    print(f"         Found {len(all_symbols)} symbols")

    # Step 3: Resolve edges
    print(f"  [3/{total_steps}] Resolving call graph...")
    func_edges, mod_edges = aggregate_edges(all_symbols, file_contents)
    print(f"         Resolved {len(func_edges)} function edges, {len(mod_edges)} module edges")

    # Step 4: Score importance
    print(f"  [4/{total_steps}] Scoring symbol importance...")
    importance_scores = score_importance(all_symbols, func_edges)
    categories = classify_symbols(all_symbols, func_edges)
    test_count = sum(1 for c in categories.values() if c == "test")
    print(f"         {test_count}/{len(categories)} symbols classified as test/noise")

    # Step 5: Form clusters
    print(f"  [5/{total_steps}] Forming clusters...")
    clusters = form_clusters(modules, all_symbols, repo_name)

    # Step 6: Name clusters (optional LLM)
    llm_client = None
    if args.llm_provider and args.llm_provider != "none":
        llm_client = LLMClient(
            provider=args.llm_provider,
            api_key=args.llm_api_key or "",
            model=args.llm_model or "",
        )
        print(f"  [6/{total_steps}] Naming clusters with LLM...")
    else:
        print(f"  [6/{total_steps}] Using directory names (no LLM)...")

    symbols_by_module: dict[str, list] = {}
    for sym in all_symbols:
        parts = sym.qualified_name.split("::")
        if len(parts) >= 2:
            mod_key = f"{parts[0]}::{parts[1]}"
            symbols_by_module.setdefault(mod_key, []).append(sym)
    name_clusters(clusters, symbols_by_module, llm_client=llm_client)

    # Step 7: Generate wiki pages (optional LLM)
    wiki_paths: dict[str, str] = {}
    summaries: dict[str, str] = {}
    l1_summaries: dict[str, str] = {}
    if wiki_depth != "none" and llm_client:
        print(f"  [7/{total_steps}] Generating wiki pages ({wiki_depth})...")
        output_dir = os.path.join(os.path.dirname(os.path.abspath(args.output)), "wiki")
        wiki_paths, summaries, l1_summaries = generate_wiki_pages(
            clusters, all_symbols, file_contents,
            func_edges, mod_edges, llm_client, output_dir,
            wiki_depth=wiki_depth,
        )
        print(f"         Generated {len(wiki_paths)} wiki pages")
    elif wiki_depth != "none":
        print(f"  [7/{total_steps}] Skipping wiki (no LLM configured)...")

    # Final step: Export
    step_num = total_steps
    print(f"  [{step_num}/{total_steps}] Exporting graph...")
    graph = build_codespace_graph(
        repo_name, clusters, all_symbols, func_edges, mod_edges,
        summaries=summaries, l1_summaries=l1_summaries, wiki_paths=wiki_paths,
        importance_scores=importance_scores, categories=categories,
    )

    with open(args.output, "w") as f:
        json.dump(graph, f, indent=2)
    print(f"  Done! Wrote {args.output}")
    print(f"  Stats: {graph['metadata']['stats']}")

    if args.serve:
        _serve(args.output, args.port)

    return 0


def _serve(graph_output: str, port: int) -> None:
    """Copy graph JSON into frontend/dist and start a local HTTP server."""
    import http.server
    import functools
    import os
    import shutil
    from pathlib import Path

    # Resolve dist dir relative to the project root (where pyproject.toml lives)
    project_root = Path(__file__).resolve().parents[2]
    dist_dir = project_root / FRONTEND_DIST_DIR

    if not dist_dir.exists():
        print(f"\n  Error: {dist_dir} does not exist. Run 'npm run build' in frontend/ first.")
        sys.exit(1)

    # Copy graph JSON into dist/
    dest = dist_dir / "codespace_graph.json"
    shutil.copy2(graph_output, dest)
    print(f"\n  Copied {graph_output} -> {dest}")

    # Copy wiki/ directory if it exists
    wiki_src = Path(graph_output).parent / "wiki"
    if wiki_src.exists():
        wiki_dest = dist_dir / "wiki"
        if wiki_dest.exists():
            shutil.rmtree(wiki_dest)
        shutil.copytree(wiki_src, wiki_dest)
        print(f"  Copied wiki/ -> {wiki_dest}")

    # Start HTTP server
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(dist_dir))
    server = http.server.HTTPServer(("", port), handler)
    print(f"  Serving {dist_dir} at http://localhost:{port}")
    print("  Press Ctrl+C to stop.\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Server stopped.")
        server.server_close()


if __name__ == "__main__":
    sys.exit(main())

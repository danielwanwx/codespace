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
from codespace.llm import LLMClient


def main():
    parser = argparse.ArgumentParser(description="Codespace — code graph generator")
    parser.add_argument("repo_path", help="Path to local git repo")
    parser.add_argument("--output", "-o", default="codespace_graph.json", help="Output JSON path")
    parser.add_argument("--llm-provider", choices=["anthropic", "openai", "none"], default="none")
    parser.add_argument("--llm-api-key", default=None)
    parser.add_argument("--llm-model", default=None, help="Override default LLM model")
    args = parser.parse_args()

    import os
    repo_path = os.path.abspath(args.repo_path)
    repo_name = os.path.basename(repo_path)
    print(f"Codespace: analyzing {repo_path}")

    # Step 1: Index
    print("  [1/6] Indexing repo...")
    modules = scan_repo(repo_path)
    print(f"         Found {len(modules)} modules")

    # Step 2: Extract symbols
    print("  [2/6] Extracting symbols...")
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
    print("  [3/6] Resolving call graph...")
    func_edges, mod_edges = aggregate_edges(all_symbols, file_contents)
    print(f"         Resolved {len(func_edges)} function edges, {len(mod_edges)} module edges")

    # Step 4: Form clusters
    print("  [4/6] Forming clusters...")
    clusters = form_clusters(modules, all_symbols, repo_name)

    # Step 5: Name clusters (optional LLM)
    llm_client = None
    if args.llm_provider and args.llm_provider != "none":
        llm_client = LLMClient(
            provider=args.llm_provider,
            api_key=args.llm_api_key or "",
            model=args.llm_model or "",
        )
        print("  [5/6] Naming clusters with LLM...")
    else:
        print("  [5/6] Using directory names (no LLM)...")

    symbols_by_module: dict[str, list] = {}
    for sym in all_symbols:
        parts = sym.qualified_name.split("::")
        if len(parts) >= 2:
            mod_key = f"{parts[0]}::{parts[1]}"
            symbols_by_module.setdefault(mod_key, []).append(sym)
    name_clusters(clusters, symbols_by_module, llm_client=llm_client)

    # Step 6: Export
    print("  [6/6] Exporting graph...")
    graph = build_codespace_graph(repo_name, clusters, all_symbols, func_edges, mod_edges)

    with open(args.output, "w") as f:
        json.dump(graph, f, indent=2)
    print(f"  Done! Wrote {args.output}")
    print(f"  Stats: {graph['metadata']['stats']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

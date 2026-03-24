#!/usr/bin/env python3
"""Codespace self-evolution evaluation function.

Runs the codespace pipeline on a reference repo and measures:
  - coverage: symbol extraction completeness
  - edge_quality: high-confidence edge ratio
  - classification_accuracy: vs hand-labeled ground truth
  - pipeline_speed: faster is better
  - wiki_quality: L0/L1/L2 layer extraction correctness

Usage:
    uv run python benchmarks/evaluate.py [--verbose]
"""
import ast
import json
import sys
import time
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "src"))

from codespace.indexer import scan_repo
from codespace.symbols import extract_symbols, build_reverse_index
from codespace.graph_aggregator import aggregate_edges
from codespace.clusters import form_clusters
from codespace.cluster_namer import name_clusters
from codespace.importance import score_importance, classify_symbols
from codespace.wiki_layers import extract_l0, extract_l1, build_layers

REFERENCE_REPO = str(PROJECT_ROOT / "benchmarks" / "reference_repo")
GROUND_TRUTH = PROJECT_ROOT / "benchmarks" / "ground_truth.json"

# --- Mock wiki responses for wiki quality eval ---
MOCK_WIKI_MD = """\
# Codespace Core

> Code architecture analysis pipeline that extracts symbols, resolves edges, and generates wiki.

**Path:** `codespace` · **Files:** 16 · **Symbols:** 58

## Overview

This module implements the core codespace pipeline: indexing Python repos,
extracting AST symbols, resolving call graph edges, scoring importance,
clustering modules, and generating multi-layer wiki documentation.

## Public API

- `scan_repo(path)` — Index a Python repository into modules
- `extract_symbols(source, repo, module, file)` — AST-based symbol extraction
- `aggregate_edges(symbols, file_contents)` — Resolve call graph edges
- `build_codespace_graph(...)` — Export graph JSON for frontend

## Dependencies

### Used By
- CLI entry point (`main`)
- MCP server (`wiki_resolve`)
- Frontend (loads codespace_graph.json)

## Architecture Context

Central pipeline — all other components feed into or consume from this module.
"""


def count_functions_in_repo(repo_path: str) -> int:
    """Count actual function/method definitions in the repo using AST."""
    count = 0
    for py_file in Path(repo_path).rglob("*.py"):
        try:
            tree = ast.parse(py_file.read_text())
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    # Skip __dunder__ except __init__ (same logic as symbols.py)
                    if node.name.startswith("__") and node.name.endswith("__") and node.name != "__init__":
                        continue
                    count += 1
        except (SyntaxError, UnicodeDecodeError):
            continue
    return count


def evaluate(verbose: bool = False) -> dict:
    """Run the evaluation pipeline and return metrics."""
    results = {}

    # --- Pipeline Speed ---
    t0 = time.perf_counter()

    modules = scan_repo(REFERENCE_REPO)
    all_symbols = []
    file_contents = {}
    for mod in modules:
        for f in mod.files:
            syms = extract_symbols(f.content, "codespace", mod.slug, f.rel_path)
            all_symbols.extend(syms)
            file_contents[f.rel_path] = f.content
    build_reverse_index(all_symbols)

    func_edges, mod_edges = aggregate_edges(all_symbols, file_contents)
    importance_scores = score_importance(all_symbols, func_edges)
    categories = classify_symbols(all_symbols, func_edges)
    clusters = form_clusters(modules, all_symbols, "codespace")

    pipeline_ms = (time.perf_counter() - t0) * 1000
    results["pipeline_ms"] = round(pipeline_ms, 1)

    # --- Coverage ---
    total_functions = count_functions_in_repo(REFERENCE_REPO)
    extracted = len(all_symbols)
    coverage = extracted / total_functions if total_functions > 0 else 0
    results["coverage"] = round(coverage, 4)

    if verbose:
        print(f"  Coverage: {extracted}/{total_functions} = {coverage:.4f}")

    # --- Edge Quality ---
    if func_edges:
        high_conf = sum(1 for e in func_edges if e.confidence == "high")
        edge_quality = high_conf / len(func_edges)
    else:
        edge_quality = 0.0
    results["edge_quality"] = round(edge_quality, 4)
    results["total_edges"] = len(func_edges)

    if verbose:
        print(f"  Edge quality: {high_conf}/{len(func_edges)} high-conf = {edge_quality:.4f}")

    # --- Classification Accuracy ---
    if GROUND_TRUTH.exists():
        gt = json.loads(GROUND_TRUTH.read_text())
        matched = 0
        total_gt = 0
        mismatches = []
        for qn, expected in gt.items():
            actual = categories.get(qn)
            if actual is not None:
                total_gt += 1
                if actual == expected:
                    matched += 1
                elif verbose:
                    mismatches.append(f"    {qn.split('::')[-1]}: expected={expected}, got={actual}")
        classification_accuracy = matched / total_gt if total_gt > 0 else 0
        if verbose and mismatches:
            print(f"  Classification mismatches ({total_gt - matched}):")
            for m in mismatches[:10]:
                print(m)
    else:
        classification_accuracy = 0.0
        total_gt = 0
    results["classification_accuracy"] = round(classification_accuracy, 4)
    results["classification_total"] = total_gt

    if verbose:
        print(f"  Classification: {matched}/{total_gt} = {classification_accuracy:.4f}")

    # --- Wiki Layer Quality ---
    layers = build_layers(MOCK_WIKI_MD)

    wiki_checks = 0
    wiki_pass = 0

    # L0: should be single line, no markdown formatting
    wiki_checks += 1
    if layers.l0 and "\n" not in layers.l0 and "**" not in layers.l0 and "`" not in layers.l0 and len(layers.l0) > 10:
        wiki_pass += 1
    elif verbose:
        print(f"  Wiki L0 FAIL: '{layers.l0[:60]}...'")

    # L1: should have headings and bullets, be shorter than L2
    wiki_checks += 1
    if "##" in layers.l1 and "- " in layers.l1 and len(layers.l1) < len(layers.l2):
        wiki_pass += 1
    elif verbose:
        print(f"  Wiki L1 FAIL: len={len(layers.l1)}, has ##={'##' in layers.l1}")

    # L1: should NOT contain full paragraphs
    wiki_checks += 1
    if "implements the core" not in layers.l1:
        wiki_pass += 1
    elif verbose:
        print("  Wiki L1 FAIL: contains paragraph text")

    # L1: should have max 3 bullets per section
    wiki_checks += 1
    sections = layers.l1.split("##")
    all_under_limit = all(s.count("- ") <= 3 for s in sections)
    if all_under_limit:
        wiki_pass += 1
    elif verbose:
        print("  Wiki L1 FAIL: too many bullets in a section")

    wiki_quality = wiki_pass / wiki_checks if wiki_checks > 0 else 0
    results["wiki_quality"] = round(wiki_quality, 4)

    if verbose:
        print(f"  Wiki quality: {wiki_pass}/{wiki_checks} = {wiki_quality:.4f}")

    # --- Composite Score ---
    # Speed score: 500ms = 1.0, scales linearly
    speed_score = min(1.0, 500 / pipeline_ms) if pipeline_ms > 0 else 0
    results["speed_score"] = round(speed_score, 4)

    score = (
        coverage * 0.20 +
        edge_quality * 0.20 +
        classification_accuracy * 0.25 +
        speed_score * 0.15 +
        wiki_quality * 0.20
    )
    results["score"] = round(score, 4)

    return results


def main():
    verbose = "--verbose" in sys.argv or "-v" in sys.argv

    if verbose:
        print("Evaluating codespace pipeline...\n")

    results = evaluate(verbose=verbose)

    if verbose:
        print()

    # Output in autoresearch-compatible format
    print(f"score:                      {results['score']}")
    print(f"coverage:                   {results['coverage']}")
    print(f"edge_quality:               {results['edge_quality']}")
    print(f"classification_accuracy:    {results['classification_accuracy']}")
    print(f"wiki_quality:               {results['wiki_quality']}")
    print(f"pipeline_ms:                {results['pipeline_ms']}")
    print(f"speed_score:                {results['speed_score']}")
    print(f"total_edges:                {results['total_edges']}")
    print(f"classification_total:       {results['classification_total']}")

    return results


if __name__ == "__main__":
    main()

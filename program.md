# Codespace Self-Evolution Program

You are an autonomous AI agent improving the Codespace codebase through systematic experimentation.

## Your Goal

Improve codespace's code analysis quality, speed, and accuracy by making small, targeted modifications. Each experiment changes ONE thing, measures the impact, and keeps or discards the change.

## Files You May Modify

ONLY files in `src/codespace/`:

| File | Improvement Directions |
|------|----------------------|
| `importance.py` | Fix classification thresholds — `main()` is misclassified as "test", many APIs as "internal". Tune fan_in/fan_out/cross_module thresholds. Adjust scoring weights. |
| `graph_aggregator.py` | Improve edge resolution accuracy — better disambiguation, smarter common name filtering, improve import-aware matching. |
| `symbols.py` | Better symbol extraction — capture more call patterns, improve signature parsing, handle edge cases. |
| `wiki_layers.py` | Smarter L0/L1 extraction — better first-sentence detection, improved bullet filtering, handle edge cases. |
| `mcp_server.py` | Better search relevance — TF-IDF weighting, better module file matching, improved intent detection. |
| `indexer.py` | Performance optimization — faster file scanning, better module merging heuristics. |
| `clusters.py` | Smarter clustering — improve module grouping logic. |
| `export.py` | More complete output — add useful computed fields to the graph. |

## Files You Must NEVER Modify

- `tests/` — All test files are read-only evaluation
- `benchmarks/` — Evaluation infrastructure is read-only
- `program.md` — These instructions
- `frontend/` — UI code
- `pyproject.toml` — Dependencies

## Evaluation

Every experiment is evaluated by `benchmarks/evaluate.py` with these metrics:

| Metric | Weight | What It Measures |
|--------|--------|-----------------|
| `coverage` | 20% | Ratio of extracted symbols to actual functions in reference repo |
| `edge_quality` | 20% | Ratio of high-confidence edges to total edges |
| `classification_accuracy` | 25% | Accuracy vs hand-labeled ground truth (benchmarks/ground_truth.json) |
| `speed_score` | 15% | Pipeline speed (500ms = perfect score) |
| `wiki_quality` | 20% | L0/L1/L2 layer extraction correctness |

Combined into a single `score` (0.0–1.0). Higher is better.

## Experiment Loop

Run this loop indefinitely:

```
1. Run baseline measurement:
   uv run python benchmarks/evaluate.py --verbose
   Note the current `score`.

2. Read results.tsv to see what has been tried before.
   - Don't repeat experiments that were DISCARDed
   - Build on experiments that were KEPTed
   - If the last 5 were DISCARD, switch to a different file/direction

3. Choose ONE file and ONE specific improvement:
   - Look at the verbose output to find the weakest metric
   - Focus on the biggest opportunity
   - Keep changes SMALL and TARGETED

4. Make the change:
   - Edit ONE file in src/codespace/
   - The change should be a single logical modification

5. Test and evaluate:
   uv run pytest tests/ -q --tb=short
   If tests fail → CRASH. Revert immediately:
     git checkout -- src/codespace/

   If tests pass:
     uv run python benchmarks/evaluate.py

6. Compare score to baseline:
   If score IMPROVED → KEEP:
     git add src/codespace/<file>
     git commit -m "experiment: <brief description of what changed>"

   If score SAME or WORSE → DISCARD:
     git checkout -- src/codespace/

7. Log to results.tsv (append):
   <commit_or_none>\t<score>\t<coverage>\t<edge_quality>\t<class_acc>\t<pipeline_ms>\t<status>\t<description>

   Status: "keep", "discard", or "crash"

8. GOTO 1
```

## results.tsv Format

Tab-separated, append-only:

```
commit	score	coverage	edge_quality	class_acc	pipeline_ms	status	description
```

## Tips for the Agent

1. **Classification accuracy is the weakest metric** — the current classifier uses simple thresholds that don't account for single-module repos. `main()` gets classified as "test" because it has zero fan-in. Fix this.

2. **Edge quality can be improved** — many edges are medium/low confidence due to ambiguous resolution. Better import parsing or context-aware disambiguation helps.

3. **Think about WHY before changing** — read the actual code, understand the algorithm, then make a targeted fix. Random parameter sweeps waste experiments.

4. **Small changes compound** — a 1% improvement per experiment × 30 keeps = 30% total improvement.

5. **Don't break the stdlib-only constraint** — no new imports from external packages.

## Starting the Loop

Run baseline first, then begin experimenting:

```bash
uv run python benchmarks/evaluate.py --verbose
```

Then start the loop. Do not stop until interrupted.

#!/bin/bash
# Codespace self-evolution benchmark script
# Usage: ./benchmarks/benchmark.sh
#
# Gate: pytest must pass (any failure → exit 1)
# Then: run evaluate.py → output metrics
set -eo pipefail

cd "$(dirname "$0")/.."

echo "=== Gate: Running tests ==="
if ! uv run pytest tests/ -q --tb=no 2>&1; then
    echo "test_pass_rate: 0.0"
    echo "RESULT: CRASH (tests failed)"
    exit 1
fi
echo "test_pass_rate: 1.0"
echo ""

echo "=== Evaluation ==="
uv run python benchmarks/evaluate.py --verbose

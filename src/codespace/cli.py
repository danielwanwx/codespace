import argparse
import sys

def main():
    parser = argparse.ArgumentParser(description="Codespace — code graph generator")
    parser.add_argument("repo_path", help="Path to local git repo")
    parser.add_argument("--output", "-o", default="codespace_graph.json", help="Output JSON path")
    parser.add_argument("--llm-provider", choices=["anthropic", "openai", "none"], default="none")
    parser.add_argument("--llm-api-key", default=None)
    args = parser.parse_args()
    print(f"Codespace: analyzing {args.repo_path}")
    return 0

if __name__ == "__main__":
    sys.exit(main())

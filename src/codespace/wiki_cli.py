"""CLI command: codespace wiki <query>."""
import sys
from pathlib import Path

from codespace.mcp_server import detect_intent, load_index, load_module_wiki, search_wiki


def _find_wiki_dir() -> Path | None:
    """Find the wiki directory, searching current dir and common locations."""
    candidates = [
        Path("wiki"),
        Path("output/wiki"),
    ]
    for candidate in candidates:
        if candidate.exists() and candidate.is_dir():
            return candidate
    return None


def _render_output(text: str) -> None:
    """Print output, using rich markdown rendering if available."""
    try:
        from rich.console import Console
        from rich.markdown import Markdown
        console = Console()
        console.print(Markdown(text))
    except ImportError:
        print(text)


def wiki_main(args: list[str]) -> int:
    """Entry point for `codespace wiki <query>`."""
    if not args or args[0] in ("-h", "--help"):
        print("Usage: codespace wiki <query>")
        print()
        print("Commands:")
        print("  codespace wiki list              Show all modules")
        print("  codespace wiki <module_name>      Show module summary")
        print("  codespace wiki <module> --full     Show full module docs")
        print("  codespace wiki <search terms>      Search wiki content")
        print()
        print("Options:")
        print("  --full       Show full content (L2) instead of summary")
        print("  --dir <path> Wiki directory path (default: auto-detect)")
        return 0

    # Parse options
    depth = "auto"
    wiki_dir_arg = None
    query_parts = []

    i = 0
    while i < len(args):
        if args[i] == "--full":
            depth = "full"
        elif args[i] == "--dir" and i + 1 < len(args):
            wiki_dir_arg = args[i + 1]
            i += 1
        else:
            query_parts.append(args[i])
        i += 1

    if not query_parts:
        print("Error: no query provided. Use 'codespace wiki --help' for usage.")
        return 1

    query = " ".join(query_parts)

    # Find wiki directory
    if wiki_dir_arg:
        wiki_dir = Path(wiki_dir_arg)
    else:
        wiki_dir = _find_wiki_dir()

    if wiki_dir is None or not wiki_dir.exists():
        print("Error: wiki directory not found.")
        print("Run 'codespace <repo> --llm-provider <provider>' first to generate wiki pages.")
        print("Or specify the path with --dir <path>.")
        return 1

    # Route by intent
    intent = detect_intent(query)

    if intent == "list":
        result = load_index(wiki_dir)
    elif intent == "module":
        result = load_module_wiki(wiki_dir, query, depth=depth)
    else:
        result = search_wiki(wiki_dir, query, depth=depth)

    _render_output(result)
    return 0

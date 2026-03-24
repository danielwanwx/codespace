"""MCP server with wiki_resolve tool for coding agents."""
import os
import re
from pathlib import Path

from codespace.wiki_layers import extract_l1

# --- Core functions (sync, testable without MCP runtime) ---

_LIST_KEYWORDS = frozenset({"list", "repos", "repositories"})


def detect_intent(query: str) -> str:
    """Classify query intent: 'list', 'module', or 'search'."""
    q = query.strip().lower()
    if q in _LIST_KEYWORDS:
        return "list"
    # Module lookup: single token or qualified name (e.g. "r::auth", "auth_service")
    if re.match(r'^[\w:.]+$', q) and ' ' not in q:
        return "module"
    return "search"


def load_index(wiki_dir: Path) -> str:
    """Load the L0 module index."""
    index_path = wiki_dir / "_index.md"
    if index_path.exists():
        return index_path.read_text()
    return "[REPO_NOT_FOUND] No wiki index found. Run `codespace` with --wiki-depth to generate."


def _find_module_file(wiki_dir: Path, name: str) -> Path | None:
    """Find the markdown file for a module by name, trying multiple conventions."""
    # Try exact match first
    direct = wiki_dir / f"{name}.md"
    if direct.exists():
        return direct
    # Try with :: replaced by __
    safe_name = re.sub(r"[^a-zA-Z0-9_.-]", "_", name)
    safe = wiki_dir / f"{safe_name}.md"
    if safe.exists():
        return safe
    # Try partial match on any .md file
    for md_file in wiki_dir.glob("*.md"):
        if md_file.name == "_index.md":
            continue
        stem = md_file.stem
        if name in stem or stem in name:
            return md_file
    return None


def load_module_wiki(wiki_dir: Path, name: str, depth: str = "auto") -> str:
    """Load a module's wiki content at the specified depth.

    depth='auto' returns L1 (summary + headings + top bullets).
    depth='full' returns L2 (complete content).
    """
    md_file = _find_module_file(wiki_dir, name)
    if md_file is None:
        return f"[MODULE_NOT_FOUND] No wiki page found for '{name}'."
    content = md_file.read_text()
    if depth == "full":
        return content
    # Auto depth: return L1 extraction
    return extract_l1(content)


def search_wiki(wiki_dir: Path, query: str, depth: str = "auto") -> str:
    """Search wiki pages for matching content. Returns relevant L1 summaries."""
    query_lower = query.lower()
    query_terms = query_lower.split()
    results = []

    for md_file in sorted(wiki_dir.glob("*.md")):
        if md_file.name == "_index.md":
            continue
        content = md_file.read_text()
        content_lower = content.lower()
        # Score: count of query terms found
        score = sum(1 for term in query_terms if term in content_lower)
        if score > 0:
            if depth == "full":
                results.append((score, md_file.stem, content))
            else:
                results.append((score, md_file.stem, extract_l1(content)))

    if not results:
        return f"No results found for '{query}'."

    results.sort(key=lambda x: x[0], reverse=True)
    parts = []
    for score, name, summary in results[:5]:
        parts.append(f"## {name}\n{summary}")
    return "\n\n".join(parts)


# --- MCP server wrapper (async, requires mcp package) ---

def create_mcp_server(wiki_dir: str | Path):
    """Create an MCP server with the wiki_resolve tool.

    Requires: pip install 'codespace[mcp]'
    """
    from mcp.server import Server
    from mcp.server.stdio import stdio_server
    from mcp.types import Tool, TextContent

    wiki_path = Path(wiki_dir)
    server = Server("codespace-wiki")

    @server.list_tools()
    async def list_tools():
        return [
            Tool(
                name="wiki_resolve",
                description=(
                    "Look up module documentation from the codespace wiki. "
                    "Use query='list' to see all modules, a module name for its summary, "
                    "or a natural language question to search."
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Module name, 'list', or search query",
                        },
                        "depth": {
                            "type": "string",
                            "enum": ["auto", "full"],
                            "default": "auto",
                            "description": "'auto' for summary, 'full' for complete content",
                        },
                    },
                    "required": ["query"],
                },
            )
        ]

    @server.call_tool()
    async def call_tool(name: str, arguments: dict):
        if name != "wiki_resolve":
            return [TextContent(type="text", text=f"Unknown tool: {name}")]

        query = arguments.get("query", "")
        depth = arguments.get("depth", "auto")
        intent = detect_intent(query)

        if intent == "list":
            result = load_index(wiki_path)
        elif intent == "module":
            result = load_module_wiki(wiki_path, query, depth=depth)
        else:
            result = search_wiki(wiki_path, query, depth=depth)

        return [TextContent(type="text", text=result)]

    return server


async def _run_server(wiki_dir: str):
    """Run the MCP server via stdio."""
    from mcp.server.stdio import stdio_server

    server = create_mcp_server(wiki_dir)
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream)


if __name__ == "__main__":
    import asyncio
    import sys

    wiki_dir = sys.argv[1] if len(sys.argv) > 1 else "wiki"
    asyncio.run(_run_server(wiki_dir))

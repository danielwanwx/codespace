"""Wiki page generator — produces self-contained HTML wiki pages via LLM."""
import os
import re
from pathlib import Path

from codespace.clusters import Cluster
from codespace.symbols import SymbolEntry
from codespace.llm import LLMClient
from codespace.wiki_prompt import (
    build_module_wiki_prompt,
    build_wiki_prompt,
    build_summary_prompt,
)
from codespace.wiki_layers import build_layers, generate_index


# Embedded CSS extracted from wiki_example.html for self-contained pages
WIKI_CSS = """\
* { margin:0; padding:0; box-sizing:border-box; font-family:"Barlow",sans-serif; -webkit-font-smoothing:antialiased; }
body { background:#fff; color:#1a1a1a; line-height:1.7; }
.topbar { position:sticky; top:0; z-index:10; background:#fff; border-bottom:1px solid rgba(0,0,0,0.06); display:flex; align-items:center; height:48px; padding:0 32px; }
.topbar-logo { font-family:"Barlow Condensed",sans-serif; font-size:16px; font-weight:600; letter-spacing:0.3em; text-transform:uppercase; color:#111; text-decoration:none; margin-right:24px; }
.topbar-breadcrumb { font-size:13px; color:rgba(0,0,0,0.3); }
.topbar-breadcrumb a { color:rgba(0,0,0,0.45); text-decoration:none; }
.topbar-breadcrumb a:hover { color:#111; }
.topbar-breadcrumb span { margin:0 6px; }
.main { max-width:800px; margin:0 auto; padding:36px 48px; }
.back-link { display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:500; color:rgba(0,0,0,0.35); text-decoration:none; text-transform:uppercase; letter-spacing:0.1em; margin-bottom:24px; transition:color 0.15s; }
.back-link:hover { color:#111; }
h1 { font-family:"Barlow Condensed",sans-serif; font-size:32px; font-weight:700; color:#000; letter-spacing:0.02em; margin-bottom:8px; }
.subtitle { font-size:14px; color:rgba(0,0,0,0.45); margin-bottom:4px; }
.meta-line { display:flex; align-items:center; gap:16px; margin-bottom:24px; padding-bottom:20px; border-bottom:1px solid rgba(0,0,0,0.06); flex-wrap:wrap; }
.meta-badge { display:inline-flex; align-items:center; gap:5px; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.06em; }
.meta-tag { font-size:11px; font-weight:500; text-transform:uppercase; letter-spacing:0.08em; color:rgba(0,0,0,0.3); }
.meta-file { font-size:12px; color:rgba(0,0,0,0.35); font-family:"JetBrains Mono",monospace; }
h2 { font-size:14px; font-weight:700; text-transform:uppercase; letter-spacing:0.12em; color:#111; margin-top:36px; margin-bottom:14px; }
h3 { font-size:13px; font-weight:600; color:rgba(0,0,0,0.5); margin-top:16px; margin-bottom:10px; }
p { font-size:15px; color:rgba(0,0,0,0.6); margin-bottom:14px; }
ul, ol { font-size:15px; color:rgba(0,0,0,0.6); margin-bottom:14px; padding-left:20px; }
li { margin-bottom:6px; }
pre { background:rgba(0,0,0,0.025); padding:16px 20px; margin-bottom:16px; overflow-x:auto; font-family:"JetBrains Mono",monospace; font-size:13px; line-height:1.6; color:rgba(0,0,0,0.7); }
code { font-family:"JetBrains Mono",monospace; font-size:13px; background:rgba(0,0,0,0.04); padding:1px 5px; color:rgba(0,0,0,0.7); }
pre code { background:none; padding:0; }
table { width:100%; border-collapse:collapse; margin-bottom:16px; font-size:14px; }
th { text-align:left; font-weight:600; color:#111; padding:8px 12px; border-bottom:1px solid rgba(0,0,0,0.1); font-size:12px; text-transform:uppercase; letter-spacing:0.06em; }
td { padding:8px 12px; color:rgba(0,0,0,0.55); border-bottom:1px solid rgba(0,0,0,0.04); }
td code { font-size:12px; }
.note { font-size:14px; color:rgba(0,0,0,0.5); padding:12px 16px; background:rgba(0,0,0,0.02); margin-bottom:12px; }
.note strong { color:rgba(0,0,0,0.7); }
blockquote { border-left:3px solid rgba(0,0,0,0.1); padding-left:16px; margin-bottom:14px; font-style:italic; color:rgba(0,0,0,0.5); }
hr { border:none; border-top:1px solid rgba(0,0,0,0.06); margin:24px 0; }
"""


def _md_to_html(md: str) -> str:
    """Minimal markdown-to-HTML conversion for LLM output."""
    lines = md.split("\n")
    html_parts = []
    in_code_block = False
    in_list = False
    in_table = False
    table_header_done = False

    for line in lines:
        # Code blocks
        if line.strip().startswith("```"):
            if in_code_block:
                html_parts.append("</code></pre>")
                in_code_block = False
            else:
                lang = line.strip()[3:].strip()
                html_parts.append(f"<pre><code>")
                in_code_block = True
            continue

        if in_code_block:
            html_parts.append(_escape_html(line))
            continue

        stripped = line.strip()

        # Horizontal rules
        if stripped in ("---", "***", "___"):
            if in_list:
                html_parts.append("</ul>")
                in_list = False
            if in_table:
                html_parts.append("</table>")
                in_table = False
                table_header_done = False
            html_parts.append("<hr>")
            continue

        # Table rows
        if "|" in stripped and stripped.startswith("|"):
            cells = [c.strip() for c in stripped.split("|")[1:-1]]
            if all(set(c) <= set("- :") for c in cells):
                # separator row, skip
                continue
            if not in_table:
                html_parts.append("<table>")
                in_table = True
                table_header_done = False
            if not table_header_done:
                html_parts.append("<tr>" + "".join(f"<th>{_inline_md(c)}</th>" for c in cells) + "</tr>")
                table_header_done = True
            else:
                html_parts.append("<tr>" + "".join(f"<td>{_inline_md(c)}</td>" for c in cells) + "</tr>")
            continue
        elif in_table:
            html_parts.append("</table>")
            in_table = False
            table_header_done = False

        # Headers
        if stripped.startswith("# "):
            if in_list:
                html_parts.append("</ul>")
                in_list = False
            html_parts.append(f"<h1>{_inline_md(stripped[2:])}</h1>")
            continue
        if stripped.startswith("## "):
            if in_list:
                html_parts.append("</ul>")
                in_list = False
            html_parts.append(f"<h2>{_inline_md(stripped[3:])}</h2>")
            continue
        if stripped.startswith("### "):
            if in_list:
                html_parts.append("</ul>")
                in_list = False
            html_parts.append(f"<h3>{_inline_md(stripped[4:])}</h3>")
            continue

        # Blockquote
        if stripped.startswith("> "):
            html_parts.append(f"<blockquote><p>{_inline_md(stripped[2:])}</p></blockquote>")
            continue

        # List items
        if stripped.startswith("- ") or stripped.startswith("* "):
            if not in_list:
                html_parts.append("<ul>")
                in_list = True
            html_parts.append(f"<li>{_inline_md(stripped[2:])}</li>")
            continue
        if re.match(r"^\d+\.\s", stripped):
            if not in_list:
                html_parts.append("<ol>")
                in_list = True
            text = re.sub(r"^\d+\.\s", "", stripped)
            html_parts.append(f"<li>{_inline_md(text)}</li>")
            continue

        if in_list and stripped == "":
            html_parts.append("</ul>" if in_list else "</ol>")
            in_list = False
            continue

        # Paragraphs
        if stripped:
            if in_list:
                html_parts.append("</ul>")
                in_list = False
            html_parts.append(f"<p>{_inline_md(stripped)}</p>")

    if in_list:
        html_parts.append("</ul>")
    if in_table:
        html_parts.append("</table>")
    if in_code_block:
        html_parts.append("</code></pre>")

    return "\n".join(html_parts)


def _escape_html(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _inline_md(text: str) -> str:
    """Convert inline markdown (bold, code, italic) to HTML."""
    text = _escape_html(text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"`(.+?)`", r"<code>\1</code>", text)
    text = re.sub(r"\*(.+?)\*", r"<em>\1</em>", text)
    return text


def _build_html_page(title: str, breadcrumb: str, body_html: str) -> str:
    """Wrap body HTML in a full self-contained HTML page."""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{_escape_html(title)} — Codespace Wiki</title>
<link href="https://fonts.googleapis.com/css2?family=Barlow:wght@300;400;500;600;700&family=Barlow+Condensed:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
{WIKI_CSS}
</style>
</head>
<body>

<div class="topbar">
  <a class="topbar-logo" href="#">Codespace</a>
  <div class="topbar-breadcrumb">{breadcrumb}</div>
</div>

<div class="main">
  <a class="back-link" href="/">&larr; Back to Graph</a>
{body_html}
</div>

</body>
</html>"""


def _safe_filename(name: str) -> str:
    """Convert a qualified name to a safe filename."""
    return re.sub(r"[^a-zA-Z0-9_.-]", "_", name) + ".html"


def _safe_filename_md(name: str) -> str:
    """Convert a qualified name to a safe markdown filename."""
    return re.sub(r"[^a-zA-Z0-9_.-]", "_", name) + ".md"


def _extract_first_sentence(text: str) -> str:
    """Extract first sentence from LLM response for summary_l1."""
    text = text.strip()
    # Remove any markdown headers
    text = re.sub(r"^#+\s+.*\n", "", text).strip()
    # Remove blockquote markers
    text = re.sub(r"^>\s*", "", text).strip()
    # Get first sentence
    match = re.match(r"(.+?[.!?])\s", text)
    if match:
        return match.group(1)
    # Fallback: first line up to 200 chars
    first_line = text.split("\n")[0][:200]
    return first_line


def generate_wiki_pages(
    clusters: list[Cluster],
    symbols: list[SymbolEntry],
    file_contents: dict[str, str],
    func_edges,
    mod_edges: dict[tuple[str, str], dict],
    llm_client: LLMClient,
    output_dir: str,
    wiki_depth: str = "modules",
) -> tuple[dict[str, str], dict[str, str], dict[str, str]]:
    """Generate wiki pages (MD source of truth + HTML) for modules (and optionally symbols).

    Returns:
        (wiki_paths, l0_summaries, l1_summaries) - dicts mapping node id -> relative wiki path / L0 text / L1 markdown
    """
    wiki_paths: dict[str, str] = {}
    l0_summaries: dict[str, str] = {}
    l1_summaries: dict[str, str] = {}

    os.makedirs(output_dir, exist_ok=True)

    # Build lookup structures
    symbols_by_module: dict[str, list[SymbolEntry]] = {}
    for sym in symbols:
        parts = sym.qualified_name.split("::")
        if len(parts) >= 2:
            mod_key = f"{parts[0]}::{parts[1]}"
            symbols_by_module.setdefault(mod_key, []).append(sym)

    # Module connection names
    mod_outgoing: dict[str, list[str]] = {}
    mod_incoming: dict[str, list[str]] = {}
    for (src, tgt), data in mod_edges.items():
        mod_outgoing.setdefault(src, []).append(tgt.split("::")[-1])
        mod_incoming.setdefault(tgt, []).append(src.split("::")[-1])

    total = len(clusters)
    for i, cluster in enumerate(clusters):
        print(f"         [{i+1}/{total}] Generating wiki: {cluster.semantic_label or cluster.name}")
        mod_symbols = symbols_by_module.get(cluster.id, [])
        outgoing = mod_outgoing.get(cluster.id, [])
        incoming = mod_incoming.get(cluster.id, [])

        prompt = build_module_wiki_prompt(
            cluster, mod_symbols, file_contents, outgoing, incoming,
        )

        try:
            md_response = llm_client.complete(prompt, max_tokens=2000)
        except Exception as e:
            print(f"         Warning: LLM failed for {cluster.id}: {e}")
            md_response = f"# {cluster.semantic_label or cluster.name}\n\nWiki generation failed."

        # Extract layers (L0/L1/L2) from the markdown response
        layers = build_layers(md_response)
        l0_summaries[cluster.id] = layers.l0
        l1_summaries[cluster.id] = layers.l1

        # Save markdown (source of truth)
        md_filename = _safe_filename_md(cluster.id)
        md_filepath = os.path.join(output_dir, md_filename)
        with open(md_filepath, "w") as f:
            f.write(layers.l2)

        # Render HTML from markdown
        body_html = _md_to_html(layers.l2)
        breadcrumb_parts = cluster.path.split("/")
        breadcrumb = " <span>/</span> ".join(
            f'<a href="#">{p}</a>' for p in breadcrumb_parts
        )
        html = _build_html_page(
            title=cluster.semantic_label or cluster.name,
            breadcrumb=breadcrumb,
            body_html=body_html,
        )
        filename = _safe_filename(cluster.id)
        filepath = os.path.join(output_dir, filename)
        with open(filepath, "w") as f:
            f.write(html)
        wiki_paths[cluster.id] = f"wiki/{filename}"

    # Full depth: also generate pages for individual symbols
    if wiki_depth == "full":
        sym_total = len(symbols)
        for j, sym in enumerate(symbols):
            print(f"         [{j+1}/{sym_total}] Generating wiki: {sym.qualified_name.split('::')[-1]}")

            source_code = ""
            if sym.file in file_contents:
                source_code = file_contents[sym.file]
                # Truncate to ~200 lines around the symbol
                source_lines = source_code.splitlines()
                start = max(0, (sym.line or 1) - 1)
                end = min(len(source_lines), start + 200)
                source_code = "\n".join(source_lines[start:end])

            calls = sym.calls or []
            called_by = sym.called_by or []
            imports = []  # We don't have easy access here

            prompt = build_wiki_prompt(sym, source_code, calls, called_by, imports)

            try:
                md_response = llm_client.complete(prompt, max_tokens=2000)
            except Exception as e:
                print(f"         Warning: LLM failed for {sym.qualified_name}: {e}")
                md_response = f"# {sym.qualified_name.split('::')[-1]}\n\nWiki generation failed."

            # Extract layers for symbols too
            sym_layers = build_layers(md_response)
            l0_summaries[sym.qualified_name] = sym_layers.l0
            l1_summaries[sym.qualified_name] = sym_layers.l1

            # Save markdown
            md_filename = _safe_filename_md(sym.qualified_name)
            md_filepath = os.path.join(output_dir, md_filename)
            with open(md_filepath, "w") as f:
                f.write(sym_layers.l2)

            # Render HTML from markdown
            body_html = _md_to_html(sym_layers.l2)
            short_name = sym.qualified_name.split("::")[-1]
            breadcrumb = f'<a href="#">{sym.file}</a> <span>/</span> {short_name}'
            html = _build_html_page(
                title=short_name,
                breadcrumb=breadcrumb,
                body_html=body_html,
            )
            filename = _safe_filename(sym.qualified_name)
            filepath = os.path.join(output_dir, filename)
            with open(filepath, "w") as f:
                f.write(html)
            wiki_paths[sym.qualified_name] = f"wiki/{filename}"

    # Generate _index.md
    module_entries = [(c.semantic_label or c.name, l0_summaries.get(c.id, "")) for c in clusters]
    with open(os.path.join(output_dir, "_index.md"), "w") as f:
        f.write(generate_index(module_entries))

    return wiki_paths, l0_summaries, l1_summaries

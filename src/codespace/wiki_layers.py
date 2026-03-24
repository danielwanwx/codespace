"""Extract L0/L1 layers from L2 wiki markdown."""
import re
from dataclasses import dataclass


@dataclass
class WikiLayers:
    l0: str   # One-line purpose (~30 tokens)
    l1: str   # Structured summary (~150 tokens)
    l2: str   # Full wiki content


def _strip_inline_md(text: str) -> str:
    """Remove bold, code, italic markers from text."""
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'`(.+?)`', r'\1', text)
    text = re.sub(r'\*(.+?)\*', r'\1', text)
    return text.strip()


def extract_l0(markdown: str) -> str:
    """Extract one-line purpose from L2. Checks blockquote first, then first paragraph."""
    for line in markdown.splitlines():
        stripped = line.strip()
        if stripped.startswith("> "):
            return _strip_inline_md(stripped[2:])
    # Fallback: first non-empty, non-heading, non-metadata paragraph
    for line in markdown.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or stripped.startswith("**") or stripped.startswith("---"):
            continue
        # Take first sentence
        sentence = stripped.split(". ")[0]
        if not sentence.endswith("."):
            sentence += "."
        return _strip_inline_md(sentence)
    return ""


def extract_l1(markdown: str) -> str:
    """Extract structured summary: title + blockquote + section headings + top bullets."""
    lines = markdown.splitlines()
    result = []
    in_section = False
    bullet_count = 0
    MAX_BULLETS_PER_SECTION = 3

    for line in lines:
        stripped = line.strip()
        # Always include H1 and blockquote
        if stripped.startswith("# ") and not stripped.startswith("## "):
            result.append(stripped)
            continue
        if stripped.startswith("> "):
            result.append(stripped)
            result.append("")
            continue
        # Include all H2 headings
        if stripped.startswith("## "):
            result.append(stripped)
            in_section = True
            bullet_count = 0
            continue
        # Include limited bullets under each section
        if in_section and stripped.startswith("- ") and bullet_count < MAX_BULLETS_PER_SECTION:
            result.append(stripped)
            bullet_count += 1
            continue
        # Skip everything else (paragraphs, code blocks, tables, excess bullets)

    return "\n".join(result)


def build_layers(l2_markdown: str) -> WikiLayers:
    return WikiLayers(
        l0=extract_l0(l2_markdown),
        l1=extract_l1(l2_markdown),
        l2=l2_markdown,
    )


def generate_index(modules: list[tuple[str, str]]) -> str:
    if not modules:
        return "# Module Index\n\nThis repository contains 0 modules.\n"
    lines = ["# Module Index", "", f"This repository contains {len(modules)} modules.", ""]
    for name, summary in sorted(modules):
        lines.append(f"- **{name}** — {summary}")
    lines.append("")
    return "\n".join(lines)

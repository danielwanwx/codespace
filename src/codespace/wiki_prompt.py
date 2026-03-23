"""Wiki page generation prompt template for Codespace."""

WIKI_PAGE_PROMPT = """\
You are a senior software engineer writing internal documentation for a code wiki.
Generate a comprehensive wiki page for the given code symbol.

## Input Context

**Symbol:** {symbol_name}
**Kind:** {kind} (function / class / method)
**File:** {file_path}:{line_number}
**Module:** {module_name}
**Signature:** {signature}
**Docstring:** {docstring}
**Source Code:**
```python
{source_code}
```

**Calls (outgoing):** {calls}
**Called By (incoming):** {called_by}
**Imports Used:** {imports}

## Output Format

Write in Markdown. Follow this exact structure:

---

# {symbol_name}

> One-sentence summary of what this symbol does and why it exists.

**Module:** `{module_name}` · **File:** `{file_path}:{line_number}` · **Kind:** {kind}

---

## Overview

2-3 paragraphs explaining:
- What this symbol does at a high level
- Why it exists (what problem it solves)
- Where it fits in the overall pipeline/architecture

## Signature

```python
{signature}
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| ... | ... | ... |

### Returns

| Type | Description |
|------|-------------|
| ... | ... |

### Raises

| Exception | When |
|-----------|------|
| ... | ... |

(Omit Raises section if the function doesn't raise exceptions)

## How It Works

Step-by-step explanation of the internal logic:
1. First, it does X...
2. Then it processes Y...
3. Finally it returns Z...

Include any important algorithms, data structures, or design decisions.

## Usage Example

```python
# Practical example showing typical usage
result = symbol_name(args)
```

Add a brief explanation of the example.

## Dependencies

### Calls (Outgoing)

| Symbol | Module | Purpose |
|--------|--------|---------|
| ... | ... | Why this symbol calls it |

### Called By (Incoming)

| Symbol | Module | Purpose |
|--------|--------|---------|
| ... | ... | Why this caller invokes it |

## Architecture Context

```mermaid
graph LR
    CallerA --> ThisSymbol
    CallerB --> ThisSymbol
    ThisSymbol --> DependencyX
    ThisSymbol --> DependencyY
```

Brief explanation of data flow and where this fits in the pipeline.

## Edge Cases & Notes

- Important edge cases or gotchas
- Performance considerations
- Thread safety notes
- Any known limitations

## Related Symbols

- [`related_function()`](./related_function.md) — Brief reason why it's related
- [`RelatedClass`](./RelatedClass.md) — Brief reason

## Changelog

| Date | Change | Commit |
|------|--------|--------|
| {date} | Initial documentation | auto-generated |

---

## Rules

1. Be precise and technical — this is for engineers, not end users
2. Every claim must be grounded in the source code provided
3. Do NOT hallucinate parameters, return types, or behavior not in the code
4. Use the exact parameter names and types from the signature
5. The mermaid diagram should reflect actual call relationships, not hypothetical ones
6. Keep the tone professional and concise — no filler phrases
7. If the source code is too short to fill a section, omit that section rather than padding
8. For classes: document __init__ parameters, key methods, and class-level attributes
"""


def build_wiki_prompt(symbol, source_code, calls, called_by, imports):
    """Build a complete wiki prompt for a symbol."""
    return WIKI_PAGE_PROMPT.format(
        symbol_name=symbol.qualified_name.split("::")[-1],
        kind=symbol.kind,
        file_path=symbol.file,
        line_number=symbol.line,
        module_name="::".join(symbol.qualified_name.split("::")[:2]),
        signature=symbol.signature or symbol.qualified_name.split("::")[-1],
        docstring=symbol.docstring or "(no docstring)",
        source_code=source_code,
        calls=", ".join(calls) if calls else "(none)",
        called_by=", ".join(called_by) if called_by else "(none)",
        imports=", ".join(imports) if imports else "(none)",
        date="auto",
    )


MODULE_WIKI_PROMPT = """\
You are a senior software engineer writing internal documentation for a code wiki.
Generate a comprehensive wiki page for the given module (directory/package).

## Input Context

**Module:** {module_name}
**Path:** {module_path}
**Files ({file_count}):** {file_list}
**Symbols ({symbol_count}):** {symbol_list}
**Outgoing connections:** {outgoing}
**Incoming connections:** {incoming}

**Source excerpts:**
{source_excerpts}

## Output Format

Write in Markdown. Follow this exact structure:

---

# {module_name}

> One-sentence summary of what this module does and why it exists.

**Path:** `{module_path}` · **Files:** {file_count} · **Symbols:** {symbol_count}

---

## Overview

2-3 paragraphs explaining:
- What this module is responsible for
- Why it exists as a cohesive unit
- Where it fits in the overall architecture

## Public API

| Symbol | Kind | Description |
|--------|------|-------------|
| ... | function/class | One-line description |

## Internal Structure

How the files in this module are organized and how they relate to each other.

## Dependencies

### Depends On (Outgoing)

| Module | Purpose |
|--------|---------|
| ... | Why this module depends on it |

### Used By (Incoming)

| Module | Purpose |
|--------|---------|
| ... | Why that module depends on this one |

## Architecture Context

```mermaid
graph LR
    IncomingA --> ThisModule
    ThisModule --> OutgoingX
    ThisModule --> OutgoingY
```

Brief explanation of data flow.

## Key Design Decisions

- Important architectural choices
- Trade-offs made
- Patterns used

---

## Rules

1. Be precise and technical — this is for engineers
2. Every claim must be grounded in the source code provided
3. Do NOT hallucinate file names, symbols, or behavior not in the code
4. Keep the tone professional and concise
5. The mermaid diagram should reflect actual connections, not hypothetical ones
6. If source excerpts are too short to fill a section, omit that section
"""


def build_module_wiki_prompt(cluster, symbols, file_contents, outgoing, incoming):
    """Build a wiki prompt for a module/cluster."""
    # Collect source excerpts (truncated)
    MAX_CHARS = 8000
    MAX_LINES_PER_FILE = 200
    excerpts = []
    total_chars = 0
    for sym in symbols:
        if sym.file in file_contents and total_chars < MAX_CHARS:
            content = file_contents[sym.file]
            lines = content.splitlines()[:MAX_LINES_PER_FILE]
            chunk = "\n".join(lines)
            if total_chars + len(chunk) > MAX_CHARS:
                chunk = chunk[:MAX_CHARS - total_chars]
            if chunk:
                excerpts.append(f"### {sym.file}\n```\n{chunk}\n```")
                total_chars += len(chunk)

    # Deduplicate excerpts by file
    seen_files = set()
    unique_excerpts = []
    for exc in excerpts:
        file_header = exc.split("\n")[0]
        if file_header not in seen_files:
            seen_files.add(file_header)
            unique_excerpts.append(exc)

    symbol_names = [s.qualified_name.split("::")[-1] for s in symbols]

    return MODULE_WIKI_PROMPT.format(
        module_name=cluster.semantic_label or cluster.name,
        module_path=cluster.path,
        file_count=cluster.file_count,
        file_list=", ".join(seen_files) if seen_files else "(none)",
        symbol_count=cluster.symbol_count,
        symbol_list=", ".join(symbol_names[:30]) + ("..." if len(symbol_names) > 30 else ""),
        outgoing=", ".join(outgoing) if outgoing else "(none)",
        incoming=", ".join(incoming) if incoming else "(none)",
        source_excerpts="\n\n".join(unique_excerpts) if unique_excerpts else "(no source available)",
    )


SUMMARY_PROMPT = """\
Write a 2-3 sentence summary of what this code component does and why it exists.
Be specific and technical. No filler phrases.

Name: {name}
Kind: {kind}
{extra_context}

Respond with ONLY the summary sentences, no headers or formatting."""


def build_summary_prompt(name, kind, extra_context=""):
    """Build a short summary prompt for any symbol or cluster."""
    return SUMMARY_PROMPT.format(
        name=name,
        kind=kind,
        extra_context=extra_context,
    )

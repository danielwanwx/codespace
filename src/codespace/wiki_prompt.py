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

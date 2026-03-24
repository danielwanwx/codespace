from codespace.wiki_layers import extract_l0, extract_l1, build_layers, generate_index

SAMPLE_L2 = """# Auth Service

> Handles user authentication and session management via JWT tokens.

**Path:** `src/auth` · **Files:** 3 · **Symbols:** 12

## Overview

This module provides the core authentication layer. It validates
credentials, issues JWT tokens, and manages session lifecycle.

## Public API

- `login(email, password)` — Authenticate user, return token
- `verify_token(token)` — Validate JWT, return user context
- `refresh_session(token)` — Extend session expiry

## Dependencies

### Depends On
- `db.models` — User table access
- `crypto.utils` — Password hashing

### Used By
- `api.routes` — All protected endpoints
- `middleware.auth` — Request authentication

## Architecture Context

Central auth hub — all API routes depend on this module.
"""

def test_extract_l0_from_blockquote():
    assert extract_l0(SAMPLE_L2) == "Handles user authentication and session management via JWT tokens."

def test_extract_l0_fallback_to_first_paragraph():
    md = "# Module\n\nThis does something important. More details here.\n\n## Section\n"
    l0 = extract_l0(md)
    assert "This does something important." in l0

def test_extract_l0_strips_markdown():
    md = "# M\n> **Bold** and `code` summary.\n"
    l0 = extract_l0(md)
    assert "Bold" in l0
    assert "**" not in l0
    assert "`" not in l0

def test_extract_l1_includes_structure():
    l1 = extract_l1(SAMPLE_L2)
    assert "Auth Service" in l1
    assert "## Public API" in l1
    assert "## Dependencies" in l1
    assert "login" in l1
    # Should NOT include full paragraphs
    assert "validates\ncredentials" not in l1

def test_extract_l1_limits_bullets():
    """L1 should include max 3 bullets per section."""
    md = "# M\n> Purpose.\n\n## Items\n" + "\n".join(f"- item{i}" for i in range(20))
    l1 = extract_l1(md)
    bullet_count = l1.count("- item")
    assert bullet_count <= 3

def test_build_layers():
    layers = build_layers(SAMPLE_L2)
    assert layers.l0 == "Handles user authentication and session management via JWT tokens."
    assert "## Public API" in layers.l1
    assert layers.l2 == SAMPLE_L2

def test_generate_index():
    modules = [("auth", "Auth module."), ("api", "API gateway.")]
    idx = generate_index(modules)
    assert "# Module Index" in idx
    assert "auth" in idx
    assert "API gateway." in idx

def test_empty_modules():
    assert generate_index([]) == "# Module Index\n\nThis repository contains 0 modules.\n"

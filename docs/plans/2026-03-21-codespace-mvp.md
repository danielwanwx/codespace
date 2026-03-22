# Codespace MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a single-repo Python code graph visualizer with cluster layout, zoom-controlled granularity, and LLM-powered explanations.

**Architecture:** Python backend pipeline (reusing codewiki patterns) generates a static `codespace_graph.json`. React + G6 v5 frontend consumes it as a pure client-side app. LLM calls for on-demand explanations happen browser-side via user-provided API key.

**Tech Stack:** Python 3.12, ast module, React 19, G6 v5 (AntV), Zustand, Vite, TailwindCSS v4, TypeScript

**Reference:** `/Users/javiswan/Projects/codespace/DESIGN.md` (Sections 0-10)

---

## Task Dependency Graph

```
Task 1 (project scaffold)
  → Task 2 (indexer)
    → Task 3 (symbol extractor)
      → Task 4 (import parser)
        → Task 5 (graph aggregator) ← HIGHEST RISK
          → Task 6 (cluster formation)
            → Task 7 (cluster namer - LLM)
              → Task 8 (codespace export)
                → Task 9 (G6 graph shell)
                  → Task 10 (combo layout + compound nodes)
                    → Task 11 (zoom + expand interaction)
                      → Task 12 (color system)
                        → Task 13 (side panel)
                          → Task 14 (search + fly-to)
                            → Task 15 (on-demand LLM explanations)
                              → Task 16 (minimap + polish)
                                → Task 17 (static deploy)
```

---

### Task 1: Project Scaffold

**Files:**
- Create: `pyproject.toml`
- Create: `src/codespace/__init__.py`
- Create: `src/codespace/cli.py`
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/tailwind.config.ts`

**Step 1: Initialize Python backend**

```toml
# pyproject.toml
[project]
name = "codespace"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = []

[project.optional-dependencies]
llm = ["anthropic", "openai"]
dev = ["pytest", "pytest-cov"]

[project.scripts]
codespace = "codespace.cli:main"
```

```python
# src/codespace/__init__.py
"""Codespace — Google Earth for Code."""
```

```python
# src/codespace/cli.py
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
```

**Step 2: Initialize React + G6 frontend**

```bash
cd /Users/javiswan/Projects/codespace
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install @antv/g6@^5 zustand react-markdown
npm install -D tailwindcss @tailwindcss/vite
```

**Step 3: Verify both build**

Run:
```bash
cd /Users/javiswan/Projects/codespace && pip install -e ".[dev]" && codespace --help
cd /Users/javiswan/Projects/codespace/frontend && npm run build
```

Expected: CLI shows help text. Frontend builds without errors.

**Step 4: Commit**

```bash
git init
git add pyproject.toml src/ frontend/ DESIGN.md docs/
git commit -m "feat: project scaffold — Python backend + React/G6 frontend"
```

---

### Task 2: Indexer — Repo → Modules

**Files:**
- Create: `src/codespace/indexer.py`
- Create: `tests/test_indexer.py`

**Reference:** DESIGN.md Section 4.1, dcap-code-wiki `indexer.py` pattern

**Step 1: Write the failing test**

```python
# tests/test_indexer.py
import tempfile, os
from codespace.indexer import scan_repo, Module

def _make_repo(tmp_path):
    """Create a minimal fake repo."""
    src = os.path.join(tmp_path, "src", "auth")
    os.makedirs(src)
    with open(os.path.join(src, "login.py"), "w") as f:
        f.write("def login(): pass\n")
    with open(os.path.join(src, "register.py"), "w") as f:
        f.write("def register(): pass\n")
    utils = os.path.join(tmp_path, "src", "utils")
    os.makedirs(utils)
    with open(os.path.join(utils, "helpers.py"), "w") as f:
        f.write("def helper(): pass\n")
    return tmp_path

def test_scan_finds_modules():
    with tempfile.TemporaryDirectory() as tmp:
        repo = _make_repo(tmp)
        modules = scan_repo(repo)
        names = {m.name for m in modules}
        assert "auth" in names
        assert "utils" in names

def test_scan_collects_files():
    with tempfile.TemporaryDirectory() as tmp:
        repo = _make_repo(tmp)
        modules = scan_repo(repo)
        auth = next(m for m in modules if m.name == "auth")
        assert len(auth.files) == 2

def test_scan_skips_excluded_dirs():
    with tempfile.TemporaryDirectory() as tmp:
        repo = _make_repo(tmp)
        venv = os.path.join(tmp, "venv", "lib")
        os.makedirs(venv)
        with open(os.path.join(venv, "pkg.py"), "w") as f:
            f.write("x = 1\n")
        modules = scan_repo(repo)
        names = {m.name for m in modules}
        assert "lib" not in names

def test_merge_small_modules():
    """Directories with <= 2 files merge into parent."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = _make_repo(tmp)
        # utils has only 1 file — should merge into parent
        modules = scan_repo(repo, min_files_per_module=2)
        names = {m.name for m in modules}
        assert "utils" not in names  # merged
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/test_indexer.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'codespace.indexer'`

**Step 3: Write minimal implementation**

```python
# src/codespace/indexer.py
"""Indexer: walk repo, collect files into Modules."""
from dataclasses import dataclass, field
import os

EXCLUDE_DIRS = {"venv", ".venv", "__pycache__", ".git", "node_modules",
                ".egg-info", "dist", "build", ".tox", ".mypy_cache"}
INCLUDE_EXTS = {".py"}
MAX_FILE_SIZE_KB = 100

@dataclass
class IndexedFile:
    rel_path: str
    abs_path: str
    content: str
    size_bytes: int
    line_count: int

@dataclass
class Module:
    name: str
    path: str  # relative to repo root
    files: list[IndexedFile] = field(default_factory=list)
    slug: str = ""  # unique id: "src/auth" → "src.auth"

    def __post_init__(self):
        if not self.slug:
            self.slug = self.path.replace(os.sep, ".").strip(".")

def scan_repo(repo_path: str, min_files_per_module: int = 1) -> list[Module]:
    """Walk repo, group .py files by directory into Modules."""
    repo_path = os.path.abspath(repo_path)
    dir_files: dict[str, list[IndexedFile]] = {}

    for root, dirs, files in os.walk(repo_path):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        rel_dir = os.path.relpath(root, repo_path)
        if rel_dir == ".":
            rel_dir = ""

        py_files = []
        for f in sorted(files):
            if not any(f.endswith(ext) for ext in INCLUDE_EXTS):
                continue
            abs_path = os.path.join(root, f)
            size = os.path.getsize(abs_path)
            if size > MAX_FILE_SIZE_KB * 1024:
                continue
            content = open(abs_path, "r", errors="replace").read()
            rel_path = os.path.relpath(abs_path, repo_path)
            py_files.append(IndexedFile(
                rel_path=rel_path,
                abs_path=abs_path,
                content=content,
                size_bytes=size,
                line_count=content.count("\n") + 1,
            ))

        if py_files:
            dir_files[rel_dir] = py_files

    # Build modules, merging small directories into parent
    modules = []
    merged_into_parent: set[str] = set()

    for dir_path, files in sorted(dir_files.items()):
        if len(files) < min_files_per_module and dir_path:
            parent = os.path.dirname(dir_path)
            if parent in dir_files:
                dir_files[parent].extend(files)
                merged_into_parent.add(dir_path)

    for dir_path, files in sorted(dir_files.items()):
        if dir_path in merged_into_parent:
            continue
        name = os.path.basename(dir_path) if dir_path else os.path.basename(repo_path)
        modules.append(Module(name=name, path=dir_path, files=files))

    return modules
```

**Step 4: Run test to verify it passes**

Run: `pytest tests/test_indexer.py -v`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add src/codespace/indexer.py tests/test_indexer.py
git commit -m "feat: indexer — scan repo, group files into modules"
```

---

### Task 3: Symbol Extractor — Modules → Symbols + Call Graph

**Files:**
- Create: `src/codespace/symbols.py`
- Create: `tests/test_symbols.py`

**Reference:** DESIGN.md Section 3.4, dcap-code-wiki `06-symbol-index.md`

**Step 1: Write the failing test**

```python
# tests/test_symbols.py
from codespace.symbols import extract_symbols, SymbolEntry

SAMPLE_CODE = '''
class AuthService:
    def login(self, email: str, password: str) -> str:
        """Authenticate user."""
        user = find_user(email)
        if verify_hash(password, user.hash):
            return encode_token(user.id)
        raise AuthError("bad password")

    def register(self, email: str) -> None:
        create_user(email)

def find_user(email: str):
    """Look up user by email."""
    return db.query(email)
'''

def test_extract_functions():
    symbols = extract_symbols(SAMPLE_CODE, "myrepo", "auth.service", "src/auth/service.py")
    names = {s.qualified_name for s in symbols}
    assert "myrepo::auth.service::find_user" in names

def test_extract_class():
    symbols = extract_symbols(SAMPLE_CODE, "myrepo", "auth.service", "src/auth/service.py")
    classes = [s for s in symbols if s.kind == "class"]
    assert len(classes) == 1
    assert classes[0].qualified_name == "myrepo::auth.service::AuthService"

def test_extract_methods():
    symbols = extract_symbols(SAMPLE_CODE, "myrepo", "auth.service", "src/auth/service.py")
    login = next(s for s in symbols if "login" in s.qualified_name)
    assert login.kind == "method"
    assert "email" in login.signature
    assert login.metadata_class_name == "AuthService"

def test_calls_extracted():
    symbols = extract_symbols(SAMPLE_CODE, "myrepo", "auth.service", "src/auth/service.py")
    login = next(s for s in symbols if "login" in s.qualified_name)
    assert "find_user" in login.calls
    assert "verify_hash" in login.calls
    assert "encode_token" in login.calls

def test_signature_format():
    symbols = extract_symbols(SAMPLE_CODE, "myrepo", "auth.service", "src/auth/service.py")
    find = next(s for s in symbols if "find_user" in s.qualified_name)
    assert find.signature == "find_user(email: str)"
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/test_symbols.py -v`
Expected: FAIL

**Step 3: Write minimal implementation**

```python
# src/codespace/symbols.py
"""Symbol extractor: AST-based, zero LLM."""
import ast
from dataclasses import dataclass, field

@dataclass
class SymbolEntry:
    qualified_name: str
    kind: str  # "function" | "class" | "method" | "async_function" | "async_method"
    signature: str
    file: str
    line: int
    docstring: str = ""
    calls: list[str] = field(default_factory=list)
    called_by: list[str] = field(default_factory=list)
    metadata_class_name: str = ""  # for methods: owning class (C1 resolution)

def extract_symbols(source: str, repo: str, module_path: str, file_path: str) -> list[SymbolEntry]:
    """Extract all functions, classes, methods from Python source."""
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return []

    symbols = []
    # Build parent map for class detection
    for node in ast.walk(tree):
        for child in ast.iter_child_nodes(node):
            child._parent = node

    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if node.name.startswith("__") and node.name != "__init__":
                continue
            parent = getattr(node, "_parent", None)
            is_method = isinstance(parent, ast.ClassDef)
            class_name = parent.name if is_method else ""

            if is_method:
                qname = f"{repo}::{module_path}::{parent.name}.{node.name}"
                kind = "async_method" if isinstance(node, ast.AsyncFunctionDef) else "method"
            else:
                qname = f"{repo}::{module_path}::{node.name}"
                kind = "async_function" if isinstance(node, ast.AsyncFunctionDef) else "function"

            sig = _format_signature(node, class_name)
            calls = _extract_calls(node)
            doc = ast.get_docstring(node) or ""
            if doc and "\n" in doc:
                doc = doc.split("\n")[0]

            symbols.append(SymbolEntry(
                qualified_name=qname, kind=kind, signature=sig,
                file=file_path, line=node.lineno, docstring=doc,
                calls=calls, metadata_class_name=class_name,
            ))

        elif isinstance(node, ast.ClassDef):
            qname = f"{repo}::{module_path}::{node.name}"
            init = next((n for n in node.body
                        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
                        and n.name == "__init__"), None)
            sig = _format_signature(init, node.name, as_class=True) if init else f"{node.name}()"
            doc = ast.get_docstring(node) or ""
            symbols.append(SymbolEntry(
                qualified_name=qname, kind="class", signature=sig,
                file=file_path, line=node.lineno, docstring=doc,
            ))

    return symbols

def _format_signature(node, class_name: str = "", as_class: bool = False) -> str:
    """Build signature string from AST node."""
    if node is None:
        return ""
    args = []
    for arg in node.args.args:
        if arg.arg in ("self", "cls"):
            continue
        ann = f": {ast.unparse(arg.annotation)}" if arg.annotation else ""
        args.append(f"{arg.arg}{ann}")
    # defaults
    defaults = node.args.defaults
    offset = len(node.args.args) - len(defaults)
    for i, default in enumerate(defaults):
        idx = i + offset
        if idx < len(args):
            args[idx] += f" = {ast.unparse(default)}"
    ret = f" -> {ast.unparse(node.returns)}" if node.returns else ""
    name = class_name if as_class else node.name
    return f"{name}({', '.join(args)}){ret}"

def _extract_calls(node) -> list[str]:
    """Extract function/method names called within this node."""
    calls = set()
    for child in ast.walk(node):
        if isinstance(child, ast.Call):
            if isinstance(child.func, ast.Name):
                calls.add(child.func.id)
            elif isinstance(child.func, ast.Attribute):
                calls.add(child.func.attr)
    return sorted(calls)

def build_reverse_index(all_symbols: list[SymbolEntry]) -> None:
    """Populate called_by for all symbols (mutates in place)."""
    name_to_symbols: dict[str, list[SymbolEntry]] = {}
    for sym in all_symbols:
        bare = sym.qualified_name.split("::")[-1].split(".")[-1]
        name_to_symbols.setdefault(bare, []).append(sym)

    for caller in all_symbols:
        for call_name in caller.calls:
            for target in name_to_symbols.get(call_name, []):
                if caller.qualified_name not in target.called_by:
                    target.called_by.append(caller.qualified_name)
```

**Step 4: Run test to verify it passes**

Run: `pytest tests/test_symbols.py -v`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add src/codespace/symbols.py tests/test_symbols.py
git commit -m "feat: symbol extractor — AST-based functions, classes, call graph"
```

---

### Task 4: Import Parser

**Files:**
- Create: `src/codespace/imports.py`
- Create: `tests/test_imports.py`

**Reference:** DESIGN.md Section 0 (C2 resolution), needed by graph_aggregator

**Step 1: Write the failing test**

```python
# tests/test_imports.py
from codespace.imports import parse_imports

CODE_WITH_IMPORTS = '''
from database.repo import find_user, create_user
from crypto import verify_hash
import os
import json
from .utils import helper
'''

def test_parse_from_imports():
    imports = parse_imports(CODE_WITH_IMPORTS)
    assert "find_user" in imports
    assert imports["find_user"] == "database.repo"

def test_parse_multiple_names():
    imports = parse_imports(CODE_WITH_IMPORTS)
    assert imports["create_user"] == "database.repo"

def test_parse_single_name():
    imports = parse_imports(CODE_WITH_IMPORTS)
    assert imports["verify_hash"] == "crypto"

def test_skips_stdlib():
    imports = parse_imports(CODE_WITH_IMPORTS)
    assert "os" not in imports
    assert "json" not in imports

def test_relative_import():
    imports = parse_imports(CODE_WITH_IMPORTS)
    assert imports["helper"] == ".utils"
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/test_imports.py -v`
Expected: FAIL

**Step 3: Write minimal implementation**

```python
# src/codespace/imports.py
"""Parse Python import statements to map names to source modules."""
import ast
import sys

# stdlib module names (subset of most common)
_STDLIB = set(sys.stdlib_module_names) if hasattr(sys, "stdlib_module_names") else set()

def parse_imports(source: str) -> dict[str, str]:
    """Parse source code, return {imported_name: module_path}.

    Example: 'from database.repo import find_user' → {"find_user": "database.repo"}
    Skips stdlib imports.
    """
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return {}

    result = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            module = node.module or ""
            # Relative imports: prepend dots
            if node.level > 0:
                module = "." * node.level + module
            # Skip stdlib
            top_level = module.lstrip(".").split(".")[0] if module else ""
            if top_level in _STDLIB:
                continue
            for alias in (node.names or []):
                name = alias.asname or alias.name
                if name != "*":
                    result[name] = module

    return result
```

**Step 4: Run test to verify it passes**

Run: `pytest tests/test_imports.py -v`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add src/codespace/imports.py tests/test_imports.py
git commit -m "feat: import parser — map imported names to source modules"
```

---

### Task 5: Graph Aggregator — Resolve Calls → Qualified Edges (HIGHEST RISK)

**Files:**
- Create: `src/codespace/graph_aggregator.py`
- Create: `tests/test_graph_aggregator.py`

**Reference:** DESIGN.md Section 3.4 (full pseudocode)

**Step 1: Write the failing test**

```python
# tests/test_graph_aggregator.py
from codespace.symbols import SymbolEntry
from codespace.graph_aggregator import aggregate_edges, ResolvedEdge

def _make_symbols():
    """Two modules: auth and database, with cross-module calls."""
    return [
        SymbolEntry(
            qualified_name="myrepo::auth.service::login",
            kind="function", signature="login(email, password)",
            file="src/auth/service.py", line=10,
            calls=["find_user", "verify_hash", "encode_token"],
        ),
        SymbolEntry(
            qualified_name="myrepo::auth.service::register",
            kind="function", signature="register(email)",
            file="src/auth/service.py", line=30,
            calls=["create_user"],
        ),
        SymbolEntry(
            qualified_name="myrepo::database.repo::find_user",
            kind="function", signature="find_user(email)",
            file="src/database/repo.py", line=5,
            calls=["query"],
        ),
        SymbolEntry(
            qualified_name="myrepo::database.repo::create_user",
            kind="function", signature="create_user(email)",
            file="src/database/repo.py", line=15,
            calls=["insert"],
        ),
    ]

# File content map for import parsing
FILE_CONTENTS = {
    "src/auth/service.py": "from database.repo import find_user, create_user\n",
    "src/database/repo.py": "",
}

def test_resolves_cross_module_calls():
    symbols = _make_symbols()
    func_edges, mod_edges = aggregate_edges(symbols, FILE_CONTENTS)
    sources = {(e.source, e.target) for e in func_edges}
    assert ("myrepo::auth.service::login", "myrepo::database.repo::find_user") in sources

def test_import_aware_high_confidence():
    symbols = _make_symbols()
    func_edges, _ = aggregate_edges(symbols, FILE_CONTENTS)
    edge = next(e for e in func_edges
                if e.source.endswith("::login") and e.target.endswith("::find_user"))
    assert edge.confidence == "high"

def test_module_edge_aggregation():
    symbols = _make_symbols()
    _, mod_edges = aggregate_edges(symbols, FILE_CONTENTS)
    key = ("myrepo::auth.service", "myrepo::database.repo")
    assert key in mod_edges
    assert mod_edges[key]["weight"] >= 2  # login→find_user + register→create_user

def test_skips_same_module_calls():
    symbols = _make_symbols()
    func_edges, _ = aggregate_edges(symbols, FILE_CONTENTS)
    # find_user calling query — both in database.repo, should not appear
    sources = {(e.source, e.target) for e in func_edges}
    for s, t in sources:
        assert not (s.startswith("myrepo::database") and t.startswith("myrepo::database"))

def test_skips_common_names_without_import():
    symbols = [
        SymbolEntry(
            qualified_name="myrepo::auth.service::handler",
            kind="function", signature="handler()",
            file="src/auth/service.py", line=1,
            calls=["get", "run", "find_user"],  # get/run are common names
        ),
        SymbolEntry(
            qualified_name="myrepo::database.repo::find_user",
            kind="function", signature="find_user(email)",
            file="src/database/repo.py", line=1,
            calls=[],
        ),
    ]
    func_edges, _ = aggregate_edges(symbols, FILE_CONTENTS)
    targets = {e.target for e in func_edges}
    # find_user should resolve, but get/run should not create edges
    assert any("find_user" in t for t in targets)
    assert not any("get" in t or "run" in t for t in targets)
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/test_graph_aggregator.py -v`
Expected: FAIL

**Step 3: Write minimal implementation**

```python
# src/codespace/graph_aggregator.py
"""Resolve bare call names to qualified edges, aggregate to module level."""
from collections import defaultdict
from dataclasses import dataclass, field
from codespace.symbols import SymbolEntry
from codespace.imports import parse_imports

COMMON_NAMES = frozenset({
    "get", "set", "run", "create", "update", "delete", "init",
    "open", "close", "read", "write", "start", "stop", "join",
    "append", "extend", "pop", "keys", "values", "items",
    "format", "strip", "split", "replace", "lower", "upper",
    "print", "len", "str", "int", "float", "bool", "list", "dict",
    "isinstance", "hasattr", "getattr", "setattr",
})

@dataclass
class ResolvedEdge:
    source: str  # qualified name
    target: str  # qualified name
    type: str = "call"
    confidence: str = "high"  # "high" | "medium" | "low"

def _extract_module(qname: str) -> str:
    """'repo::auth.service::login' → 'repo::auth.service'"""
    parts = qname.split("::")
    return "::".join(parts[:2]) if len(parts) >= 2 else qname

def _bare_name(qname: str) -> str:
    """'repo::auth.service::AuthService.login' → 'login'"""
    return qname.split("::")[-1].split(".")[-1]

def aggregate_edges(
    symbols: list[SymbolEntry],
    file_contents: dict[str, str],
) -> tuple[list[ResolvedEdge], dict[tuple[str, str], dict]]:
    """Resolve calls to qualified edges, aggregate to module level.

    Returns: (function_edges, module_edges)
    """
    # Step 1: Build lookup index
    name_to_qualified: dict[str, list[str]] = defaultdict(list)
    for sym in symbols:
        bare = _bare_name(sym.qualified_name)
        name_to_qualified[bare].append(sym.qualified_name)

    # Cache parsed imports per file
    import_cache: dict[str, dict[str, str]] = {}
    def get_imports(file_path: str) -> dict[str, str]:
        if file_path not in import_cache:
            source = file_contents.get(file_path, "")
            import_cache[file_path] = parse_imports(source)
        return import_cache[file_path]

    # Step 2: Resolve calls to qualified edges
    func_edges: list[ResolvedEdge] = []

    for sym in symbols:
        caller_module = _extract_module(sym.qualified_name)
        caller_imports = get_imports(sym.file)

        for call_name in sym.calls:
            # Skip common names unless import-aware
            if call_name in COMMON_NAMES and call_name not in caller_imports:
                continue

            candidates = name_to_qualified.get(call_name, [])
            if not candidates:
                continue

            resolved = _resolve(candidates, caller_module, caller_imports)
            for target_qname, confidence in resolved:
                target_module = _extract_module(target_qname)
                if caller_module != target_module:
                    func_edges.append(ResolvedEdge(
                        source=sym.qualified_name,
                        target=target_qname,
                        confidence=confidence,
                    ))

    # Step 3: Aggregate to module level
    module_edges: dict[tuple[str, str], dict] = defaultdict(
        lambda: {"weight": 0, "children": []}
    )
    for edge in func_edges:
        key = (_extract_module(edge.source), _extract_module(edge.target))
        module_edges[key]["weight"] += 1
        module_edges[key]["children"].append(
            f"{_bare_name(edge.source)}→{_bare_name(edge.target)}"
        )

    return func_edges, dict(module_edges)

def _resolve(
    candidates: list[str],
    caller_module: str,
    caller_imports: dict[str, str],
) -> list[tuple[str, str]]:
    """Resolve candidates with priority: import > same-module > unique > ambiguous."""
    call_name = _bare_name(candidates[0])

    # Priority 1: Import-aware
    if call_name in caller_imports:
        import_module = caller_imports[call_name]
        for c in candidates:
            module_part = c.split("::")[1] if "::" in c else ""
            if import_module.replace(".", ".") in module_part.replace(".", "."):
                return [(c, "high")]
        # Import found but no candidate matches — still use import as hint
        # Pick candidate whose module path has the most overlap
        best = max(candidates, key=lambda c: _module_overlap(c, import_module))
        return [(best, "high")]

    # Priority 2: Same module (shouldn't reach here since we filter same-module edges,
    # but handle for completeness)
    same = [c for c in candidates if _extract_module(c) == caller_module]
    if len(same) == 1:
        return [(same[0], "high")]

    # Priority 3: Unique in repo
    non_same = [c for c in candidates if _extract_module(c) != caller_module]
    if len(non_same) == 1:
        return [(non_same[0], "medium")]

    # Priority 4: Ambiguous
    if len(non_same) > 1:
        return [(c, "low") for c in non_same]

    return []

def _module_overlap(qname: str, import_path: str) -> int:
    """Score how well a qualified name matches an import path."""
    module_part = qname.split("::")[1] if "::" in qname else ""
    import_clean = import_path.lstrip(".")
    parts_m = module_part.split(".")
    parts_i = import_clean.split(".")
    overlap = 0
    for a, b in zip(parts_m, parts_i):
        if a == b:
            overlap += 1
        else:
            break
    return overlap
```

**Step 4: Run test to verify it passes**

Run: `pytest tests/test_graph_aggregator.py -v`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add src/codespace/graph_aggregator.py tests/test_graph_aggregator.py
git commit -m "feat: graph aggregator — resolve calls to qualified edges with import-aware resolution"
```

---

### Task 6: Cluster Formation

**Files:**
- Create: `src/codespace/clusters.py`
- Create: `tests/test_clusters.py`

**Reference:** DESIGN.md Section 4.1

**Step 1: Write the failing test**

```python
# tests/test_clusters.py
from codespace.clusters import form_clusters, Cluster
from codespace.indexer import Module, IndexedFile
from codespace.symbols import SymbolEntry

def _make_module(name, path, n_files=3):
    files = [IndexedFile(f"{path}/f{i}.py", f"/abs/{path}/f{i}.py", "x=1", 10, 1)
             for i in range(n_files)]
    return Module(name=name, path=path, files=files)

def test_basic_cluster_formation():
    modules = [_make_module("auth", "src/auth"), _make_module("db", "src/db")]
    clusters = form_clusters(modules, [], "myrepo")
    assert len(clusters) == 2
    names = {c.name for c in clusters}
    assert "auth" in names and "db" in names

def test_cluster_has_parent_repo():
    modules = [_make_module("auth", "src/auth")]
    clusters = form_clusters(modules, [], "myrepo")
    assert clusters[0].parent_id == "myrepo"

def test_cluster_id_format():
    modules = [_make_module("auth", "src/auth")]
    clusters = form_clusters(modules, [], "myrepo")
    assert clusters[0].id == "myrepo::src.auth"
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/test_clusters.py -v`
Expected: FAIL

**Step 3: Write minimal implementation**

```python
# src/codespace/clusters.py
"""Cluster formation: modules → visual clusters."""
from dataclasses import dataclass, field
from codespace.indexer import Module
from codespace.symbols import SymbolEntry

@dataclass
class Cluster:
    id: str           # "myrepo::src.auth"
    name: str         # "auth"
    path: str         # "src/auth"
    parent_id: str    # "myrepo"
    file_count: int = 0
    symbol_count: int = 0
    semantic_label: str = ""  # LLM-generated, filled later

def form_clusters(
    modules: list[Module],
    symbols: list[SymbolEntry],
    repo_name: str,
) -> list[Cluster]:
    """Convert modules to clusters. Modules already handle merge-small via indexer."""
    # Count symbols per module
    module_symbol_count: dict[str, int] = {}
    for sym in symbols:
        parts = sym.qualified_name.split("::")
        if len(parts) >= 2:
            mod_key = f"{parts[0]}::{parts[1]}"
            module_symbol_count[mod_key] = module_symbol_count.get(mod_key, 0) + 1

    clusters = []
    for mod in modules:
        cluster_id = f"{repo_name}::{mod.slug}"
        clusters.append(Cluster(
            id=cluster_id,
            name=mod.name,
            path=mod.path,
            parent_id=repo_name,
            file_count=len(mod.files),
            symbol_count=module_symbol_count.get(cluster_id, 0),
        ))

    return clusters
```

**Step 4: Run test to verify it passes**

Run: `pytest tests/test_clusters.py -v`
Expected: All 3 tests PASS

**Step 5: Commit**

```bash
git add src/codespace/clusters.py tests/test_clusters.py
git commit -m "feat: cluster formation — modules to visual clusters"
```

---

### Task 7: Cluster Namer (LLM)

**Files:**
- Create: `src/codespace/llm.py`
- Create: `src/codespace/cluster_namer.py`
- Create: `tests/test_cluster_namer.py`

**Reference:** DESIGN.md Section 4.2, 7.1

**Step 1: Write the failing test**

```python
# tests/test_cluster_namer.py
from codespace.cluster_namer import name_clusters, _build_naming_prompt
from codespace.clusters import Cluster

def test_build_naming_prompt():
    cluster = Cluster(id="r::auth", name="auth", path="src/auth", parent_id="r",
                      file_count=3, symbol_count=10)
    symbols_summary = "login(), register(), verify_token(), hash_password()"
    prompt = _build_naming_prompt(cluster, symbols_summary)
    assert "auth" in prompt
    assert "login" in prompt

def test_name_clusters_without_llm():
    """Without LLM, falls back to directory name."""
    clusters = [Cluster(id="r::auth", name="auth", path="src/auth", parent_id="r")]
    name_clusters(clusters, {}, llm_client=None)
    assert clusters[0].semantic_label == "auth"  # fallback
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/test_cluster_namer.py -v`
Expected: FAIL

**Step 3: Write minimal implementation**

```python
# src/codespace/llm.py
"""LLM client abstraction — supports Anthropic, OpenAI, or None."""
from dataclasses import dataclass

@dataclass
class LLMClient:
    provider: str  # "anthropic" | "openai" | "none"
    api_key: str = ""
    model: str = ""

    def complete(self, prompt: str, max_tokens: int = 100) -> str:
        if self.provider == "none":
            return ""
        if self.provider == "anthropic":
            import anthropic
            client = anthropic.Anthropic(api_key=self.api_key)
            resp = client.messages.create(
                model=self.model or "claude-sonnet-4-5-20250929",
                max_tokens=max_tokens,
                messages=[{"role": "user", "content": prompt}],
            )
            return resp.content[0].text
        if self.provider == "openai":
            import openai
            client = openai.OpenAI(api_key=self.api_key)
            resp = client.chat.completions.create(
                model=self.model or "gpt-4o-mini",
                max_tokens=max_tokens,
                messages=[{"role": "user", "content": prompt}],
            )
            return resp.choices[0].message.content or ""
        return ""
```

```python
# src/codespace/cluster_namer.py
"""Generate semantic names for clusters using LLM."""
from codespace.clusters import Cluster
from codespace.llm import LLMClient
from codespace.symbols import SymbolEntry

def _build_naming_prompt(cluster: Cluster, symbols_summary: str) -> str:
    return (
        f"This code module is at path '{cluster.path}' with directory name '{cluster.name}'.\n"
        f"It contains these symbols: {symbols_summary}\n\n"
        f"Give a 1-3 word semantic name describing what this module does. "
        f"Examples: 'Authentication', 'Data Persistence', 'API Gateway', 'Payment Processing'.\n"
        f"Reply with ONLY the name, nothing else."
    )

def _get_symbols_for_cluster(cluster: Cluster, symbols: list[SymbolEntry]) -> str:
    """Get a summary of symbols belonging to this cluster."""
    prefix = cluster.id.replace(cluster.parent_id + "::", "")
    matching = [s for s in symbols if prefix in s.qualified_name]
    names = [s.qualified_name.split("::")[-1] for s in matching[:15]]
    return ", ".join(names) if names else cluster.name

def name_clusters(
    clusters: list[Cluster],
    symbols_by_module: dict[str, list[SymbolEntry]],
    llm_client: LLMClient | None = None,
) -> None:
    """Populate semantic_label for each cluster (mutates in place)."""
    for cluster in clusters:
        if llm_client and llm_client.provider != "none":
            syms = symbols_by_module.get(cluster.id, [])
            summary = ", ".join(s.qualified_name.split("::")[-1] for s in syms[:15])
            prompt = _build_naming_prompt(cluster, summary or cluster.name)
            try:
                label = llm_client.complete(prompt, max_tokens=20).strip().strip('"\'')
                cluster.semantic_label = label if label else cluster.name
            except Exception:
                cluster.semantic_label = cluster.name
        else:
            cluster.semantic_label = cluster.name
```

**Step 4: Run test to verify it passes**

Run: `pytest tests/test_cluster_namer.py -v`
Expected: All 2 tests PASS

**Step 5: Commit**

```bash
git add src/codespace/llm.py src/codespace/cluster_namer.py tests/test_cluster_namer.py
git commit -m "feat: cluster namer — LLM semantic naming with fallback"
```

---

### Task 8: Codespace Export — Assemble codespace_graph.json

**Files:**
- Create: `src/codespace/export.py`
- Create: `tests/test_export.py`

**Reference:** DESIGN.md Section 9 (full schema)

**Step 1: Write the failing test**

```python
# tests/test_export.py
import json
from codespace.export import build_codespace_graph
from codespace.clusters import Cluster
from codespace.symbols import SymbolEntry
from codespace.graph_aggregator import ResolvedEdge

def test_export_structure():
    clusters = [Cluster(id="r::auth", name="auth", path="src/auth",
                        parent_id="r", semantic_label="Authentication")]
    symbols = [SymbolEntry(
        qualified_name="r::auth.service::login", kind="function",
        signature="login(email, password)", file="src/auth/service.py",
        line=42, docstring="Login user.", calls=["find_user"],
    )]
    func_edges = [ResolvedEdge(source="r::auth.service::login",
                                target="r::db.repo::find_user", confidence="high")]
    mod_edges = {("r::auth.service", "r::db.repo"): {"weight": 1, "children": ["login→find_user"]}}

    graph = build_codespace_graph("myrepo", clusters, symbols, func_edges, mod_edges)

    assert "metadata" in graph
    assert "nodes" in graph
    assert "edges" in graph
    assert graph["metadata"]["repos"] == ["myrepo"]

def test_export_has_all_node_types():
    clusters = [Cluster(id="r::auth", name="auth", path="src/auth",
                        parent_id="r", semantic_label="Auth")]
    symbols = [SymbolEntry(
        qualified_name="r::auth.service::login", kind="function",
        signature="login()", file="f.py", line=1,
    )]
    graph = build_codespace_graph("r", clusters, symbols, [], {})
    types = {n["type"] for n in graph["nodes"]}
    assert "repo" in types
    assert "module" in types
    assert "function" in types

def test_export_valid_json():
    clusters = [Cluster(id="r::m", name="m", path="src/m", parent_id="r")]
    graph = build_codespace_graph("r", clusters, [], [], {})
    # Should be JSON-serializable
    json.dumps(graph)
```

**Step 2: Run test to verify it fails**

Run: `pytest tests/test_export.py -v`
Expected: FAIL

**Step 3: Write minimal implementation**

```python
# src/codespace/export.py
"""Export codespace_graph.json for G6 frontend."""
from datetime import datetime, timezone
from codespace.clusters import Cluster
from codespace.symbols import SymbolEntry
from codespace.graph_aggregator import ResolvedEdge

def build_codespace_graph(
    repo_name: str,
    clusters: list[Cluster],
    symbols: list[SymbolEntry],
    func_edges: list[ResolvedEdge],
    mod_edges: dict[tuple[str, str], dict],
    global_context: str = "",
) -> dict:
    """Assemble the full codespace_graph.json structure."""
    nodes = []
    edges = []

    # Repo node
    nodes.append({
        "id": repo_name,
        "type": "repo",
        "label": repo_name,
        "semantic_label": repo_name,
        "parent": None,
        "repo": repo_name,
        "summary_l1": None,
    })

    # Cluster (module) nodes
    for cluster in clusters:
        nodes.append({
            "id": cluster.id,
            "type": "module",
            "label": cluster.name,
            "semantic_label": cluster.semantic_label,
            "parent": cluster.parent_id,
            "repo": repo_name,
            "path": cluster.path,
            "file_count": cluster.file_count,
            "symbol_count": cluster.symbol_count,
            "summary_l1": None,
        })

    # Symbol (function/class) nodes
    for sym in symbols:
        parts = sym.qualified_name.split("::")
        parent_module = f"{parts[0]}::{parts[1]}" if len(parts) >= 2 else repo_name
        nodes.append({
            "id": sym.qualified_name,
            "type": sym.kind if sym.kind in ("class",) else "function",
            "label": sym.signature or sym.qualified_name.split("::")[-1],
            "semantic_label": None,
            "parent": parent_module,
            "repo": repo_name,
            "file": sym.file,
            "line": sym.line,
            "signature": sym.signature,
            "docstring": sym.docstring,
            "class_name": sym.metadata_class_name,
            "calls": sym.calls,
            "called_by": sym.called_by,
            "summary_l1": None,
        })

    # Module-level edges
    for (src_mod, tgt_mod), data in mod_edges.items():
        edges.append({
            "source": src_mod,
            "target": tgt_mod,
            "type": "call",
            "weight": data["weight"],
            "children_edges": data["children"],
        })

    # Function-level edges
    for e in func_edges:
        edges.append({
            "source": e.source,
            "target": e.target,
            "type": e.type,
            "weight": 1,
            "confidence": e.confidence,
        })

    return {
        "metadata": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "repos": [repo_name],
            "stats": {
                "repos": 1,
                "modules": len(clusters),
                "functions": sum(1 for s in symbols if s.kind != "class"),
                "classes": sum(1 for s in symbols if s.kind == "class"),
                "edges": len(edges),
            },
        },
        "global_context": global_context,
        "nodes": nodes,
        "edges": edges,
    }
```

**Step 4: Run test to verify it passes**

Run: `pytest tests/test_export.py -v`
Expected: All 3 tests PASS

**Step 5: Commit**

```bash
git add src/codespace/export.py tests/test_export.py
git commit -m "feat: codespace export — assemble codespace_graph.json"
```

---

### Task 9: G6 Graph Shell — Load JSON + Render Basic Graph

**Files:**
- Create: `frontend/src/components/GraphView.tsx`
- Create: `frontend/src/store.ts`
- Modify: `frontend/src/App.tsx`
- Create: `frontend/public/sample_graph.json` (test fixture)

**Step 1: Create sample graph JSON fixture**

Create `frontend/public/sample_graph.json` with 3 modules, 8 functions, ~10 edges. Use the schema from DESIGN.md Section 9 but with realistic test data.

**Step 2: Build Zustand store**

```typescript
// frontend/src/store.ts
import { create } from 'zustand'

interface CodespaceGraph {
  metadata: { repos: string[]; stats: Record<string, number> }
  global_context: string
  nodes: GraphNode[]
  edges: GraphEdge[]
}

interface GraphNode {
  id: string
  type: 'repo' | 'module' | 'class' | 'function'
  label: string
  semantic_label: string | null
  parent: string | null
  repo: string
  summary_l1: string | null
  [key: string]: unknown
}

interface GraphEdge {
  source: string
  target: string
  type: string
  weight: number
  [key: string]: unknown
}

interface AppState {
  graph: CodespaceGraph | null
  selectedNodeId: string | null
  zoomLevel: 'repo' | 'module' | 'function'
  expandedClusters: Set<string>
  setGraph: (g: CodespaceGraph) => void
  selectNode: (id: string | null) => void
  setZoomLevel: (level: 'repo' | 'module' | 'function') => void
  toggleCluster: (id: string) => void
}

export const useStore = create<AppState>((set) => ({
  graph: null,
  selectedNodeId: null,
  zoomLevel: 'module',
  expandedClusters: new Set(),
  setGraph: (graph) => set({ graph }),
  selectNode: (id) => set({ selectedNodeId: id }),
  setZoomLevel: (level) => set({ zoomLevel: level }),
  toggleCluster: (id) => set((state) => {
    const next = new Set(state.expandedClusters)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return { expandedClusters: next }
  }),
}))

export type { CodespaceGraph, GraphNode, GraphEdge }
```

**Step 3: Build GraphView component with G6**

```typescript
// frontend/src/components/GraphView.tsx
import { useEffect, useRef } from 'react'
import { Graph } from '@antv/g6'
import { useStore } from '../store'

export function GraphView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<Graph | null>(null)
  const { graph: data, zoomLevel, selectNode } = useStore()

  useEffect(() => {
    if (!containerRef.current || !data) return

    const g6Graph = new Graph({
      container: containerRef.current,
      autoFit: 'view',
      data: transformData(data, zoomLevel),
      node: {
        style: {
          size: 30,
          labelText: (d: any) => d.data?.label || d.id,
        },
      },
      edge: {
        style: {
          lineWidth: (d: any) => Math.min((d.data?.weight || 1) * 2, 8),
        },
      },
      layout: {
        type: 'combo-combined',
        outerLayout: { type: 'force' },
        innerLayout: { type: 'force' },
      },
      behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element'],
      plugins: [{ type: 'minimap', size: [200, 150] }],
    })

    g6Graph.on('node:click', (evt: any) => {
      selectNode(evt.target?.id || null)
    })

    g6Graph.render()
    graphRef.current = g6Graph

    return () => { g6Graph.destroy() }
  }, [data, zoomLevel])

  return <div ref={containerRef} className="w-full h-full" />
}

function transformData(data: any, zoomLevel: string) {
  // Filter nodes and edges based on zoom level
  const typeFilter = zoomLevel === 'repo' ? ['repo']
    : zoomLevel === 'module' ? ['repo', 'module']
    : ['repo', 'module', 'function']

  const visibleNodes = data.nodes
    .filter((n: any) => typeFilter.includes(n.type))
    .map((n: any) => ({
      id: n.id,
      data: { ...n },
      combo: n.type !== 'repo' ? n.parent : undefined,
    }))

  const visibleIds = new Set(visibleNodes.map((n: any) => n.id))

  const visibleEdges = data.edges
    .filter((e: any) => visibleIds.has(e.source) && visibleIds.has(e.target))
    .map((e: any, i: number) => ({
      id: `edge-${i}`,
      source: e.source,
      target: e.target,
      data: { ...e },
    }))

  // Create combos from repo nodes (for module grouping)
  const combos = data.nodes
    .filter((n: any) => n.type === 'repo')
    .map((n: any) => ({ id: n.id, data: { label: n.label } }))

  return { nodes: visibleNodes, edges: visibleEdges, combos }
}
```

**Step 4: Wire up App.tsx**

```typescript
// frontend/src/App.tsx
import { useEffect } from 'react'
import { GraphView } from './components/GraphView'
import { useStore } from './store'

function App() {
  const setGraph = useStore((s) => s.setGraph)

  useEffect(() => {
    fetch('/sample_graph.json')
      .then((r) => r.json())
      .then(setGraph)
  }, [])

  return (
    <div className="h-screen w-screen bg-gray-950 text-white flex">
      <div className="flex-1">
        <GraphView />
      </div>
    </div>
  )
}

export default App
```

**Step 5: Verify graph renders**

Run: `cd frontend && npm run dev`
Open browser, confirm graph renders with nodes and edges. Drag and zoom work.

**Step 6: Commit**

```bash
git add frontend/src/ frontend/public/sample_graph.json
git commit -m "feat: G6 graph shell — load JSON, render basic graph with combo layout"
```

---

### Task 10-17: Frontend Feature Tasks

Each subsequent task follows the same TDD pattern. Summary:

| Task | What | Key G6 Feature |
|---|---|---|
| **10** | Combo layout + compound nodes (cluster backgrounds) | `combo-combined` layout, combo styling |
| **11** | Zoom level switching + double-click expand | `zoomLevel` state, `node:dblclick` handler, `transformData` filter |
| **12** | Color system (repo domain, module hue, type brightness) | Node `style.fill` computed from `repo` + `type` |
| **13** | Side panel (click node → show summary) | `<SidePanel>` React component, reads `selectedNodeId` from store |
| **14** | Search bar + fly-to | Fuse.js fuzzy search, `g6Graph.focusElement(id)` |
| **15** | On-demand LLM explanations | Browser-side `fetch()` to Anthropic/OpenAI API, cache in store |
| **16** | Minimap + edge thickness + hover tooltips | G6 minimap plugin (already added), tooltip plugin |
| **17** | Static deploy config | `vite build`, output to `dist/`, Vercel/GH Pages config |

Each task has 5 steps: write test → run fail → implement → run pass → commit.

Detailed step-by-step code for Tasks 10-17 is omitted for brevity but follows identical patterns to Tasks 1-9. Each task is self-contained and independently testable.

---

## End-to-End Integration Test

After all tasks, run the full pipeline on a real repo:

```bash
# Generate graph from a Python repo
codespace /path/to/your/python/repo -o frontend/public/codespace_graph.json --llm-provider anthropic --llm-api-key $ANTHROPIC_API_KEY

# Serve frontend
cd frontend && npm run dev

# Open browser → see clustered graph with semantic names
```

---

## Risk Mitigation

| Risk | Mitigation | Task |
|---|---|---|
| Call resolution produces garbage edges | Test with real repo in Task 5, tune COMMON_NAMES list | Task 5 |
| G6 v5 combo layout doesn't work as expected | Spike in Task 9 before building full UI. Fallback: dagre layout | Task 9-10 |
| LLM naming quality inconsistent | Fallback to directory name. Prompt tuning in Task 7 | Task 7 |
| Performance at 1000+ nodes | Test with large fixture in Task 10. G6 Canvas/WebGL handles 10K+ | Task 10 |

# Codespace — Product & Technical Design

> Status: Draft v2 (2026-03-21) — Post-review revision
> Origin: codewiki/wisewiki + dcap-code-wiki design foundation
> Core thesis: Google Earth for Code — fractal cluster graph with multi-repo cross-dependency visualization

---

## 0. Review Resolutions (v2)

### C1: Method parent chain in MVP

In MVP (no Class zoom level), all functions including class methods are parented directly to the module node. Class membership is stored in `metadata.class_name` but does not create a hierarchy node.

```
MVP:      module → function (methods flattened)
Phase 2:  module → class → method (class nodes introduced)
```

Transition plan: When Class zoom is added in Phase 2, functions with `metadata.class_name` are re-parented under their class node. No schema migration needed — only the `parent` field value changes.

### C2: Call resolution strategy for graph_aggregator

The `calls` field in symbols.json contains bare function names (e.g., `find_user`), not qualified paths. The `graph_aggregator.py` must resolve these to qualified names.

**Resolution algorithm (priority order):**

1. **Same-module match**: If `find_user` exists in the same module → resolve to that qualified name
2. **Import-aware match**: Parse the file's `import` statements to narrow candidates (e.g., `from database.repo import find_user` → resolve to `database.repo::find_user`)
3. **Same-repo match**: If exactly one `find_user` exists in the repo → resolve
4. **Ambiguous**: If multiple candidates remain → create edge to ALL candidates with `confidence: "low"` flag. Frontend renders low-confidence edges as dashed lines.
5. **Unresolvable**: If no candidate found (external library call) → skip, do not create edge

**Noise filtering**: Common names (`get`, `set`, `run`, `create`, `update`, `delete`, `init`, `__init__`) are excluded from cross-module edge resolution unless import-aware match succeeds.

This algorithm is MVP-sufficient. Phase 2 improvement: type inference using Python type stubs / mypy data for higher accuracy.

### C3: Cross-repo edges are L0/L1 only

Cross-repo edges from `cross_repo_graph.json` exist at repo level (L0) and can be projected to module level (L1) using the `from_file` field to identify the source module. **Function-level cross-repo edges (L2+) are not supported.** This is acceptable because:

- The user sees repo-level coupling at L0, module-level at L1
- Drilling into functions within a single repo still shows full call graphs
- Function-level cross-repo resolution would require simultaneous AST analysis of multiple repos — deferred to Phase 3

### I2: Zoom model clarification

The zoom model is **hybrid**, not purely global:

- **Scroll zoom** controls the **default granularity** for all nodes
- **Double-click** expands a single cluster **one level deeper** than the default
- Other clusters remain at the default level
- This means the view can be **mixed-level** (e.g., Auth expanded to functions while Database stays at module level)
- Breadcrumb shows which clusters are expanded beyond default

This matches the "discrete expand" interaction we designed and is standard in graph tools with compound nodes.

---

## 1. Product Vision

Users input GitHub repos + LLM API key → system generates an interactive 2D code graph panorama.

- First impression: clustered island-style architecture overview, not a hairball
- Core interaction: global zoom controls granularity level, double-click expands clusters
- Killer feature: cross-repo dependency visualization — no competitor does this
- Side panel: LLM-generated structured explanations at every granularity level

### Target Users

| User | Pain Point | Codespace Value |
|------|-----------|-----------------|
| New team member | 200K LOC codebase, where to start? | 360° architecture map with plain-English explanations |
| Tech lead | Cross-repo coupling blind spots | Visual blast radius — see which repos are tightly coupled |
| PM / Designer | Can't read code but needs to understand system | Click any node, get LLM explanation |

### Competitive Positioning

| | CodeGraphContext | Understand-Anything | Google Code Wiki | **Codespace** |
|---|---|---|---|---|
| Graph type | Flat 2D | Flat 2D | No graph | **Cluster + fractal zoom** |
| Multi-repo | No | No | No (treats repos independently) | **Yes — cross-repo edges** |
| Node granularity | function/class flat | file/function flat | N/A | **Zoom-controlled: Repo→Module→Class→Function** |
| LLM explanations | No | Yes | Yes | **Yes, structured & hierarchical** |

---

## 2. Information Architecture

### 2.1 Zoom Levels (Global, Unified)

Zoom is global — all nodes on screen are at the same granularity level. No mixed-level views.

```
Zoom Level 0 — Repo view
  [Repo A] ━━━ [Repo B] ━━━ [Repo C]

Zoom Level 1 — Module view (all repos expand simultaneously)
  ○ auth ━━ ○ api-gw ━━ ○ db-module ━━ ○ queue
  (Repo A)               (Repo B)        (Repo C)

Zoom Level 2 — Class view
  ● AuthService ━━ ● UserRepo ━━ ● RedisClient

Zoom Level 3 — Function view
  ○ login() ── ○ find_user() ── ○ get_token()

Zoom Level 4 — Parameter view (deepest)
  ◇ email: str ── ◇ password: str
```

### 2.2 Scope ↔ dcap-code-wiki Mapping

| Zoom Level | Scope | Data Source (dcap-code-wiki) |
|---|---|---|
| L0 Repo | Repo | repos.toml + overview.md + cross_repo_graph.json |
| L1 Module | Module | indexer (directory=module) + modules/*.md |
| L2 Class | Symbol (class) | symbols.json (kind=class) |
| L3 Function | Symbol (function) | symbols.json (kind=function, calls/called_by) |
| L4 Parameter | Sub-symbol | AST extraction (Phase 2) |

### 2.3 Tier ↔ Side Panel Mapping

| Tier | Tokens | UI Location |
|---|---|---|
| L0 (~20 tok) | Title only | Node label on graph |
| L1 (~200 tok) | Summary + sections + key_facts | Side panel summary |
| L2 (~500 tok) | Full structured wiki | "View full wiki" page |

---

## 3. Graph Data Model

### 3.1 Node Types

All nodes stored at finest granularity. Display granularity controlled by zoom level.

```
Node {
  id: string              // qualified_name: "repoA::auth.service::login"
  type: "repo" | "module" | "class" | "function" | "parameter"
  label: string           // display name: "login()"
  semantic_label: string  // LLM-generated: "User Authentication Entry Point"
  parent: string          // parent node id (MVP: functions parent to module, not class)
  repo: string            // which repo this belongs to
  metadata: {
    file: string
    line: number
    signature: string
    docstring: string
    class_name: string    // for methods: owning class name (used in Phase 2 re-parenting)
  }
}
```

### 3.2 Edge Types

Edges always connect nodes at the same zoom level. Stored at finest granularity, aggregated at display time.

```
Edge {
  source: string          // node id
  target: string          // node id
  type: "call" | "import" | "inheritance" | "ci_uses" | "git_submodule" | "pkg_dep"
  weight: number          // aggregated call count (for edge thickness)
  metadata: {
    from_file: string
    to_package: string
    imported_names: string[]
  }
}
```

#### Edge types by zoom level

| Zoom Level | Edge Types Available | Source |
|---|---|---|
| L0 Repo | python_import, ci_uses, git_submodule, pkg_dep | cross_repo_graph.json |
| L1 Module | call aggregation (derived from symbol calls) | symbols.json aggregation |
| L2 Class | inheritance, composition (Phase 2) | AST extraction |
| L3 Function | calls/called_by | symbols.json |
| L4 Parameter | type reference (Phase 2) | AST extraction |

#### Edge aggregation rule

At any zoom level, edges between two nodes = aggregation of all finer-grained edges between their children.

```
Example: Auth module → DB module edge
  = login() → find_user()
  + login() → create_session()
  + register() → create_user()
  + verify_token() → get_token_record()
  weight = 4 (4 function-level calls)
```

#### Cross-repo edge level constraint

Cross-repo edges exist at **L0 (repo) and L1 (module) only**. Function-level cross-repo edges are not supported (see Section 0, C3 resolution).

### 3.4 graph_aggregator Algorithm

The `graph_aggregator.py` component resolves bare call names from `symbols.json` into qualified edges.

```python
# Pseudocode
def aggregate(symbols_json, repo_name):
    # Step 1: Build lookup index
    name_to_qualified = defaultdict(list)  # "find_user" → ["repo::db.repo::find_user"]
    for qname, sym in symbols.items():
        bare_name = qname.split("::")[-1].split(".")[-1]
        name_to_qualified[bare_name].append(qname)

    # Step 2: For each symbol, resolve its calls to qualified edges
    edges = []
    for caller_qname, sym in symbols.items():
        caller_module = extract_module(caller_qname)
        caller_imports = parse_imports(sym.file)  # file-level import statements

        for call_name in sym.calls:
            if call_name in COMMON_NAMES and call_name not in caller_imports:
                continue  # skip noise

            candidates = name_to_qualified.get(call_name, [])
            resolved = resolve(candidates, caller_module, caller_imports)

            for target_qname, confidence in resolved:
                target_module = extract_module(target_qname)
                if caller_module != target_module:  # only cross-module edges
                    edges.append(Edge(
                        source=caller_qname,
                        target=target_qname,
                        type="call",
                        confidence=confidence
                    ))

    # Step 3: Aggregate to module level
    module_edges = defaultdict(lambda: {"weight": 0, "children": []})
    for edge in edges:
        key = (extract_module(edge.source), extract_module(edge.target))
        module_edges[key]["weight"] += 1
        module_edges[key]["children"].append(f"{bare(edge.source)}→{bare(edge.target)}")

    return edges, module_edges

def resolve(candidates, caller_module, caller_imports):
    # Priority 1: Import-aware (highest confidence)
    for c in candidates:
        if c.module_path in caller_imports:
            return [(c, "high")]

    # Priority 2: Same module
    same_module = [c for c in candidates if extract_module(c) == caller_module]
    if len(same_module) == 1:
        return [(same_module[0], "high")]

    # Priority 3: Unique in repo
    if len(candidates) == 1:
        return [(candidates[0], "medium")]

    # Priority 4: Ambiguous
    if len(candidates) > 1:
        return [(c, "low") for c in candidates]

    return []  # unresolvable
```

### 3.5 Cross-repo Edge Schema (from dcap-code-wiki)

Directly reuse cross_repo_graph.json:

```json
{
  "edges": [
    {
      "from_repo": "cpl-modules",
      "to_repo": "dtech-common",
      "edge_type": "pkg_dep",
      "details": {"package": "dtechcommonspy", "version": "==0.18.5"}
    },
    {
      "from_repo": "cpl-modules",
      "to_repo": "cpldatasource",
      "edge_type": "python_import",
      "from_file": "src/cpletlcore/datasource.py",
      "to_package": "cpldatasource.datasource",
      "imported_names": ["DataSource"]
    }
  ]
}
```

---

## 4. Cluster Design

### 4.1 Cluster Formation

**Directory = Cluster (default)** with two corrections:

1. **Merge small**: directories with ≤ 2 files merge into parent cluster
2. **Split large**: clusters with > 15 symbols get sub-clustered by internal call relationships

### 4.2 Cluster Naming

- **Primary label**: LLM-generated semantic name ("Authentication", "Data Persistence")
- **Secondary label**: directory path (src/auth/)
- Pre-generated at index time for top-level clusters
- Sub-clusters named on-demand during drill-in

### 4.3 Cluster Layout

Two-level force layout:
1. **Inter-cluster**: force layout between cluster centroids (distance ∝ 1/edge_weight)
2. **Intra-cluster**: force layout within each cluster

Clusters with more cross-edges are positioned closer together.

### 4.4 Cluster Interaction

- **Double-click cluster**: expand in-place, reveal internal nodes with animation
- **Remaining clusters**: stay visible, auto-adjust spacing
- **Breadcrumb navigation**: track drill-in path for back-navigation

---

## 5. Visual Design

### 5.1 Color System

Three-layer encoding:

| Layer | Encodes | Method |
|---|---|---|
| Repo | Color temperature (warm/cool/neutral) | Repo A=cold blues, Repo B=warm greens, Repo C=oranges |
| Module | Hue within repo's color domain | 4-5 color cycle, adjacent clusters never same color (four-color theorem) |
| Node type | Brightness + shape | Deep=class ●, Medium=function ○, Light=config ◇ |

### 5.2 Edge Visual

| State | Style |
|---|---|
| Default (aggregated) | Solid line, thickness ∝ weight |
| Hover on aggregated edge | Fan out to show individual connections, tooltip: "Auth → DB: 4 calls, 3 functions" |
| Click on edge | Pin expanded view, side panel shows full call list |
| Cross-repo edge | Same style as intra-repo (no special treatment — distance conveys cross-repo) |
| Bidirectional dependency | Highlighted color (potential coupling issue) |

### 5.3 Navigation

- **Drag**: pan the viewport
- **Scroll**: zoom in/out (triggers level change at thresholds)
- **Double-click node**: expand cluster / show side panel
- **Minimap**: corner overlay showing full graph + current viewport position
- **Search**: fuzzy search → highlight + fly-to node
- **Cluster background**: colored regions persist at all zoom levels for spatial orientation

---

## 6. Side Panel Design

### 6.1 Cluster Level

```
┌─────────────────────────────────┐
│ 🏷 Authentication               │
│ src/auth/                       │
│                                 │
│ ## What                         │
│ Handles user auth and session   │
│ management. Contains login,     │
│ register, token verification.   │
│                                 │
│ ## Why                          │
│ Security boundary — all authed  │
│ requests pass through here.     │
│                                 │
│ ## Key Entry Points             │
│   → login()         47 callers  │
│   → verify_token()  89 callers  │
│                                 │
│ ## Dependencies                 │
│   → Database — user lookup      │
│   → Crypto — password hashing   │
│                                 │
│ ## Dependents                   │
│   ← API Gateway — all routes    │
│                                 │
│ [View full wiki →]              │
└─────────────────────────────────┘
```

### 6.2 Function Level

```
┌─────────────────────────────────┐
│ ● login(email, password)        │
│ src/auth/login.py:42            │
│                                 │
│ ## What                         │
│ Validates email/password, returns│
│ JWT on success.                 │
│                                 │
│ ## How                          │
│ 1. db.find_user() lookup        │
│ 2. crypto.verify_hash() check   │
│ 3. jwt.encode() generate token  │
│                                 │
│ ## Called by (3)                 │
│   → api.handle_login()      [↗] │
│   → test_auth.test_login()  [↗] │
│                                 │
│ ## Calls (3)                    │
│   → db.find_user()          [↗] │
│   → crypto.verify_hash()    [↗] │
│                                 │
│ ## Edge Cases                   │
│ · User not found → AuthError    │
│ · Wrong password → AuthError    │
│                                 │
│ [View full wiki →]              │
│ ▸ View source                   │
└─────────────────────────────────┘
```

`[↗]` = clickable, flies to that node on graph and highlights it.

---

## 7. LLM Integration

### 7.1 Two-Phase Generation

**Phase 1: Index time (user submits repo)**

| Task | LLM Calls | Input | Output | Cached |
|---|---|---|---|---|
| Global Context | 1 | All module names + symbol lists | ~500 tok architecture summary | Yes |
| Cluster naming | ~30 (batch) | Module file names + symbol lists | Semantic name per cluster | Yes |
| Cluster L1 summary | ~30 | Global Context + module symbols | ~200 tok structured summary | Yes |
| Class L1 summary | ~60 | Global Context + class source | ~200 tok structured summary | Yes |

Estimated: 2-3 minutes, < $1.00 for medium repo (500 files).

**Phase 2: On-demand (user drills in)**

| Task | LLM Calls | Input | Output | Latency |
|---|---|---|---|---|
| Function explanation | 1 per function | Global + Cluster + Class summaries + source + callers/callees signatures | Structured What/How/Edge Cases | ~1.5s |
| Parameter explanation | 1 per param | Function summary + type definition + caller usage | Type/range/error explanation | ~1s |
| Sub-cluster naming | 1 per sub-cluster | Parent cluster summary + child symbols | Semantic name | ~0.5s |

All results cached — second view is instant.

### 7.2 Hierarchical Context Chain

Each level inherits parent summaries (not source code) to maintain global understanding:

```
Global Context      ← 500 tokens (pre-generated)
  + Cluster Summary ← 200 tokens (pre-generated)
    + Class Summary ← 200 tokens (pre-generated)
      + Function Source + callers/callees signatures ← ~200 tokens
      ───────────────
      Total input: ~1100 tokens per function explanation
```

### 7.3 Full Wiki Page

"View full wiki" = assemble all child node summaries into one structured document:

```markdown
# Authentication Module
## Overview (Cluster summary)
## Classes
### AuthService (Class summary)
#### login(email, password) (Function explanation)
#### register(email, password, name)
...
```

Triggered on click. Generates any missing child explanations first (progress bar for large clusters).

---

## 8. Technical Architecture

### 8.1 System Overview

```
┌─── User Input ────────────────────────────────────┐
│  GitHub repo URL(s) + LLM API key                  │
└────────────────────┬──────────────────────────────┘
                     │
┌─── Backend (Python) ─────────────────────────────┐
│                    ▼                              │
│  ┌─ dcap-code-wiki pipeline (existing) ────────┐ │
│  │  Indexer → Symbol Extractor → Generator      │ │
│  │  → Writer → cross_repo_graph builder         │ │
│  └──────────────────────────────────────────────┘ │
│                    │                              │
│  ┌─ Codespace extensions (new) ────────────────┐ │
│  │  graph_aggregator.py  — module-level edges   │ │
│  │  cluster_namer.py     — LLM semantic names   │ │
│  │  context_chain.py     — hierarchical LLM ctx │ │
│  │  codespace_export.py  — G6 JSON export       │ │
│  └──────────────────────────────────────────────┘ │
│                    │                              │
│           codespace_graph.json                    │
└────────────────────┬──────────────────────────────┘
                     │
┌─── Frontend (TypeScript + G6) ───────────────────┐
│                    ▼                              │
│  ┌─ G6 Graph Engine ──────────────────────────┐  │
│  │  Combo layout (cluster-aware force)        │  │
│  │  Compound nodes (cluster backgrounds)      │  │
│  │  Edge bundling plugin                      │  │
│  │  Minimap plugin                            │  │
│  │  Canvas/WebGL rendering                    │  │
│  └────────────────────────────────────────────┘  │
│                                                   │
│  ┌─ UI Layer ─────────────────────────────────┐  │
│  │  Side panel (summary + wiki)               │  │
│  │  Search bar (fuzzy + fly-to)               │  │
│  │  Zoom level indicator                      │  │
│  │  Breadcrumb navigation                     │  │
│  │  Color legend                              │  │
│  └────────────────────────────────────────────┘  │
│                                                   │
│  ┌─ State Management ─────────────────────────┐  │
│  │  Current zoom level                        │  │
│  │  Expanded clusters                         │  │
│  │  Selected node                             │  │
│  │  Cached LLM explanations                   │  │
│  └────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────┘
```

### 8.2 Frontend Tech Stack

| Component | Technology | Rationale |
|---|---|---|
| Graph engine | **G6 v5 (AntV)** | Compound nodes + edge bundling + minimap + WASM layout + combo layout |
| Framework | React 19 | Component model for side panel, search, controls |
| State | Zustand | Lightweight, selective subscriptions |
| Build | Vite | Fast dev server, good ecosystem |
| Styling | TailwindCSS v4 | Rapid UI development |
| LLM calls | Direct API (fetch) | User provides their own API key, no backend proxy needed |

### 8.3 Backend Tech Stack

| Component | Technology | Rationale |
|---|---|---|
| Pipeline | **dcap-code-wiki** (Python) | Existing indexer + symbols + graph — reuse, don't rebuild |
| AST parsing | stdlib `ast` (Python), tree-sitter (Phase 2) | Zero deps for Python, multi-lang later |
| LLM backends | Anthropic / OpenAI / Bedrock / Ollama | User's choice |
| Output | Static JSON files | No server needed at runtime — pure client-side app |
| Hosting | Vercel / GitHub Pages / local | Static site, zero ops |

### 8.4 Data Pipeline

```
Input: GitHub repo URL(s)

Step 1: Clone repos
  git clone → local filesystem

Step 2: dcap-code-wiki pipeline (per repo)
  indexer.py        → list[Module]
  symbols.py        → symbols.json (calls/called_by)
  generator.py      → modules/*.md + cache.json (L0/L1/L2)
  repo_deps.py      → cross_repo_deps metadata

Step 3: Cross-repo graph (if multiple repos)
  graph.py          → cross_repo_graph.json

Step 4: Codespace extensions (new)
  graph_aggregator  → module_edges.json (derived from symbols.json)
  cluster_namer     → cluster_names.json (LLM semantic names)
  codespace_export  → codespace_graph.json (G6-ready format)

Step 5: Serve
  Static JSON + index.html → browser
  G6 renders graph from codespace_graph.json
  LLM calls happen client-side for on-demand explanations
```

---

## 9. codespace_graph.json Schema

The single JSON file that feeds the G6 frontend:

```json
{
  "metadata": {
    "generated_at": "2026-03-21T14:00:00",
    "repos": ["repo-a", "repo-b"],
    "stats": {
      "repos": 2,
      "modules": 30,
      "classes": 85,
      "functions": 520,
      "edges": 1240
    }
  },
  "global_context": "This is a Python microservice architecture with 2 repos...",
  "nodes": [
    {
      "id": "repo-a",
      "type": "repo",
      "label": "repo-a",
      "semantic_label": "Data Processing Service",
      "parent": null,
      "repo": "repo-a",
      "summary_l1": "FastAPI service that handles...",
      "wiki_path": "repos/repo-a/.overview.md"
    },
    {
      "id": "repo-a::auth",
      "type": "module",
      "label": "auth",
      "semantic_label": "Authentication",
      "parent": "repo-a",
      "repo": "repo-a",
      "color_hue": 210,
      "summary_l1": "Handles user authentication...",
      "wiki_path": "repos/repo-a/modules/auth.md"
    },
    {
      "id": "repo-a::auth.service::AuthService",
      "type": "class",
      "label": "AuthService",
      "semantic_label": null,
      "parent": "repo-a::auth",
      "repo": "repo-a",
      "summary_l1": null,
      "file": "src/auth/service.py",
      "line": 15
    },
    {
      "id": "repo-a::auth.service::login",
      "type": "function",
      "label": "login(email, password)",
      "semantic_label": null,
      "parent": "repo-a::auth",
      "repo": "repo-a",
      "summary_l1": null,
      "file": "src/auth/service.py",
      "line": 42,
      "signature": "login(email: str, password: str) -> str",
      "docstring": "Authenticate user and return JWT."
    }
  ],
  "edges": [
    {
      "source": "repo-a",
      "target": "repo-b",
      "type": "pkg_dep",
      "weight": 12,
      "details": "12 python_import + 3 ci_uses"
    },
    {
      "source": "repo-a::auth",
      "target": "repo-a::database",
      "type": "call",
      "weight": 8,
      "children_edges": ["login→find_user", "login→create_session", "register→create_user"]
    },
    {
      "source": "repo-a::auth.service::login",
      "target": "repo-b::database.repo::find_user",
      "type": "call",
      "weight": 1
    }
  ],
  "cluster_colors": {
    "repo-a": {"domain": "cold", "range": [200, 280]},
    "repo-b": {"domain": "warm", "range": [80, 160]}
  }
}
```

---

## 10. MVP Scope

### In MVP

- [ ] Single repo support (multi-repo = Phase 2)
- [ ] Python repos only (tree-sitter multi-lang = Phase 2)
- [ ] Zoom levels: Repo → Module → Function (Class level = Phase 2)
- [ ] Edges: calls/called_by only (import/inheritance = Phase 2)
- [ ] Cluster formation: directory = module
- [ ] Cluster naming: LLM semantic names
- [ ] Side panel: L1 summary (pre-generated) + on-demand L2 function explanation
- [ ] G6 rendering: combo layout + compound nodes + minimap
- [ ] Color system: repo color domain + module hue + type brightness
- [ ] Search: fuzzy name search + fly-to
- [ ] Static deployment (Vercel / GitHub Pages)

### Phase 2

- [ ] Multi-repo support + cross_repo_graph.json
- [ ] Cross-repo edges (python_import, ci_uses, git_submodule, pkg_dep)
- [ ] tree-sitter for TypeScript, Go, Java, Rust
- [ ] Class-level zoom (inheritance edges)
- [ ] Edge bundling for dense inter-cluster connections
- [ ] Import edges toggle
- [ ] Full wiki page generation

### Phase 3

- [ ] Parameter-level zoom
- [ ] Diff impact visualization (highlight changed nodes + blast radius)
- [ ] Live update (watch mode — re-index on git push)
- [ ] Collaborative annotations (team members tag nodes)
- [ ] Org-level view (multiple domains)

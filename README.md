# Codespace

**Google Earth for Code** — an interactive 2D code architecture visualizer that turns any Python repository into a navigable, zoomable cluster graph.

Drop in a repo path, get a force-directed graph panorama: modules as colored islands, functions as nodes, call relationships as edges. Zoom from 30,000 ft repo overview down to individual function signatures. No hairball — clean, clustered, explorable.

---

## Why Codespace

| Problem | How Codespace Solves It |
|---|---|
| New to a 200K LOC codebase — where do I start? | See the full architecture in one glance, click any node for AI explanation |
| Can't tell which modules are tightly coupled | Edge weight + community detection shows coupling visually |
| Test functions dominate the call graph | Graph-topology scoring auto-filters noise — no pattern matching |
| LLM context windows are expensive | Feed `codespace_graph.json` as MCP context — structured topology replaces raw source |
| Code wiki is always outdated | Auto-generated from live AST, not manually written |

---

## Key Differentiators

### 1. Fractal Zoom — Not a Flat Graph

Most code visualizers dump everything on one flat plane. Codespace has **three discrete zoom levels** that progressively reveal detail:

```
L0  Repo       ████████████  ← one node per repository
L1  Module     ■ ■ ■ ■ ■ ■  ← directory-level clusters (default view)
L2  Function   · · · · · · · ← every function, method, class
```

Colors stay consistent across levels. Zoom in and the islands resolve into individual functions — zoom out and they collapse back into clean module clusters.

### 2. Graph-Topology Noise Filtering

69% of symbols in a typical repo are test functions. Instead of brittle filename matching (`test_*.py`), Codespace scores every symbol by its **structural role in the call graph**:

- **Fan-in** (who calls me?) — the strongest signal
- **Fan-out** (who do I call?) — identifies orchestrators
- **Cross-module reach** — integration points that bridge modules
- **Edge confidence** — import-resolved edges count more

Symbols are classified into categories:

| Category | Signal | Example |
|---|---|---|
| `hub` | High fan-in + high fan-out | `dispatch()`, `main()` |
| `api` | High fan-in, cross-module callers | `get_user()`, `validate()` |
| `test` | Zero fan-in, no cross-module in-edges | `test_login()` |
| `util` | Private (`_prefix`), low connectivity | `_parse_int()` |
| `internal` | Everything else | `sanitize()` |

The function view automatically filters `test` and low-importance nodes, showing only structurally significant code.

### 3. MCP-Ready — Save Tokens for LLMs

The output `codespace_graph.json` is a **structured, token-efficient representation** of your codebase. Instead of feeding 200K lines of source code into an LLM context window, feed the graph:

```
Raw source:     ~800K tokens (200K LOC)
codespace_graph: ~15K tokens (same repo)
```

**Use as MCP (Model Context Protocol) tool:**

```json
{
  "name": "codespace",
  "description": "Code architecture graph with module topology, call edges, and importance scores",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "Module or function to look up" }
    }
  }
}
```

An LLM can query the graph to understand:
- Which modules exist and how they connect
- What a function calls and who calls it
- Which symbols are hubs vs. leaf nodes
- Cross-module dependency chains

This replaces expensive "read every file" workflows with a single structured lookup. **50x token reduction** while preserving architectural understanding.

### 4. Zero-Dependency Core

The Python backend uses only stdlib (`ast`, `json`, `http.server`). No heavy frameworks, no database, no build system for the analyzer. LLM integration (`anthropic`/`openai`) is optional.

### 5. Community Detection + Visual Clustering

Label-propagation community detection groups tightly-connected modules into visual clusters. Golden-angle hue spacing ensures up to 12 communities get visually distinct colors. Modules that talk to each other land near each other.

---

## Quick Start

### Install

```bash
git clone https://github.com/danielwanwx/codespace.git
cd codespace

# Python backend
pip install -e .            # or: uv sync

# Frontend
cd frontend && npm install && npm run build && cd ..
```

### Analyze a Repo

```bash
# Basic — generates codespace_graph.json and serves it
codespace /path/to/your/python/repo --serve

# Opens at http://localhost:3000
```

### With AI Explanations

```bash
codespace /path/to/repo \
  --llm-provider anthropic \
  --llm-api-key sk-ant-... \
  --wiki-depth modules \
  --serve
```

### CLI Options

| Flag | Default | Description |
|---|---|---|
| `repo_path` | (required) | Path to Python repository |
| `-o, --output` | `codespace_graph.json` | Output path |
| `--llm-provider` | `none` | `anthropic`, `openai`, or `none` |
| `--llm-api-key` | — | API key for LLM provider |
| `--llm-model` | auto | Model override |
| `--wiki-depth` | auto | `none`, `modules`, or `full` |
| `--serve` | off | Start HTTP server after generation |
| `--port` | `3000` | Server port |

---

## Pipeline

Codespace runs an 8-step pipeline — no LLM required for the core analysis:

```
Step 1  Index           Scan repo → discover Python modules
Step 2  Extract         AST parse → functions, classes, methods, signatures, docstrings, call lists
Step 3  Resolve Edges   Match bare call names → qualified cross-module edges (import-aware)
Step 4  Score           Graph topology → importance scores + category classification
Step 5  Cluster         Directory → module clusters (merge small, split large)
Step 6  Name            LLM semantic names (optional) or directory names
Step 7  Wiki            Generate wiki pages per module (optional LLM)
Step 8  Export          codespace_graph.json → frontend
```

Example output:

```
Codespace: analyzing /Users/you/Projects/MyApp
  [1/7] Indexing repo...
         Found 31 modules
  [2/7] Extracting symbols...
         Found 826 symbols
  [3/7] Resolving call graph...
         Resolved 930 function edges, 75 module edges
  [4/7] Scoring symbol importance...
         532/811 symbols classified as test/noise
  [5/7] Forming clusters...
  [6/7] Using directory names (no LLM)...
  [7/7] Exporting graph...
  Done! Stats: {'modules': 31, 'functions': 613, 'classes': 213, 'edges': 1005}
```

---

## Frontend Features

### Canvas — Interactive Graph

The main visualization is a **D3 force-directed graph** rendered on HTML5 Canvas:

- **Force simulation** with cluster attraction, collision avoidance, and drift animation
- **Minimap** (bottom-left) for orientation in large graphs
- **Legend** showing community colors and module groupings
- **Drag** to pan, **scroll** to zoom, **click** to select
- **Hover** shows tooltip with docstring preview
- **Selection** highlights the node + all connected nodes/edges, fades the rest

### Zoom Toolbar

Three-level zoom control (bottom-left buttons):

- **REPO** — single repository node
- **MOD** — module-level clusters (default)
- **FUNC** — individual functions and classes (noise-filtered)

### Search

`Cmd+K` or click the search bar. Real-time fuzzy search across all symbols. Select a result to fly-to and highlight that node on the graph.

### Side Panel

Click any node to open the detail panel:

**Module nodes show:**
- Path, file count, symbol count
- Functions and classes list
- Incoming/outgoing connections with call counts
- "Explain with AI" button

**Function nodes show:**
- Full signature + docstring
- Calls (outgoing) — clickable, flies to target
- Called-by (incoming) — clickable
- AI explanation (on-demand)

### Settings

Gear icon (bottom-right) opens LLM configuration:
- Provider: Anthropic Claude / OpenAI
- API key (stored in browser, never sent to any server except the LLM provider)
- Model override

---

## Use as MCP Tool for LLMs

The `codespace_graph.json` output is designed to be consumed by LLMs as a **structured context source**. This is one of the most powerful use cases.

### Why This Matters

When an AI agent needs to understand a codebase, the naive approach is reading every source file — burning 100K+ tokens. Codespace pre-computes the structural graph, so the LLM gets:

- **Module topology** — what exists and how it connects
- **Call graph** — who calls whom, with confidence levels
- **Importance scores** — which functions matter most
- **Categories** — hub/api/test/util/internal classification
- **Signatures + docstrings** — compressed function summaries

### MCP Server Setup

Serve the graph as an MCP resource:

```python
# mcp_server.py — minimal example
import json

def get_codespace_context(query: str) -> str:
    with open("codespace_graph.json") as f:
        graph = json.load(f)

    # Filter to relevant nodes
    if query:
        nodes = [n for n in graph["nodes"]
                 if query.lower() in n["id"].lower()
                 or query.lower() in n.get("label", "").lower()]
    else:
        # Return high-importance nodes only
        nodes = [n for n in graph["nodes"]
                 if n.get("importance", 0) > 0.3 or n["type"] == "module"]

    edges = [e for e in graph["edges"]
             if any(n["id"] in (e["source"], e["target"]) for n in nodes)]

    return json.dumps({"nodes": nodes, "edges": edges}, indent=2)
```

### Claude Code / Cursor Integration

Add to your `.claude/settings.json` or MCP config:

```json
{
  "mcpServers": {
    "codespace": {
      "command": "python",
      "args": ["mcp_server.py"],
      "description": "Code architecture graph — query modules, functions, and dependencies"
    }
  }
}
```

Now the LLM can ask: *"What modules depend on auth?"* and get a precise, token-efficient answer from the graph instead of reading 50 source files.

### Token Budget Comparison

| Approach | Tokens | Accuracy |
|---|---|---|
| Read all source files | ~800K | High (but exceeds context) |
| Tree-based file listing | ~5K | Low (no relationships) |
| **Codespace graph** | **~15K** | **High (topology + scores + signatures)** |
| Codespace filtered (importance > 0.3) | ~5K | Medium-high (core architecture) |

---

## Output Format

### codespace_graph.json

```jsonc
{
  "metadata": {
    "generated_at": "2026-03-23T07:30:00+00:00",
    "repos": ["MyApp"],
    "stats": { "modules": 31, "functions": 613, "classes": 213, "edges": 1005 }
  },
  "nodes": [
    {
      "id": "MyApp::auth.service::login",
      "type": "function",
      "label": "login(email, password) -> Token",
      "parent": "MyApp::auth.service",
      "file": "src/auth/service.py",
      "line": 42,
      "signature": "login(email: str, password: str) -> Token",
      "docstring": "Authenticate user and return JWT.",
      "calls": ["find_user", "verify_hash", "encode_token"],
      "called_by": ["MyApp::api.routes::handle_login", "MyApp::scripts::main"],
      "importance": 0.82,
      "category": "api"
    }
  ],
  "edges": [
    {
      "source": "MyApp::auth.service",
      "target": "MyApp::database.repo",
      "type": "call",
      "weight": 4,
      "children_edges": ["login->find_user", "register->create_user"]
    }
  ]
}
```

### Node Fields

| Field | Type | Description |
|---|---|---|
| `id` | string | Qualified name: `repo::module::symbol` |
| `type` | string | `repo`, `module`, `function`, `class` |
| `importance` | float | 0.0–1.0 graph-topology score |
| `category` | string | `hub`, `api`, `test`, `util`, `internal` |
| `calls` | string[] | Outgoing call targets |
| `called_by` | string[] | Incoming callers |
| `signature` | string | Full function signature |
| `docstring` | string | First line of docstring |

---

## Static Deployment

Codespace builds to a static site — no server needed at runtime.

```bash
# Build frontend
cd frontend && npm run build

# Generate graph into dist/
codespace /path/to/repo -o frontend/dist/codespace_graph.json

# Deploy dist/ to any static host
# GitHub Pages, Vercel, Netlify, S3, etc.
```

Load a different graph via URL parameter:

```
https://your-site.com/?graph=./other_graph.json
```

---

## Architecture

```
┌─── Python Backend ──────────────────────────┐
│                                              │
│  indexer.py        → Module discovery        │
│  symbols.py        → AST extraction          │
│  graph_aggregator  → Call graph resolution    │
│  importance.py     → Topology scoring         │
│  clusters.py       → Module clustering        │
│  export.py         → JSON graph builder       │
│  wiki_generator    → LLM wiki pages (opt)     │
│                                              │
│  Output: codespace_graph.json                │
└──────────────────┬───────────────────────────┘
                   │
┌─── React Frontend ──────────────────────────┐
│                  ▼                           │
│  GraphView.tsx   → D3 force simulation       │
│  SidePanel.tsx   → Node detail + AI explain  │
│  SearchBar.tsx   → Fuzzy symbol search       │
│  ZoomToolbar.tsx → Repo / Module / Function  │
│  SettingsBar.tsx → LLM provider config       │
│  store.ts        → Zustand state             │
│  lib/llm.ts      → Client-side LLM calls     │
└──────────────────────────────────────────────┘
```

---

## Roadmap

### Shipped (MVP)
- Single-repo Python analysis
- Three zoom levels (Repo → Module → Function)
- D3 force graph with community detection
- Importance scoring + noise filtering
- Call graph with import-aware resolution
- On-demand AI explanations
- Wiki page generation
- Static deployment

### Phase 2
- Multi-repo support with cross-repo edges
- Class-level zoom (inheritance edges)
- Tree-sitter for TypeScript, Go, Java, Rust
- Edge bundling for dense connections

### Phase 3
- Git blame integration (change frequency heatmap)
- Diff impact visualization (blast radius)
- Live watch mode (re-index on push)
- Collaborative annotations

---

## Development

```bash
# Run tests
uv run pytest tests/ -v

# Frontend dev server (hot reload)
cd frontend && npm run dev

# Full pipeline test
codespace /path/to/any/python/repo --serve
```

## License

MIT

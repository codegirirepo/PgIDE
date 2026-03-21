<p align="center">
  <img src="https://img.shields.io/badge/PostgreSQL-IDE-336791?style=for-the-badge&logo=postgresql&logoColor=white" alt="PgIDE" />
</p>

<h1 align="center">PgIDE — PostgreSQL IDE</h1>

<p align="center">
  A modern, feature-rich PostgreSQL IDE built with React, TypeScript, Monaco Editor, and Node.js.<br/>
  Query, explore, optimize, and manage your PostgreSQL databases — all from the browser or desktop.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" alt="React 18" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Electron-Optional-47848F?logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License" />
</p>

---

<!-- 
  📸 SCREENSHOTS
  Replace these placeholders with actual screenshots of your app.
  Recommended: use GitHub issue attachments or a /docs/screenshots/ folder.
-->

<!--
<p align="center">
  <img src="docs/screenshots/query-editor.png" width="800" alt="Query Editor" />
  <br/><em>Query Editor with autocomplete, multiple tabs, and inline error highlighting</em>
</p>

<p align="center">
  <img src="docs/screenshots/explain-viewer.png" width="800" alt="EXPLAIN Analyzer" />
  <br/><em>Visual EXPLAIN analyzer with critical path detection and plan comparison</em>
</p>

<p align="center">
  <img src="docs/screenshots/er-diagram.png" width="800" alt="ER Diagram" />
  <br/><em>Interactive ER diagram with drag-and-drop and relationship highlighting</em>
</p>
-->

## ✨ Features

### Core IDE

| Feature | Description |
|---------|-------------|
| **Connection Manager** | Save, test, connect/disconnect multiple PostgreSQL servers. Credentials are AES-encrypted at rest. |
| **Database Explorer** | Tree view with lazy-loaded schemas, tables, views, functions, and columns. Right-click context menus. |
| **Query Editor** | Monaco Editor (VS Code engine) with SQL syntax highlighting, database-aware autocomplete, multiple tabs, and keyboard shortcuts. |
| **Results Viewer** | Virtualized data grid (handles 100K+ rows) with column sorting, filtering, resizable columns, inline cell editing, and CSV/JSON export. |
| **Infinite Scroll** | Results load 1,000 rows at a time. Scroll to the bottom to automatically fetch the next page — no pagination buttons needed. |
| **Table Designer** | Inspect columns, indexes, constraints, and auto-generated DDL for any table. |
| **Query History** | Searchable log of all executed queries with one-click re-run. |
| **Query Bookmarks** | Save, tag, search, and organize frequently used queries. |
| **Dark / Light Theme** | Toggle between themes with a single click. |
| **Resizable Panels** | Drag to resize sidebar, editor, and results panels. |
| **Error Highlighting** | PostgreSQL errors highlight the offending line directly in the editor. |

### Performance & Optimization

| Feature | Description |
|---------|-------------|
| **EXPLAIN Analyzer** | Visual execution plan viewer with time bars, cost breakdown, row estimate accuracy, and buffer stats. |
| **Critical Path Detection** | Automatically highlights the slowest path through the query plan. |
| **Join Strategy Analysis** | Explains Nested Loop vs Hash Join vs Merge Join with contextual warnings. |
| **Parallel Query Visualization** | Shows worker utilization for parallel plans. |
| **Memory & Spill Warnings** | Detects sorts/hashes spilling to disk and suggests `work_mem` adjustments. |
| **Parameter Testing** | Override planner parameters (`work_mem`, `random_page_cost`, etc.) and re-run EXPLAIN to see plan changes side-by-side. |
| **Plan History & Comparison** | Save execution plans over time. Select any two plans for side-by-side diff with delta summary. |
| **Index Advisor** | Analyzes queries and suggests missing indexes with ready-to-run `CREATE INDEX` statements. |
| **Slow Query Dashboard** | Reads `pg_stat_statements` to surface the most expensive queries with call counts, timing, and cache hit ratios. |
| **Table Stats Dashboard** | Shows live/dead rows, bloat percentage, vacuum status, index hit ratios, and health indicators for every table. |

### Schema & Visualization

| Feature | Description |
|---------|-------------|
| **ER Diagram** | Interactive entity-relationship diagram with drag-and-drop positioning, zoom/pan, and relationship highlighting. |
| **Schema Diff** | Compare schemas across two connected databases. Shows added/removed/modified tables and columns. |
| **Migration Generator** | Auto-generates migration SQL from schema diffs. Copy or open directly in the editor. |

### pgvector / AI Embeddings Support

| Feature | Description |
|---------|-------------|
| **Extension Detection** | Detects whether `pgvector` is installed, shows version, and offers one-click install. |
| **Vector Column Inventory** | Lists all vector columns across your database with dimensions, row counts, and index status. |
| **Smart Inline Hints** | As you type vector SQL, the editor shows inline warnings: missing `LIMIT`, high dimensions, missing indexes. |
| **Index Recommendations** | Suggests HNSW or IVFFlat indexes for unindexed vector columns with ready-to-run SQL. |
| **Distance Operator Reference** | Quick reference for `<->` (L2), `<=>` (cosine), `<#>` (inner product) with use-case guidance. |
| **Embedding Model Reference** | Dimension lookup for OpenAI, Cohere, Sentence Transformers, Amazon Titan, and more. |
| **Code Templates** | One-click insertable snippets for: table creation, HNSW/IVFFlat indexes, similarity search, hybrid search, RAG patterns, and performance tuning. |
| **Autocomplete** | Monaco autocomplete for `vector(n)`, operator classes, index types, and common patterns. |

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite 5 |
| UI | TailwindCSS + Radix UI primitives |
| Editor | Monaco Editor (VS Code engine) |
| State | Zustand |
| Grid | TanStack Virtual (virtualized rows) |
| Panels | react-resizable-panels |
| Backend | Node.js + Express + TypeScript |
| DB Driver | node-postgres (pg) with connection pooling |
| Security | AES-256 credential encryption (crypto-js) |
| Desktop | Electron (optional) |

## 📁 Project Structure

```
PgIDE/
├── backend/
│   └── src/
│       ├── index.ts                    # Express server entry
│       ├── routes/
│       │   ├── connections.ts          # Connection CRUD + connect/disconnect
│       │   ├── metadata.ts             # Database explorer + pgvector APIs
│       │   ├── query.ts                # Query execution + cancel
│       │   └── advanced.ts             # EXPLAIN, index advice, stats, diff
│       ├── services/
│       │   ├── connectionManager.ts    # Pool management + encryption
│       │   ├── metadataService.ts      # Schema/table/column queries
│       │   ├── queryExecutor.ts        # SQL execution with pagination
│       │   ├── advancedService.ts      # EXPLAIN, stats, diff engine
│       │   └── pgvectorService.ts      # pgvector detection + analysis
│       └── utils/
│           └── encryption.ts           # AES credential encryption
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── ConnectionManager/      # Connection dialog
│       │   ├── DatabaseExplorer/       # Tree view sidebar
│       │   ├── QueryEditor/            # Monaco editor + tabs
│       │   ├── ResultsViewer/          # Data grid + infinite scroll + export
│       │   ├── TableDesigner/          # Table structure viewer
│       │   ├── ExplainViewer/          # Visual EXPLAIN + plan comparison
│       │   ├── IndexAdvisor/           # Index recommendation engine
│       │   ├── TableStats/             # Table health dashboard
│       │   ├── SlowQueries/            # pg_stat_statements viewer
│       │   ├── ERDiagram/              # Interactive ER diagram (SVG)
│       │   ├── SchemaDiff/             # Schema comparison + migration
│       │   ├── PgVectorAdvisor/        # pgvector hints + templates
│       │   ├── Bookmarks/              # Query bookmark manager
│       │   └── Layout/                 # App shell + history panel
│       ├── services/
│       │   ├── api.ts                  # Backend API client
│       │   └── pgvector/
│       │       └── pgvectorAnalyzer.ts # Client-side vector SQL analysis
│       ├── store/
│       │   └── useAppStore.ts          # Zustand global state
│       └── types/
│           └── index.ts                # TypeScript interfaces
├── electron/                           # Optional desktop wrapper
│   ├── main.js
│   └── package.json
├── package.json                        # Root scripts
├── LICENSE
└── README.md
```

## 🚀 Quick Start

### Prerequisites

- **Node.js 18+**
- **A running PostgreSQL instance** (local or remote)

### 1. Clone and install

```bash
git clone https://github.com/<your-username>/pgide.git
cd pgide
npm run install:all
```

### 2. Start development servers

```bash
# Both backend + frontend at once:
npm run dev

# Or separately:
npm run dev:backend    # Backend on http://localhost:3001
npm run dev:frontend   # Frontend on http://localhost:5173
```

### 3. Open the app

Navigate to **http://localhost:5173**

### 4. Connect to PostgreSQL

1. Click **Connections** in the toolbar
2. Fill in your PostgreSQL credentials
3. Click **Test** to verify → Click **Save**
4. Click the green plug icon to connect
5. The Database Explorer populates with your schemas and tables

## 📡 API Reference

### Connections

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/connections` | List saved connections |
| `POST` | `/api/connections` | Save a new connection |
| `DELETE` | `/api/connections/:id` | Delete a connection |
| `POST` | `/api/connections/test` | Test connection credentials |
| `POST` | `/api/connections/:id/connect` | Open connection pool |
| `POST` | `/api/connections/:id/disconnect` | Close connection pool |

### Metadata & Explorer

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/metadata/:connId/schemas` | List schemas |
| `GET` | `/api/metadata/:connId/schemas/:schema/tables` | List tables |
| `GET` | `/api/metadata/:connId/schemas/:schema/views` | List views |
| `GET` | `/api/metadata/:connId/schemas/:schema/functions` | List functions |
| `GET` | `/api/metadata/:connId/schemas/:schema/tables/:table/columns` | Table columns |
| `GET` | `/api/metadata/:connId/schemas/:schema/tables/:table/indexes` | Table indexes |
| `GET` | `/api/metadata/:connId/schemas/:schema/tables/:table/constraints` | Table constraints |
| `GET` | `/api/metadata/:connId/autocomplete` | Autocomplete suggestions |
| `GET` | `/api/metadata/:connId/pgvector` | pgvector extension status + vector columns |

### Query Execution

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/query/execute` | Execute SQL (supports pagination via `offset`/`limit`) |
| `POST` | `/api/query/cancel` | Cancel a running query |

### Advanced / DBA Tools

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/advanced/explain` | EXPLAIN ANALYZE with buffers + timing |
| `POST` | `/api/advanced/explain-with-settings` | EXPLAIN with custom planner parameters |
| `POST` | `/api/advanced/index-advice` | Index recommendations for a query |
| `GET` | `/api/advanced/table-stats/:connId` | Table health stats + cache hit ratio |
| `GET` | `/api/advanced/slow-queries/:connId` | Top slow queries from pg_stat_statements |
| `GET` | `/api/advanced/er-diagram/:connId/:schema` | ER diagram data (tables + relationships) |
| `POST` | `/api/advanced/schema-diff` | Compare schemas between two databases |
| `POST` | `/api/advanced/migration` | Generate migration SQL from schema diff |

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Enter` | Execute full query |
| `Ctrl+Shift+Enter` | Execute selected text only |

## 🔒 Security

- Passwords are **AES-256 encrypted** before storage and never sent back to the frontend
- All metadata queries use **parameterized queries** to prevent SQL injection
- Set the `ENCRYPTION_KEY` environment variable in production for a custom encryption key

## 🖥️ Optional: Electron Desktop App

```bash
cd electron
npm install
npm start
```

Packages the web app as a native desktop application with auto-started backend.

## ⚙️ Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Backend server port |
| `ENCRYPTION_KEY` | (built-in) | AES encryption key for stored credentials |

## 🗺️ Roadmap

- [ ] SSH tunnel support for remote databases
- [ ] Query result data visualization (charts)
- [ ] Database object DDL diff (functions, triggers)
- [ ] Import CSV/JSON into tables
- [ ] Multi-database query execution
- [ ] Collaborative query sharing
- [ ] Plugin system for custom extensions

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'Add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<p align="center">
  Built with ❤️ for the PostgreSQL community
</p>

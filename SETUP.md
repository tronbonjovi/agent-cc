# Setup Guide

Detailed installation and configuration instructions for Agent CC.

---

## Prerequisites

- **Node.js 18+** -- [Download](https://nodejs.org). Verify with `node -v`.
- **Claude Code** -- installed and set up. The dashboard reads from `~/.claude/` which Claude Code creates. Install via `npm install -g @anthropic-ai/claude-code`.

---

## Install from source

```bash
git clone https://github.com/tronbonjovi/agent-cc.git
cd agent-cc
npm install
npm run dev
```

Open [http://localhost:5100](http://localhost:5100).

### Production build

```bash
npm run build    # Bundles client (Vite) + server (esbuild) into dist/
npm start        # Runs the production bundle
```

### Updating from source

The sidebar shows an update indicator when new commits are available. Click to apply.

Or manually:

```bash
git pull
npm install
npm run build
npm start
```

---

## Docker

```bash
git clone https://github.com/tronbonjovi/agent-cc.git
cd agent-cc
docker compose up -d --build
```

---

## Configuration

Set environment variables before starting:

```bash
PORT=3000 npm run dev
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5100` | Server port |
| `HOST` | `127.0.0.1` | Bind address |
| `AGENT_CC_DATA` | `~/.agent-cc/` | Where the dashboard stores its data |
| `GITHUB_TOKEN` | (none) | Optional. Increases GitHub API rate limits for Discovery search |

### Security note on HOST

The default `127.0.0.1` means only your machine can access the dashboard. Setting `HOST=0.0.0.0` exposes it to your local network **with no authentication**. Only do this on trusted networks.

---

## Graph Configuration

The graph auto-discovers your projects, MCPs, sessions, and relationships. You can extend it further.

### Custom nodes and edges

Create a `graph-config.yaml` file in any of these locations:

- `~/graph-config.yaml`
- `~/.claude/graph-config.yaml`
- `<project-directory>/graph-config.yaml`

```yaml
nodes:
  - id: postgres-main
    type: database
    label: "PostgreSQL"
    description: "Primary database on :5432"
    color: "#336791"

  - id: redis-cache
    type: cache
    label: "Redis"
    description: "Session cache on :6379"
    color: "#DC382D"

edges:
  - source: my-mcp-server    # matches by entity name
    target: config-postgres-main
    label: connects_to

  - source: config-redis-cache
    target: my-project
    label: caches_for

overrides:
  - entity: my-project        # matches by name or ID
    description: "Custom description for the graph"
    color: "#22c55e"
```

Node types: `service`, `database`, `api`, `cicd`, `deploy`, `queue`, `cache`, `other`

Edge targets can reference entity names (matched case-insensitively) or custom node IDs (prefixed with `config-`).

### AI-assisted suggestions

Click **AI Suggest** in the graph toolbar. This:

1. Gathers your ecosystem data (entities, relationships, CLAUDE.md)
2. Sends it to `claude -p` (Claude Code CLI, runs locally)
3. Returns suggested infrastructure nodes and connections
4. You review and accept/reject each suggestion

Requires Claude Code CLI installed and authenticated. If not set up, a guide will appear.

### Docker Compose auto-discovery

If your projects contain `docker-compose.yml` files, the scanner automatically extracts services as graph nodes with `depends_on` relationships as edges.

### Database URL auto-discovery

Database connection URLs found in MCP environment variables (PostgreSQL, MySQL, MongoDB, Redis) are automatically extracted as database/cache nodes in the graph.

---

## Data Storage

All dashboard data is stored in a single JSON file:

```
~/.agent-cc/agent-cc.json
```

This contains:
- Discovered entity metadata (names, paths, descriptions -- not file contents)
- Relationships between entities
- Custom graph nodes and edges
- Markdown file backups (for the editor's version history)
- App settings

To reset everything, delete this file and restart.

---

## Troubleshooting

### "No entities found"

Make sure Claude Code is installed and you have at least one project. The scanner looks for:
- `~/.claude/` directory (Claude Code's data)
- Directories under `~/` with `CLAUDE.md`, `.mcp.json`, `package.json`, or `.git`

### Port already in use

```bash
PORT=3000 npm run dev
```

### Build fails

```bash
rm -rf node_modules
npm install
npm run build
```

### Dashboard is slow

The initial scan reads your entire `~/.claude/` directory. If you have many sessions (100+), the first load takes a few seconds. Subsequent loads use cached data.

---

## Uninstall

```bash
rm -rf agent-cc              # remove the repo
rm -rf ~/.agent-cc           # remove stored data
```

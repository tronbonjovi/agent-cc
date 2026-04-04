# Docker Containerization Design

## Goal

Package Claude Command Center as a Docker image so it can run as a service in a homelab Docker Compose stack. Accessed via SSH tunnel from a remote machine.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Data access | Bind mount `~/.claude` | Live data, standard homelab pattern |
| Deployment model | Standalone compose + liftable into other stacks | Ship `docker-compose.yml` in repo; easy to copy service block elsewhere |
| Base image | `node:22-alpine` | ~50MB, no native deps to worry about |
| Build strategy | Multi-stage, production only | Smallest image, reproducible, no devDeps at runtime |

## Deliverables

### 1. Dockerfile (multi-stage)

**Stage 1 — Build:**
- Base: `node:22-alpine`
- Copy `package.json` + `package-lock.json`, run `npm ci`
- Copy source, run `npm run build`

**Stage 2 — Runtime:**
- Base: `node:22-alpine` (fresh)
- Copy from stage 1: `dist/`, `shared/`, `package.json`, `package-lock.json`
- `npm ci --omit=dev` (production deps only: express, chokidar, gray-matter, zod)
- Set `NODE_ENV=production`
- Expose port `5100`
- Run as non-root `node` user (built into Alpine Node image)
- Entrypoint: `node dist/index.cjs`

### 2. .dockerignore

Exclude from build context:
- `node_modules/`
- `dist/`
- `.git/`
- `docs/`
- `tests/`
- `*.md` (root-level)
- `.env*`

### 3. docker-compose.yml

```yaml
services:
  command-center:
    build: .
    ports:
      - "5100:5100"
    environment:
      - HOST=0.0.0.0
      - PORT=5100
      - COMMAND_CENTER_DATA=/data
    volumes:
      - ~/.claude:/home/node/.claude:ro
      - command-center-data:/data
    restart: unless-stopped

volumes:
  command-center-data:
```

**Volumes:**
- `~/.claude` bind mount (read-only) — session data from host
- `command-center-data` named volume — app's persistent state (`command-center.json`)

**To use in another stack:** copy the service block and volume definition, replace `build: .` with `image: claude-command-center`.

## Code Changes

None. The existing app already:
- Uses `os.homedir()` for path resolution (maps correctly to `/home/node` in container)
- Supports `HOST`, `PORT`, `COMMAND_CENTER_DATA` env vars
- Handles CORS for `localhost` origins (works with SSH tunnel access)

## Access Pattern

User SSHs into devbox with port forward:
```bash
ssh -L 5100:localhost:5100 tron@<devbox-ip>
```
Then opens `http://localhost:5100` in browser. CORS allows `localhost:5100` by default.

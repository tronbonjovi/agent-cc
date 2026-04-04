# Docker Containerization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package Command Center as a production Docker image with Compose support for homelab deployment.

**Architecture:** Multi-stage Dockerfile (build + runtime), docker-compose.yml with bind mount for `~/.claude` and named volume for app data. Zero code changes needed.

**Tech Stack:** Docker, Node 22 Alpine, Docker Compose

---

### Task 1: Create .dockerignore

**Files:**
- Create: `.dockerignore`

- [ ] **Step 1: Create the .dockerignore file**

```
node_modules/
dist/
.git/
.gitignore
docs/
tests/
*.md
.env*
.vscode/
.idea/
```

- [ ] **Step 2: Verify it looks correct**

Run: `cat .dockerignore`
Expected: The file contents above, no stray entries.

- [ ] **Step 3: Commit**

```bash
git add .dockerignore
git commit -m "chore: add .dockerignore for Docker build context"
```

---

### Task 2: Create Dockerfile

**Files:**
- Create: `Dockerfile`

- [ ] **Step 1: Create the multi-stage Dockerfile**

```dockerfile
# Stage 1 — Build
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2 — Runtime
FROM node:22-alpine

WORKDIR /app

COPY --from=build /app/dist ./dist
COPY package.json package-lock.json ./

RUN npm ci --omit=dev

RUN mkdir -p /data && chown node:node /data

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=5100

EXPOSE 5100

USER node

CMD ["node", "dist/index.cjs"]
```

- [ ] **Step 2: Build the image to verify it compiles**

Run: `docker build -t claude-command-center .`
Expected: Build completes with no errors. Final image is based on Alpine with production deps only.

- [ ] **Step 3: Run a quick smoke test**

Run: `docker run --rm -p 5100:5100 -v ~/.claude:/home/node/.claude:ro claude-command-center`
Expected: Server starts, logs `serving on port 5100`. Hit `http://localhost:5100` — should load the dashboard.

Stop the container with Ctrl+C.

- [ ] **Step 4: Check image size**

Run: `docker images claude-command-center --format "{{.Size}}"`
Expected: Under 200MB (Alpine base + production node_modules + built app).

- [ ] **Step 5: Commit**

```bash
git add Dockerfile
git commit -m "feat: add multi-stage Dockerfile for production image"
```

---

### Task 3: Create docker-compose.yml

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Create the compose file**

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
    # On Docker Desktop for Mac/Windows, uncomment to enable file polling:
    # - CHOKIDAR_USEPOLLING=1

volumes:
  command-center-data:
```

- [ ] **Step 2: Test with docker compose**

Run: `docker compose up --build`
Expected: Image builds, container starts, dashboard accessible at `http://localhost:5100`. Session data from `~/.claude` is visible in the dashboard.

Stop with Ctrl+C.

- [ ] **Step 3: Test detached mode and teardown**

Run: `docker compose up -d --build`
Expected: Container starts in background.

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5100`
Expected: `200`

Run: `docker compose down`
Expected: Container stops and is removed. Named volume persists.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add docker-compose.yml for homelab deployment"
```

---

### Task 4: Update README with Docker instructions

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add Docker section to README**

Add a "Docker" section after the existing install/run instructions:

```markdown
## Docker

Build and run with Docker Compose:

```bash
docker compose up -d --build
```

The dashboard will be available at `http://localhost:5100`.

**Volumes:**
- `~/.claude` is mounted read-only so the dashboard can read your Claude session data
- App settings are stored in a persistent Docker volume

To stop:

```bash
docker compose down
```

To rebuild after pulling updates:

```bash
docker compose up -d --build
```
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add Docker usage instructions to README"
```

---

### Task 5: Verify end-to-end

- [ ] **Step 1: Clean build from scratch**

Run:
```bash
docker compose down -v
docker rmi claude-command-center 2>/dev/null
docker compose up -d --build
```
Expected: Full rebuild from scratch, container starts, dashboard loads.

- [ ] **Step 2: Verify session data is visible**

Open `http://localhost:5100` in browser (via SSH tunnel). Confirm projects and sessions from `~/.claude` appear in the dashboard.

- [ ] **Step 3: Verify app settings persist**

Change a setting in the dashboard (e.g., app name). Run `docker compose down && docker compose up -d`. Confirm the setting persisted (stored in the named volume).

- [ ] **Step 4: Verify container runs as non-root**

Run: `docker compose exec command-center whoami`
Expected: `node`

- [ ] **Step 5: Tear down**

Run: `docker compose down`

- [ ] **Step 6: Final commit with version bump**

```bash
git add -A
git commit -m "feat: Docker containerization — v1.22.0"
```

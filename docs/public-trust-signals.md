# Public Trust Signals

This document explains why users can trust this project and how to verify its behavior.

## Why Trust This Project

### Fully open source
Every line of code is available for inspection. There is no obfuscated or minified source code in the repository (the `dist/` directory is gitignored and built from source).

### No telemetry or analytics
The application makes zero outbound network requests unless you explicitly:
1. Click "AI Suggest" in the graph (spawns `claude -p` locally)
2. Use the Discovery search (calls GitHub API, optionally authenticated)
3. Click "Check for updates" (runs `git fetch` against the repo remote)

### All data stays local
- Application data: `~/.claude-command-center/command-center.json`
- No cloud storage, no external databases, no sync services
- Data is plain JSON, human-readable, deletable at any time

### Localhost only
The server binds to `127.0.0.1:5100` by default. It is not accessible from other machines on your network.

### Minimal permissions
- Reads your `~/.claude/` directory (Claude Code's own data)
- Reads project directories under your home folder
- Writes only to `~/.claude-command-center/` and markdown files you explicitly edit
- No root/admin privileges needed

## How to Verify

### Inspect network activity
Open your browser's DevTools Network tab while using the dashboard. You will see only requests to `localhost:5100`. No external calls are made unless you trigger Discovery search or AI Suggest.

### Inspect the source
```bash
# Check for hardcoded URLs, IPs, or tokens
grep -r "https://" server/ --include="*.ts" | grep -v node_modules
grep -r "api_key\|secret\|token\|password" server/ --include="*.ts"

# Check what the server listens on
grep -r "listen\|0\.0\.0\.0\|127\.0\.0\.1" server/index.ts
```

### Inspect the build
```bash
npm run build
ls -la dist/          # Single server bundle + static assets
```

The build produces:
- `dist/index.cjs` — server bundle (esbuild from TypeScript source)
- `dist/public/` — client bundle (Vite from React source)

No additional files, no hidden downloads during build.

### Inspect dependencies
```bash
npm audit              # Check for known vulnerabilities
npm ls --depth=0       # List direct dependencies only
```

All dependencies are well-known packages with millions of weekly downloads.

## How Releases Are Built

1. Maintainer tags a version: `git tag v1.0.0 && git push --tags`
2. GitHub Actions CI builds the project from source
3. CI generates a tarball of `dist/` and a SHA-256 checksums file
4. Both are attached to the GitHub release

### Verifying a download

```bash
# Download the release tarball and checksums (replace version as needed)
curl -LO https://github.com/sorlen008/claude-command-center/releases/download/v1.0.0/claude-command-center-v1.0.0.tar.gz
curl -LO https://github.com/sorlen008/claude-command-center/releases/download/v1.0.0/checksums-v1.0.0.sha256

# Verify
sha256sum -c checksums-v1.0.0.sha256
```

## What This Project Does NOT Do

- Does not send data to any external server
- Does not collect usage metrics or analytics
- Does not modify Claude Code settings or MCP configs (only reads them; the markdown editor can edit `CLAUDE.md` and memory files)
- Does not require an internet connection for core functionality
- Does not run any code at `npm install` time (no lifecycle scripts)
- Does not access files outside your home directory
- Does not store passwords, tokens, or API keys (redacts them from scanned configs)

## How Vulnerabilities Are Handled

See [SECURITY.md](../SECURITY.md). Vulnerabilities should be reported privately via GitHub Security Advisories. We acknowledge reports within 7 days and aim to fix confirmed issues promptly.

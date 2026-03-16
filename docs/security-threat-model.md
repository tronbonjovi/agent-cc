# Security Threat Model

## Overview

Claude Command Center is a local-only web dashboard that reads Claude Code configuration files and presents them in a browser UI. It runs on `127.0.0.1` and is designed for single-user operation on a developer's workstation.

## Assets to Protect

| Asset | Sensitivity | Location |
|-------|-------------|----------|
| Claude Code session files | Medium | `~/.claude/projects/` |
| CLAUDE.md and memory files | Medium | Various project directories |
| MCP server configurations | Medium (may reference env vars) | `.mcp.json` files |
| Claude Code settings | Low | `~/.claude/settings.json` |
| Command Center database | Low | `~/.claude-command-center/command-center.json` |
| Optional GitHub token | High (if set) | `GITHUB_TOKEN` env var only |

## Trust Boundaries

```
[Browser on localhost] <--HTTP--> [Express server on 127.0.0.1:5100]
                                       |
                                       +--> [Local filesystem: ~/.claude/, ~/]
                                       +--> [Child processes: claude, git, open/explorer]
                                       +--> [GitHub API: optional, user-initiated only]
```

**Boundary 1: Network**
The server binds to `127.0.0.1`. No external network access except optional GitHub API search and `claude -p` subprocess.

**Boundary 2: Filesystem**
Reads are scoped to the user's home directory. Writes are scoped to `~/.claude-command-center/` and markdown files under home (validated with `path.resolve()` + prefix check).

**Boundary 3: Child processes**
Shell commands use array-style arguments. No user input is interpolated into command strings. The `CLAUDECODE` env var is stripped before spawning `claude -p` to prevent nesting errors.

## Likely Abuse Paths

### 1. Malicious graph-config.yaml
- **Risk**: A crafted `graph-config.yaml` could contain very long strings, causing memory pressure.
- **Mitigation**: The YAML parser is minimal (line-by-line key:value parsing, not a full YAML parser). Node/edge labels are truncated. The file is only read from known locations (home dir, `.claude/`, project dirs).

### 2. Malicious JSONL session files
- **Risk**: Claude Code session files are parsed line-by-line. A crafted file with extremely long lines could cause memory pressure.
- **Mitigation**: The tail reader uses fixed-size buffer reads (64KB-1MB chunks), not unbounded reads. JSON parse failures are silently skipped.

### 3. Dependency supply chain
- **Risk**: A compromised npm dependency could execute arbitrary code.
- **Mitigation**: Dependencies are pinned via `package-lock.json`. Dependabot alerts are enabled. No `postinstall` scripts. CI uses `npm ci` (respects lockfile exactly). CodeQL scans for known vulnerability patterns.

### 4. Path traversal via markdown editing
- **Risk**: The markdown edit API accepts file paths. An attacker with access to the local dashboard could try to write files outside the home directory.
- **Mitigation**: All paths are validated with `path.resolve()` against `os.homedir()`. Symlink escapes require the user to create the symlink themselves, which is outside the threat model (the user already has shell access).

### 5. GitHub token exposure
- **Risk**: If `GITHUB_TOKEN` is set, it is used for GitHub API calls. It could theoretically be logged.
- **Mitigation**: The token is never written to disk, never included in scanner output, and never sent to the browser. It is only used server-side for authenticated GitHub API requests.

## How This Project Reduces Risk

- Server binds to `127.0.0.1` only (not `0.0.0.0`)
- All API inputs validated with Zod schemas
- File paths validated against home directory boundary
- Shell commands use array arguments where possible; string-interpolated cases (macOS osascript) are constrained by strict Zod input validation (UUID regex)
- Secrets in MCP configs are redacted before storage
- Database URLs have credentials stripped before display
- No telemetry, analytics, or outbound data collection
- No `postinstall` or lifecycle scripts in package.json
- CI runs type checking, tests, and CodeQL on every PR

## Intentionally Out of Scope

- **Network-level attacks**: The server is not designed to be exposed to a network. The `HOST` env var allows binding to `0.0.0.0`, which exposes the unauthenticated server to the local network. This is documented with a warning in the README. Adding authentication is out of scope for a single-user localhost tool.
- **Multi-user access control**: This is a single-user tool. There is no authentication because it runs on localhost for one user.
- **Encrypted storage**: The local JSON database is not encrypted because it contains only metadata (not secrets). The user's filesystem permissions protect it.
- **Sandboxing of `claude -p`**: The AI suggest feature spawns `claude -p` with the user's Claude Code installation. The subprocess has the same permissions as the user.

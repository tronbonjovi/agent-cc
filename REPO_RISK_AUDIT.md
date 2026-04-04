# Repository Risk Audit

Audit date: 2026-03-16
Scope: All tracked files in the repository

## Summary

No critical or high-severity issues found. The repository is safe for open-source publication.

## Findings

### Medium Severity

**M1: Path traversal surface in markdown editing**
- Files: `server/routes/markdown.ts`
- The markdown edit endpoint accepts file paths. Paths are validated with `path.resolve()` + prefix check against `os.homedir()`, which prevents traversal outside the home directory.
- Symlinks within the home directory could theoretically escape this boundary, but that requires the user to create the symlink themselves.
- Status: Mitigated. The intended scope is the user's home directory.

**M2: Optional GitHub token in environment**
- Files: `server/routes/discovery.ts`
- The discovery search uses `process.env.GITHUB_TOKEN` for GitHub API rate limits. The token is never logged or stored.
- Status: Acceptable. Token is optional and user-provided.

### Low Severity

**L1: Shell command spawning**
- Files: `server/routes/ai-suggest.ts`, `server/routes/sessions.ts`, `server/routes/update.ts`, `server/routes/index.ts`
- The server spawns child processes for: `claude -p` (AI suggestions), `git` (updates), platform-specific file openers (`explorer`, `open`, `xdg-open`), and terminal emulators (session resume).
- Most commands use array-style arguments. Exceptions: `execSync` in `update.ts` runs git commands as strings (no user input in these strings), and the macOS `osascript` call interpolates a session ID into an AppleScript string (validated to UUID format via Zod regex `/^[a-f0-9-]{36}$/i`).
- Status: Safe given current validation. The osascript interpolation is constrained by strict input validation.

**L2: JSON database without encryption**
- Files: `server/db.ts`
- Application data is stored as plain JSON at `~/.agent-cc/agent-cc.json`.
- The file contains entity metadata, relationships, and custom graph data. No secrets or credentials are stored.
- Status: Acceptable. This is a local-only tool; encrypting local JSON would add complexity without meaningful security benefit.

**L3: `execSync` in CLI availability check**
- Files: `server/routes/ai-suggest.ts`
- `execSync("claude --version")` is used to check if the Claude CLI is installed. Has a 5-second timeout.
- Status: Safe. No user input involved in the command.

### Informational

**I1: No secrets in codebase**
- Searched for: API keys, tokens, passwords, private URLs, IP addresses, phone numbers, email addresses.
- Result: None found. All paths use `os.homedir()`, not hardcoded values.

**I2: No .env files tracked**
- `.env` is in `.gitignore`. No `.env.example` is provided because the only optional env var (`GITHUB_TOKEN`) is documented in the README.

**I3: Secret redaction in scanners**
- MCP environment variables containing "secret", "password", "token", or "key" are redacted to `***` before storage.
- Database connection URLs have credentials stripped before display.

**I4: Server binds to localhost only**
- `server/index.ts` binds to `127.0.0.1` by default. Not accessible from the network.

**I5: No telemetry or analytics**
- No outbound requests except: optional GitHub API search (user-initiated), `claude -p` subprocess (user-initiated).

**I6: File system access scope**
- Reads: `~/.claude/`, home directory (project discovery), project directories
- Writes: `~/.agent-cc/` (own data), markdown files under home directory (with path validation)

**I7: No postinstall scripts**
- `package.json` contains no lifecycle hooks (`preinstall`, `postinstall`, `prepare`).

**I8: Dependencies are standard packages**
- All 29 runtime dependencies are well-known, widely-used packages (React, Express, Tailwind, Radix UI, etc.).
- No suspicious or obscure dependencies identified.

## Conclusion

The repository contains no secrets, credentials, or personal information. All security-sensitive operations have appropriate mitigations. Safe for public release.

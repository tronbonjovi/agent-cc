# Branding Reference

Current brand name: **Claude Command Center**

This document maps where the brand name appears in the codebase. Use it when rebranding a fork.

---

## User-Facing Text

| File | What | Current Value |
|------|------|---------------|
| `package.json` | npm package name | `claude-command-center` |
| `package.json` | description | `Dashboard for visualizing and managing your Claude Code ecosystem` |
| `README.md` | Title, badges, description | `Claude Command Center` |
| `SETUP.md` | Install instructions | `claude-command-center` |
| `client/src/components/layout.tsx` | Sidebar header (editable by user) | Falls back to `Command Center` |
| `server/db.ts` | Default app name in settings | `Command Center` |
| `server/index.ts` | Console log on startup | `Command Center serving on port ...` |

## Internal References

| File | What |
|------|------|
| `package.json` | `bin.claude-command-center` |
| `.github/workflows/release.yml` | Tarball name `claude-command-center-vX.Y.Z.tar.gz` |
| `CHANGELOG.md` | Project name in header |
| `SECURITY.md` | GitHub advisory URL |
| `CONTRIBUTING.md` | GitHub issue URL |

## Data Locations

| Location | Purpose |
|----------|---------|
| `~/.claude-command-center/` | Default data directory |
| `COMMAND_CENTER_DATA` env var | Override data directory |

## To Rebrand

1. Update `name` in `package.json`
2. Update the `bin` key in `package.json`
3. Find-and-replace `claude-command-center` in README, SETUP, workflows
4. Update the `defaultAppSettings.appName` in `server/db.ts`
5. Update the data directory name in `server/db.ts` (the `dataDir` path)
6. Update GitHub URLs in SECURITY.md, CONTRIBUTING.md

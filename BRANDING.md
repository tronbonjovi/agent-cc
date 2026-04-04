# Branding Reference

Current brand name: **Agent CC** (Agent Control Center)

This document maps where the brand name appears in the codebase. Use it when renaming.

---

## User-Facing Text

| File | What | Current Value |
|------|------|---------------|
| `package.json` | npm package name | `agent-cc` |
| `package.json` | description | `Agent Control Center — local dashboard for managing agentic coding systems` |
| `README.md` | Title, description | `Agent CC` |
| `SETUP.md` | Install instructions | `agent-cc` |
| `client/index.html` | Page title | `Agent CC` |
| `client/src/components/layout.tsx` | Sidebar header (editable by user) | Falls back to `Agent CC` |
| `client/src/App.tsx` | Dynamic document title | Falls back to `Agent CC` |
| `server/db.ts` | Default app name in settings | `Agent CC` |
| `server/index.ts` | Console log on startup | Uses `appSettings.appName` |

## Internal References

| File | What |
|------|------|
| `package.json` | `bin.agent-cc` |
| `docker-compose.yml` | Service name `agent-cc`, volume `agent-cc-data` |
| `CHANGELOG.md` | Project name in header |

## Data Locations

| Location | Purpose |
|----------|---------|
| `~/.agent-cc/` | Default data directory |
| `AGENT_CC_DATA` env var | Override data directory |

## GitHub

| What | Current |
|------|---------|
| Repo name | `tronbonjovi/agent-cc` (pending rename) |
| Repo visibility | Private |

## To Rename Again

1. Pick new name, update this doc
2. Update `name` and `bin` key in `package.json`
3. Find-and-replace `agent-cc` in README, SETUP, CHANGELOG, docker-compose
4. Update `defaultAppSettings.appName` in `server/db.ts`
5. Update data directory path in `server/db.ts`
6. Rename `AGENT_CC_DATA` env var
7. Rename GitHub repo via settings
8. Update client fallbacks in `layout.tsx`, `App.tsx`, `index.html`, `onboarding-wizard.tsx`

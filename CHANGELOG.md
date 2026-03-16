# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Graph configuration system: custom nodes, edges, and entity overrides
- Docker Compose service auto-discovery
- Database URL extraction from MCP environment variables
- Declarative `graph-config.yaml` support for custom graph topology
- AI-assisted graph suggestions via `claude -p` with setup guide for new users
- Custom node types: service, database, api, cicd, deploy, queue, cache
- CRUD API for custom graph nodes and edges (`/api/graph/custom-nodes`, `/api/graph/custom-edges`)
- Live view: context usage bar showing token consumption per session
- Live view: last message, message count, file size, cost estimate per session
- Live view: running and recent agents with task descriptions per session
- Agent deduplication across plugin marketplaces
- Fallback YAML parser for agent definitions with malformed frontmatter
- Hover tooltips on agent stats cards explaining each metric
- Skill names in markdown files (show parent directory name instead of "SKILL.md")
- CI workflow, CodeQL scanning, dependency review, OpenSSF Scorecard
- Release workflow with SHA-256 checksums
- Security policy, contributing guide, code of conduct
- Threat model and public trust documentation

### Fixed
- Agent descriptions missing for agents with colons in YAML frontmatter
- Sidebar agent count showing executions instead of definitions
- AI suggest timeout (increased to 5 minutes, uses Haiku model for speed)
- AI suggest command line too long on Windows (now uses stdin pipe)
- Duplicate agents from overlapping plugin marketplaces

## [1.0.0] - 2026-03-16

### Added
- Initial release
- Auto-discovery of projects, MCP servers, skills, plugins, sessions, agents
- 9 relationship types inferred between entities
- Interactive graph visualization with React Flow and dagre layout
- Session browser with search, filter, sort, and bulk delete
- Agent definitions viewer and execution history
- Live monitoring of active Claude Code sessions
- Markdown editor with version history and backups
- Discovery page for unconfigured projects and MCP servers
- Config viewer for Claude Code settings and permissions
- Activity feed from file watcher
- One-click updates from GitHub remote
- Cross-platform support (Windows, macOS, Linux)
- Server-Sent Events for real-time UI updates
- Zod validation on all API inputs
- Path traversal protection on file operations
- Secret redaction in scanned configuration files

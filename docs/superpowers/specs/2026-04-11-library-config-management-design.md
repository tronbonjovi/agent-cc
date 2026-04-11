# Library Configuration Management — Design Spec

**Date:** 2026-04-11
**Status:** Draft
**Scope:** Skills, Agents, Plugins (MCPs excluded — future project)

## Problem

The Library page shows installed configuration items (skills, agents, plugins) but provides no way to manage them. You can't install, uninstall, or remove items from within Agent CC. The "Saved" and "Marketplace" sub-tabs are empty placeholders. There's no way to discover new items.

## Design

### Subtab Rename

Each entity tab (Skills, Agents, Plugins) gets three sub-tabs:

| Old | New | Purpose |
|-----|-----|---------|
| Installed | **Installed** | Active items Claude Code uses in sessions |
| Saved | **Library** | Stored but inactive items — no impact on Claude Code |
| Marketplace | **Discover** | Search for new items to save to Library |

### Storage Model

Two directory trees under `~/.claude/`:

```
~/.claude/skills/          ← Installed (active, loaded by Claude Code)
~/.claude/agents/          ← Installed
~/.claude/plugins/         ← Installed

~/.claude/library/skills/  ← Library (inactive, invisible to Claude Code)
~/.claude/library/agents/  ← Library
~/.claude/library/plugins/ ← Library
```

Files in `~/.claude/library/` have zero impact on Claude Code performance, token usage, or context. They're just files on disk that Agent CC manages. Only when "Installed" (moved to the active directory) does Claude Code see them.

### Item States

An item exists in one of three states:

1. **External** — exists on GitHub, a marketplace, or a hub. Not on your machine.
2. **In Library (uninstalled)** — downloaded to `~/.claude/library/<type>/`, editable, no Claude Code impact.
3. **Installed** — in `~/.claude/<type>/`, active in Claude Code sessions.

### Actions Per Tab

**Installed tab:**
- **Uninstall** — moves item from active directory to `~/.claude/library/<type>/`. Immediately removes from Claude Code context.
- **Edit** — opens the file in the markdown editor.

**Library tab:**
- **Install** — moves/copies item from `~/.claude/library/<type>/` to `~/.claude/<type>/`. Makes it active in Claude Code.
- **Edit** — opens the file in the markdown editor.
- **Remove** — deletes the file from Library entirely. Requires confirmation dialog.

**Discover tab:**
- **Save to Library** — downloads the item to `~/.claude/library/<type>/`. Does not install it.
- Search interface with results displayed as entity cards.

### Discover Tab — Search Sources

The Claude Code extension ecosystem is large and active. Discover searches structured sources first, falling back to GitHub only as a last resort.

**Skills — sources (priority order):**
1. **Anthropic official** — `anthropics/skills` repo (reference skills, defines the SKILL.md standard)
2. **Community hubs** — claudeskillhub.ai, skillsmp.com (700k+ skills), skillhub.club (7k+ skills), claudeskills.info
3. **Cross-type directories** — buildwithclaude.com (497+ extensions, also a CLI-installable marketplace), claudemarketplaces.com (quality-filtered, daily scans)
4. **Awesome lists** — awesome-claude-code (38k stars), awesome-agent-skills (15k stars), antigravity-awesome-skills (32k stars)
5. **GitHub search (fallback)**

**Plugins — sources (priority order):**
1. **Anthropic official** — `anthropics/claude-plugins-official` (55+ vetted plugins), `anthropics/claude-plugins-community` (security-scanned community plugins)
2. **Community directories** — buildwithclaude.com, claudemarketplaces.com, claudepluginhub.com, aitmpl.com
3. **Awesome lists** — awesome-claude-code, awesome-claude-plugins (ComposioHQ)
4. **GitHub search (fallback)**

**Agents — sources (priority order):**
1. **Community directories** — buildwithclaude.com (covers agents), awesome-claude-code-subagents (VoltAgent, 17k stars, 100+ subagents)
2. **Awesome lists** — awesome-claude-code
3. **GitHub search (fallback)**

**Implementation note:** For v1, we don't need to integrate every source. Pick the best 1-2 per entity type that have usable web content or APIs, and build the Discover UI around those. The architecture should make it easy to add more sources later. Sources that are web-only (no API) can be integrated via web scraping or simply linked out with a "Browse on [source]" button.

### Safety Disclaimer

The Discover tab displays a persistent disclaimer:

> "Please use caution when installing code from online sources. Review files before installing. [Scan with VirusTotal](https://www.virustotal.com/)"

### Install/Uninstall Mechanics

**Install** = copy file(s) from `~/.claude/library/<type>/<item>/` to `~/.claude/<type>/<item>/`
**Uninstall** = move file(s) from `~/.claude/<type>/<item>/` to `~/.claude/library/<type>/<item>/`
**Remove** = delete file(s) from `~/.claude/library/<type>/<item>/`
**Save from Discover** = download file(s) to `~/.claude/library/<type>/<item>/`

After any install/uninstall action, trigger a rescan so the UI reflects the change immediately.

### Entity Card Updates

The existing `EntityCard` component already supports status badges and action buttons. Changes:

- **Installed cards** get "Uninstall" and "Edit" action buttons.
- **Library cards** get "Install", "Edit", and "Remove" action buttons.
- **Discover cards** get a "Save to Library" button.
- Status badge maps: Installed → green, Library → blue, External → gray (existing pattern).

### API Endpoints (New)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/library/:type/:id/install` | Move from library to active |
| POST | `/api/library/:type/:id/uninstall` | Move from active to library |
| DELETE | `/api/library/:type/:id` | Remove from library |
| POST | `/api/library/:type/save` | Download from external source to library |
| GET | `/api/library/:type` | List library (uninstalled) items |
| GET | `/api/discover/:type/search` | Search GitHub/marketplaces |

### Library Scanner

A new scanner (`server/scanner/library-scanner.ts`) reads `~/.claude/library/` on startup and during rescans. It returns items in the same entity format as the existing scanners but tagged with `status: "library"` so the UI can differentiate.

### What's NOT in Scope

- **MCP servers** — different config model (JSON entries in `.mcp.json`, not standalone files). Huge ecosystem exists (official MCP Registry, Smithery with 7k+ servers, mcp.so with 19k+, PulseMCP, Glama, etc.) but the install/uninstall model is fundamentally different. Future project with its own spec.
- **Building or maintaining registries** — we consume existing community sources, we don't create our own.
- **Auto-update** — no mechanism to check if a Library item has a newer version upstream.
- **Dependency resolution** — installing a skill doesn't auto-install its dependencies (if any).

### File Format Expectations

- **Skills:** Directory with `SKILL.md` (YAML frontmatter + markdown body)
- **Agents:** Single `.md` file (YAML frontmatter + markdown body)
- **Plugins:** Directory structure varies — marketplace plugins have their own layout. We copy the entire plugin directory.

### Edge Cases

- **Name collision on install:** If `~/.claude/skills/my-skill/` already exists when installing from Library, warn and offer to overwrite or skip.
- **Orphaned library items:** If someone manually puts files in `~/.claude/library/`, the scanner picks them up. No special handling needed.
- **Library directory doesn't exist:** Create `~/.claude/library/<type>/` on first save/uninstall operation. Don't create empty directories on startup.
- **Existing installed items without library copy:** Items installed before this feature have no library copy. Uninstalling them creates the library copy on the fly (move, not copy). Reinstalling copies back.

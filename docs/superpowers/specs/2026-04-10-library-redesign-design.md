# Spec 2: Library Redesign

## Summary

Consolidate five separate entity pages (Skills, Plugins, MCP Servers, Agents, Markdown/File Editor) into a single Library page with tabs. Each entity type gets a consistent three-tier presentation: Saved (local but not active), Installed (active and in use), and Marketplace (discover and add new ones). This replaces the current scattered nav entries and provides a uniform browsing experience across all entity types.

## Context

Currently, MCP Servers, Skills, Plugins, Agents, and Markdown files each have their own standalone page with their own nav entry. After Spec 1 (Nav Restructure), these pages lose their nav entries but remain accessible via direct URL. This spec absorbs them into a single `/library` page.

## Navigation

Library is the third item in the sidebar (after Dashboard, Projects). The route is `/library` with optional tab parameter: `/library?tab=skills`, `/library?tab=plugins`, etc.

## Page Structure

### Tab Bar

Horizontal tabs across the top of the Library page:

| Tab | Content |
|-----|---------|
| Skills | Skill definitions with preview |
| Plugins | Plugins with category colors |
| MCP Servers | MCP servers with health indicators |
| Agents | Agent definitions and execution history |
| File Editor | Markdown file browser and editor (current markdown-files.tsx functionality) |

Default tab: Skills (or whichever tab was last visited, stored in URL).

### Three-Tier Pattern Per Entity Tab

Each entity tab (Skills, Plugins, MCP Servers, Agents) follows the same layout pattern:

**Installed** (top section, most prominent)
- Entities that are currently active/configured and in use
- Status indicators (healthy, degraded, error for MCP servers; active/inactive for others)
- Quick actions: configure, disable, remove
- This is what the current pages mostly show today

**Saved** (middle section)
- Entities that are downloaded/local but not currently active
- "Install" or "Enable" action to move to Installed
- Useful for things you've used before but aren't running now

**Marketplace** (bottom section or separate sub-view)
- Discover and add new entities
- For entity types that have public registries (MCP servers via mcp.so, plugins, etc.)
- For entity types without marketplaces, this section shows a helpful message or link
- Search, filter, preview before installing

Not every entity type will have all three tiers populated initially. The UI pattern is consistent, but some tiers may show "No saved skills" or "Marketplace coming soon" — that's fine. The structure is there for when data exists.

### File Editor Tab

The File Editor tab preserves the current Markdown page functionality:
- File browser with category filters (claude-md, memory, skill, readme, other)
- Memory type badges
- Content search with highlighting
- Full markdown editor (current markdown-edit.tsx)
- Context summary generation
- Metadata editor (YAML frontmatter)
- File operations (create, delete, export)

This tab is functionally different from the other four (it's an editor, not a catalog) but it belongs here because it's how you interact with the files that make up skills, agent definitions, CLAUDE.md configs, etc.

## Uniform Card Layout

All entity types use the same card component structure for consistency:

- **Icon/Avatar** — entity type indicator
- **Name** — primary label
- **Description** — one-line summary
- **Status badge** — installed/saved/available
- **Health indicator** — for MCP servers (dot: green/yellow/red)
- **Category/tags** — filterable metadata
- **Quick actions** — contextual to the entity's state

The card component is shared across all tabs. Each entity type provides its own data shape that maps to the common card props. Entity-specific details (like MCP server health) render conditionally.

## Data Sources

Each entity tab pulls from the existing API endpoints:
- Skills: `/api/skills`
- Plugins: `/api/plugins`
- MCP Servers: `/api/mcps`
- Agents: `/api/agents`
- Markdown: `/api/markdown`

No new API endpoints are needed for the initial implementation. The three-tier split (installed vs saved vs marketplace) can be derived from existing data:
- **Installed:** entities found in active configuration
- **Saved:** entities found on disk but not in active config
- **Marketplace:** future feature, initially shows placeholder

## Routing

| Route | Behavior |
|-------|----------|
| `/library` | Library page, default tab (Skills) |
| `/library?tab=plugins` | Library page, Plugins tab |
| `/library?tab=mcps` | Library page, MCP Servers tab |
| `/library?tab=agents` | Library page, Agents tab |
| `/library?tab=editor` | Library page, File Editor tab |
| `/skills` | Redirect to `/library?tab=skills` |
| `/plugins` | Redirect to `/library?tab=plugins` |
| `/mcps` | Redirect to `/library?tab=mcps` |
| `/agents` | Redirect to `/library?tab=agents` |
| `/markdown` | Redirect to `/library?tab=editor` |
| `/markdown/:id` | Keep as-is (editor detail route) or nest under `/library/edit/:id` |

## Migration Strategy

1. Build the Library page shell with tabs
2. Move existing page content into tab components (lift, don't rewrite)
3. Add the three-tier layout pattern per tab
4. Add the shared card component
5. Convert old standalone pages to redirects
6. Remove old routes from App.tsx once redirects are in place

The existing page components (mcps.tsx, skills.tsx, etc.) can be refactored into tab panel components. This is mostly reorganization, not a rewrite.

## Out of Scope

- Marketplace API integration (placeholder UI only)
- Actual install/uninstall functionality (depends on Claude Code CLI capabilities)
- Responsive design (Spec 3)
- Analytics page changes (Spec 4)

## Dependencies

- **Spec 1 must be complete first** — Library needs the `/library` route and nav entry that Spec 1 creates
- No dependency on Spec 3 or 4

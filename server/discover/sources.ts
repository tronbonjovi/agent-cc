/**
 * Discover source registry — structured community sources with priority ordering.
 * GitHub search is always the last (fallback) source for every entity type.
 */

export interface DiscoverSource {
  id: string;
  name: string;
  url: string;
  type: "api" | "web" | "github";
  entityTypes: ("skills" | "agents" | "plugins")[];
  searchable: boolean;
  description: string;
}

/**
 * Sources in priority order. Community hubs first, GitHub fallback last.
 */
const SOURCES: DiscoverSource[] = [
  // Skills hubs
  {
    id: "claudeskillhub",
    name: "Claude Skill Hub",
    url: "https://claudeskillhub.ai",
    type: "web",
    entityTypes: ["skills"],
    searchable: false,
    description: "Community skill directory for Claude Code",
  },
  {
    id: "skillsmp",
    name: "Skills Marketplace",
    url: "https://skillsmp.com",
    type: "web",
    entityTypes: ["skills"],
    searchable: false,
    description: "Browse and share Claude Code skills",
  },
  {
    id: "skillhubclub",
    name: "Skill Hub Club",
    url: "https://skillhub.club",
    type: "web",
    entityTypes: ["skills"],
    searchable: false,
    description: "Curated skill collections for Claude",
  },

  // Plugin repos (searchable via GitHub)
  {
    id: "claude-plugins-official",
    name: "Official Plugins",
    url: "https://github.com/anthropics/claude-plugins-official",
    type: "github",
    entityTypes: ["plugins"],
    searchable: true,
    description: "Anthropic-maintained Claude plugins",
  },
  {
    id: "claude-plugins-community",
    name: "Community Plugins",
    url: "https://github.com/anthropics/claude-plugins-community",
    type: "github",
    entityTypes: ["plugins"],
    searchable: true,
    description: "Community-contributed Claude plugins",
  },

  // Cross-type hub
  {
    id: "buildwithclaude",
    name: "Build with Claude",
    url: "https://buildwithclaude.com",
    type: "web",
    entityTypes: ["skills", "agents", "plugins"],
    searchable: false,
    description: "Community hub for Claude extensions and tools",
  },

  // Fallback — always last
  {
    id: "github-search",
    name: "GitHub Search",
    url: "https://github.com/search",
    type: "github",
    entityTypes: ["skills", "agents", "plugins"],
    searchable: true,
    description: "Search all of GitHub for community projects",
  },
];

type EntityType = "skills" | "agents" | "plugins";

/** All sources for a given entity type, in priority order. */
export function getSourcesForType(type: EntityType): DiscoverSource[] {
  return SOURCES.filter((s) => s.entityTypes.includes(type));
}

/** Only searchable sources (API/GitHub with search support). */
export function getSearchableSources(type: EntityType): DiscoverSource[] {
  return SOURCES.filter((s) => s.entityTypes.includes(type) && s.searchable);
}

/** Only web (browse/link-out) sources — not searchable. */
export function getBrowseSources(type: EntityType): DiscoverSource[] {
  return SOURCES.filter((s) => s.entityTypes.includes(type) && !s.searchable);
}

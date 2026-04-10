/** Library page tab definitions and URL sync logic. */

export const LIBRARY_TABS = [
  { id: "skills", label: "Skills" },
  { id: "plugins", label: "Plugins" },
  { id: "mcps", label: "MCP Servers" },
  { id: "agents", label: "Agents" },
  { id: "editor", label: "Info" },
  { id: "discover", label: "Discover" },
  { id: "prompts", label: "Prompts" },
  { id: "bash-kb", label: "Bash KB" },
] as const;

export type LibraryTabId = (typeof LIBRARY_TABS)[number]["id"];

export const LIBRARY_TAB_IDS: readonly string[] = LIBRARY_TABS.map(t => t.id);

export const DEFAULT_TAB: LibraryTabId = "skills";

/** Validate a tab id from URL search params. Returns the id if valid, otherwise the default. */
export function resolveTab(raw: string | null | undefined): LibraryTabId {
  if (raw && LIBRARY_TAB_IDS.includes(raw)) return raw as LibraryTabId;
  return DEFAULT_TAB;
}

/** Get the label for a tab id. */
export function tabLabel(id: LibraryTabId): string {
  return LIBRARY_TABS.find(t => t.id === id)?.label ?? id;
}

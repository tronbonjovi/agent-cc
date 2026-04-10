import { useState, useEffect } from "react";
import { BookOpen, Puzzle, Server, Bot, FileEdit } from "lucide-react";
import { LIBRARY_TABS, resolveTab, type LibraryTabId } from "@/lib/library-tabs";
import SkillsTab from "@/components/library/skills-tab";
import PluginsTab from "@/components/library/plugins-tab";
import McpsTab from "@/components/library/mcps-tab";
import AgentsTab from "@/components/library/agents-tab";

const TAB_ICONS: Record<LibraryTabId, React.ElementType> = {
  skills: BookOpen,
  plugins: Puzzle,
  mcps: Server,
  agents: Bot,
  editor: FileEdit,
};

/** Read ?tab= from current URL. */
function getTabFromUrl(): LibraryTabId {
  const params = new URLSearchParams(window.location.search);
  return resolveTab(params.get("tab"));
}

/** Update ?tab= in the URL without a full navigation. */
function setTabInUrl(tab: LibraryTabId) {
  const url = new URL(window.location.href);
  url.searchParams.set("tab", tab);
  window.history.replaceState({}, "", url.toString());
}

export default function Library() {
  const [activeTab, setActiveTab] = useState<LibraryTabId>(getTabFromUrl);

  // Sync URL on tab change
  useEffect(() => {
    setTabInUrl(activeTab);
  }, [activeTab]);

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Library</h1>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border">
        {LIBRARY_TABS.map((tab) => {
          const TabIcon = TAB_ICONS[tab.id];
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab.id
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <TabIcon className="h-3.5 w-3.5 inline mr-1.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "skills" && <SkillsTab />}
      {activeTab === "plugins" && <PluginsTab />}
      {activeTab === "mcps" && <McpsTab />}
      {activeTab === "agents" && <AgentsTab />}
      {activeTab === "editor" && (
        <div className="flex flex-col items-center justify-center h-[50vh] gap-4">
          <FileEdit className="h-12 w-12 text-muted-foreground/40" />
          <h2 className="text-xl font-semibold text-muted-foreground">File Editor</h2>
          <p className="text-muted-foreground text-sm">
            Editor tab coming in a future update.
          </p>
        </div>
      )}
    </div>
  );
}

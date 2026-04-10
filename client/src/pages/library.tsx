import { useState, useEffect } from "react";
import { BookOpen, Puzzle, Server, Bot, FileEdit } from "lucide-react";
import { LIBRARY_TABS, resolveTab, type LibraryTabId } from "@/lib/library-tabs";
import { PageContainer } from "@/components/page-container";
import { useBreakpoint, isMobile } from "@/hooks/use-breakpoint";
import SkillsTab from "@/components/library/skills-tab";
import PluginsTab from "@/components/library/plugins-tab";
import McpsTab from "@/components/library/mcps-tab";
import AgentsTab from "@/components/library/agents-tab";
import FileEditorTab from "@/components/library/file-editor-tab";

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
  const bp = useBreakpoint();
  const mobile = isMobile(bp);

  // Sync URL on tab change
  useEffect(() => {
    setTabInUrl(activeTab);
  }, [activeTab]);

  return (
    <PageContainer title="Library">
      {/* Tab bar — scrollable at md, wraps at sm/xs */}
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-1 border-b border-border overflow-x-auto whitespace-nowrap scrollbar-thin">
        {LIBRARY_TABS.map((tab) => {
          const TabIcon = TAB_ICONS[tab.id];
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px flex-shrink-0 ${
                activeTab === tab.id
                  ? "border-blue-500 text-blue-400"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <TabIcon className="h-3.5 w-3.5 inline mr-1.5" />
              {!mobile && tab.label}
              {mobile && tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "skills" && <SkillsTab />}
      {activeTab === "plugins" && <PluginsTab />}
      {activeTab === "mcps" && <McpsTab />}
      {activeTab === "agents" && <AgentsTab />}
      {activeTab === "editor" && <FileEditorTab />}
    </PageContainer>
  );
}

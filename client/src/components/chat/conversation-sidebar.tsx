// client/src/components/chat/conversation-sidebar.tsx
//
// Chat session sidebar — chat-scanner-unification task003.
//
// Simplified from the old multi-source grouping sidebar to a flat list of
// chat-originated sessions. Sessions come from two places:
//   1. Open tabs (from the chat-tabs store) — always shown at the top.
//   2. Chat-originated sessions (from GET /api/chat/sessions) — the
//      chatSessions mapping in db.ts, newest first.
//
// The old InteractionSource grouping, planned-source placeholders, filter
// chips, and import modal are all removed. The sidebar is now a simple
// session list.

import { useQuery } from '@tanstack/react-query';
import { useChatTabsStore } from '@/stores/chat-tabs-store';

/**
 * Shape returned by GET /api/chat/sessions — one entry per chat-originated
 * session from the chatSessions mapping in db.ts.
 */
interface ChatSessionEntry {
  conversationId: string;
  sessionId: string;
  title: string;
  createdAt: string;
}

interface ChatSessionsResponse {
  sessions: ChatSessionEntry[];
}

async function fetchChatSessions(): Promise<ChatSessionsResponse> {
  const res = await fetch('/api/chat/sessions');
  if (!res.ok) {
    throw new Error(`GET /api/chat/sessions failed: ${res.status}`);
  }
  return res.json();
}

export function ConversationSidebar() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['chat-sessions'],
    queryFn: fetchChatSessions,
    staleTime: 15_000,
  });

  const tabs = useChatTabsStore((s) => s.tabs);
  const activeId = useChatTabsStore((s) => s.activeTabId);
  const setActiveTab = useChatTabsStore((s) => s.setActiveTab);
  const openTab = useChatTabsStore((s) => s.openTab);

  const sessions = data?.sessions ?? [];

  // Build a set of conversation IDs that are already open as tabs so we
  // can skip them in the "recent sessions" list below.
  const openTabIds = new Set(tabs.map((t) => t.conversationId));

  // Recent sessions that are NOT already open as tabs.
  const recentSessions = sessions.filter(
    (s) => !openTabIds.has(s.conversationId),
  );

  const handleSessionClick = async (conversationId: string, title: string) => {
    try {
      await openTab(conversationId, title);
      await setActiveTab(conversationId);
    } catch (err) {
      console.error('[conversation-sidebar] click failed', err);
    }
  };

  return (
    <aside
      className="h-full w-full overflow-y-auto border-r bg-muted/20 text-sm"
      data-testid="conversation-sidebar"
    >
      {/* Open tabs section */}
      <div className="sticky top-0 z-10 border-b bg-background/95 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Chat Sessions
      </div>

      {tabs.length > 0 && (
        <div className="border-b">
          <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
            Open tabs
          </div>
          <ul>
            {tabs.map((tab) => (
              <li key={tab.conversationId}>
                <button
                  type="button"
                  className={`block w-full truncate px-4 py-1.5 text-left text-xs hover:bg-muted/60 ${
                    tab.conversationId === activeId
                      ? 'bg-muted/40 text-foreground font-medium'
                      : 'text-muted-foreground'
                  }`}
                  onClick={() => handleSessionClick(tab.conversationId, tab.title)}
                  data-testid={`sidebar-tab-${tab.conversationId}`}
                >
                  {tab.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent chat sessions section */}
      <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
        Recent sessions
      </div>

      {isLoading && (
        <div className="px-3 py-2 text-xs text-muted-foreground" role="status">
          Loading...
        </div>
      )}
      {isError && (
        <div className="px-3 py-2 text-xs text-destructive" role="alert">
          Failed to load sessions
        </div>
      )}

      {!isLoading && !isError && recentSessions.length === 0 && (
        <div className="px-4 py-2 text-xs italic text-muted-foreground">
          No recent sessions
        </div>
      )}

      {recentSessions.length > 0 && (
        <ul>
          {recentSessions.map((session) => (
            <li key={session.conversationId}>
              <button
                type="button"
                className="block w-full truncate px-4 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/60"
                onClick={() =>
                  handleSessionClick(session.conversationId, session.title)
                }
                data-testid={`sidebar-session-${session.conversationId}`}
              >
                <div className="truncate">{session.title}</div>
                <div className="text-xs text-muted-foreground/60">
                  {new Date(session.createdAt).toLocaleDateString()}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

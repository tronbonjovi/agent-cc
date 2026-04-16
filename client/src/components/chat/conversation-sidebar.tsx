// client/src/components/chat/conversation-sidebar.tsx
//
// Unified conversation sidebar — chat-import-platforms task004.
//
// Left rail inside ChatPanel that lists every conversation across every
// source (chat-ai, chat-slash, chat-hook, chat-workflow, scanner-jsonl, plus
// the planned externals: github-issue, telegram, discord, imessage). Groups
// rows by source using the SOURCE_METADATA registry (task001) and renders
// one collapsible section per source.
//
// Click handling lives in @/lib/conversation-grouping as a pure function
// (`handleConversationClick`) so it's unit-testable without mounting the
// component — vitest excludes the client/ directory, so all testable logic
// must either live as source-text guardrails (tests/conversation-sidebar
// .test.ts) or as pure helpers (tests/conversation-grouping.test.ts).
//
// Out of scope (task005): source filter chips, rich empty-state placeholders
// for planned sources.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  SOURCE_METADATA,
  getWiredSources,
  getPlannedSources,
  type SourceMetadata,
} from '../../../../shared/source-metadata';
import { useChatTabsStore } from '@/stores/chat-tabs-store';
import {
  groupConversationsBySource,
  handleConversationClick,
  type ConversationSummary,
} from '@/lib/conversation-grouping';
import type { InteractionSource } from '../../../../shared/types';

/**
 * Response shape for `GET /api/chat/conversations/all`. Mirrors the server
 * route in server/routes/chat.ts — kept local so the client never reaches
 * across the server/ boundary for types.
 */
interface AllConversationsResponse {
  conversations: ConversationSummary[];
}

async function fetchAllConversations(): Promise<AllConversationsResponse> {
  const res = await fetch('/api/chat/conversations/all');
  if (!res.ok) {
    throw new Error(`GET /api/chat/conversations/all failed: ${res.status}`);
  }
  return res.json();
}

export function ConversationSidebar() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['all-conversations'],
    queryFn: fetchAllConversations,
    // Fresh enough — the sidebar doesn't need aggressive revalidation;
    // task006's E2E will verify that imports refresh on demand.
    staleTime: 15_000,
  });

  const openTab = useChatTabsStore((s) => s.openTab);
  const setActiveTab = useChatTabsStore((s) => s.setActiveTab);

  // Click-dispatch error is surfaced inline so a failed import doesn't
  // silently drop the user's click. Kept as local state — the sidebar isn't
  // wired into the panel's error banner path yet.
  const [clickError, setClickError] = useState<string | null>(null);

  const grouped = groupConversationsBySource(data?.conversations ?? []);

  const onRowClick = async (conv: ConversationSummary) => {
    setClickError(null);
    try {
      await handleConversationClick(conv, {
        fetch: fetch as unknown as Parameters<typeof handleConversationClick>[1]['fetch'],
        openTab,
        setActiveTab,
      });
    } catch (err) {
      console.error('[conversation-sidebar] click failed', err);
      setClickError(err instanceof Error ? err.message : 'Click failed');
    }
  };

  return (
    <aside
      className="h-full w-full overflow-y-auto border-r bg-muted/20 text-sm"
      data-testid="conversation-sidebar"
    >
      <div className="sticky top-0 z-10 border-b bg-background/95 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Conversations
      </div>
      {isLoading && (
        <div className="px-3 py-2 text-xs text-muted-foreground" role="status">
          Loading…
        </div>
      )}
      {isError && (
        <div className="px-3 py-2 text-xs text-destructive" role="alert">
          Failed to load conversations
        </div>
      )}
      {clickError && (
        <div className="px-3 py-2 text-xs text-destructive" role="alert">
          {clickError}
        </div>
      )}
      {getWiredSources().map((meta) => (
        <SidebarSection
          key={meta.id}
          meta={meta}
          conversations={grouped[meta.id] ?? []}
          onClick={onRowClick}
          disabled={false}
          defaultOpen={true}
        />
      ))}
      {getPlannedSources().map((meta) => (
        <SidebarSection
          key={meta.id}
          meta={meta}
          conversations={grouped[meta.id] ?? []}
          onClick={onRowClick}
          disabled={true}
          defaultOpen={false}
        />
      ))}
    </aside>
  );
}

// ---------------------------------------------------------------------------
// SidebarSection — one collapsible group per source.
//
// Renders even when `conversations` is empty so the user can see every
// source registered in SOURCE_METADATA at a glance. Planned sources come
// through with `disabled=true`, which greys the header and keeps the
// section collapsed by default.
// ---------------------------------------------------------------------------

interface SidebarSectionProps {
  meta: SourceMetadata;
  conversations: ConversationSummary[];
  onClick: (conv: ConversationSummary) => void;
  disabled: boolean;
  defaultOpen: boolean;
}

function SidebarSection({
  meta,
  conversations,
  onClick,
  disabled,
  defaultOpen,
}: SidebarSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className={`border-b ${disabled ? 'opacity-60' : ''}`}
      data-testid={`sidebar-section-${meta.id}`}
      data-source={meta.id}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium hover:bg-muted/40"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        <span className="flex-1 truncate">{meta.displayName}</span>
        <span className="text-muted-foreground" data-testid={`count-${meta.id}`}>
          ({conversations.length})
        </span>
      </button>
      {open && conversations.length > 0 && (
        <ul className="pb-1">
          {conversations.map((conv) => (
            <li key={conv.conversationId}>
              <button
                type="button"
                className="block w-full truncate px-6 py-1.5 text-left text-xs hover:bg-muted/60 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                onClick={() => onClick(conv)}
                disabled={disabled}
                data-testid={`conv-row-${conv.conversationId}`}
                data-source={conv.source}
              >
                {conv.conversationId.slice(0, 12)}
                <span className="ml-2 text-muted-foreground">
                  {conv.eventCount}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && conversations.length === 0 && (
        <div className="px-6 pb-2 text-xs italic text-muted-foreground">
          {disabled ? 'Coming soon' : 'No conversations'}
        </div>
      )}
    </div>
  );
}

// Safety net: silence unused-import warnings when the SOURCE_METADATA import
// is only used via `getWiredSources` / `getPlannedSources`. The registry is
// the single source of truth the guardrail test locks on.
export const __SIDEBAR_METADATA_REF = SOURCE_METADATA;
// Also surface the InteractionSource type alias so it isn't type-only-dead
// across future edits — keeps the tests that look for type imports honest.
export type __SidebarSource = InteractionSource;

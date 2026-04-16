// client/src/components/chat/import-session-modal.tsx
//
// Import-session picker modal (chat-import-platforms-task003).
//
// Lists past scanner-ingested conversations and, on click, calls the
// task002 `/api/chat/import` endpoint to clone the source into a new
// `chat-ai` conversation, then opens that new conversation as a chat tab
// via the persisted tab store and closes the modal.
//
// Pure handler split:
//   The click handler is implemented as a pure async function
//   `handleImportSession` that takes its collaborators (fetch, openTab,
//   closeModal, and a tab-title builder) as arguments. That keeps the
//   unit tests in `tests/import-session-modal.test.ts` straightforward —
//   vitest excludes `client/` so we can't render the component, but we
//   can import and unit-test the pure function directly.
//
// Notes on the title:
//   - Scanner sessions expose `firstMessage` (the first user prompt) +
//     `slug` (derived), never a real `title`. We prefer `firstMessage`,
//     fall back to `slug`, then to `id` — whichever the server gives us.
//   - The final tab title is `"Imported: <source>"` so users can tell
//     imported tabs apart from fresh chats at a glance. We also trim long
//     first-messages so the tab chip doesn't blow up the tab bar.
//
// Scope discipline:
//   - No source filter UI (planned for task005+).
//   - No sidebar integration (task004 owns that).
//   - No new endpoint — we call the existing `/api/sessions` list and the
//     task002 `/api/chat/import` POST.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useChatTabsStore } from '@/stores/chat-tabs-store';

/**
 * Minimum shape the modal needs from `/api/sessions`. Kept loose so we
 * don't duplicate the full `Session` shape from `shared/types.ts` — we
 * only need id + a display label + a sort/display timestamp.
 */
interface ScannerSessionSummary {
  id: string;
  firstMessage?: string;
  slug?: string;
  lastTs?: string | null;
  messageCount?: number;
}

interface SessionsListResponse {
  sessions: ScannerSessionSummary[];
}

/** Max characters of `firstMessage` we keep in a tab title before the ellipsis. */
const MAX_TITLE_CHARS = 60;

/**
 * Derive the user-visible label for a scanner session row. Uses the first
 * message when present, falls back to the slug, then the raw id. Pure so
 * the modal test can pin the fallback order.
 */
export function buildSessionDisplayLabel(
  session: Pick<ScannerSessionSummary, 'id' | 'firstMessage' | 'slug'>,
): string {
  const first = session.firstMessage?.trim();
  if (first) return first;
  const slug = session.slug?.trim();
  if (slug) return slug;
  return session.id;
}

/**
 * Build the title for a freshly-imported chat tab. Prefixes with
 * `"Imported: "` so the user can distinguish imported tabs from new
 * chats, and trims long first-messages so the chip stays readable.
 */
export function buildImportedTabTitle(sourceLabel: string): string {
  const trimmed = sourceLabel.trim();
  const label =
    trimmed.length > MAX_TITLE_CHARS
      ? `${trimmed.slice(0, MAX_TITLE_CHARS - 1).trimEnd()}…`
      : trimmed;
  return `Imported: ${label || 'session'}`;
}

/**
 * Dependencies the pure `handleImportSession` function needs. Passed in
 * rather than imported so the unit test can provide doubles without
 * touching global state.
 */
export interface ImportSessionDeps {
  /** `window.fetch`-shaped POST client. */
  fetchFn: typeof fetch;
  /** Tab-store opener; mirrors `useChatTabsStore.openTab`. */
  openTab: (conversationId: string, title: string) => Promise<void>;
  /** Close the modal (typically `() => onOpenChange(false)`). */
  closeModal: () => void;
  /** Optional override for tab title — defaults to `buildImportedTabTitle`. */
  buildTitle?: (sourceLabel: string) => string;
}

/**
 * Pure import-click handler — testable in `tests/import-session-modal.test.ts`.
 *
 * Responsibilities:
 *   1. POST to `/api/chat/import` with `{ sourceConversationId }`.
 *   2. Throw on a non-2xx response so the caller can surface the error.
 *   3. Open a new tab in the chat-tabs store for the returned
 *      `newConversationId` — `openTab` already sets it active, so we don't
 *      call `setActiveTab` separately (avoids a redundant PUT).
 *   4. Close the modal on success.
 *
 * Errors bubble up to the component's catch block. We deliberately do
 * *not* close the modal on failure so the user can retry.
 */
export async function handleImportSession(
  sourceConversationId: string,
  sourceLabel: string,
  deps: ImportSessionDeps,
): Promise<{ newConversationId: string; eventCount: number }> {
  const res = await deps.fetchFn('/api/chat/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceConversationId }),
  });
  if (!res.ok) {
    throw new Error(`import failed: ${res.status}`);
  }
  const body = (await res.json()) as {
    newConversationId: string;
    eventCount: number;
  };
  const title = (deps.buildTitle ?? buildImportedTabTitle)(sourceLabel);
  await deps.openTab(body.newConversationId, title);
  deps.closeModal();
  return body;
}

interface ImportSessionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportSessionModal({
  open,
  onOpenChange,
}: ImportSessionModalProps) {
  // Lazy-load the list on first open — no point hammering `/api/sessions`
  // for users who never touch the import button.
  const { data, isLoading, isError } = useQuery<SessionsListResponse>({
    queryKey: ['import-session-modal', 'scanner-sessions'],
    enabled: open,
    queryFn: async () => {
      // `hideEmpty=true` filters JSONL shells with no messages so the
      // picker doesn't show stubs you can't actually import.
      const res = await fetch('/api/sessions?hideEmpty=true&limit=100');
      if (!res.ok) {
        throw new Error(`GET /api/sessions failed: ${res.status}`);
      }
      return (await res.json()) as SessionsListResponse;
    },
  });

  const openTab = useChatTabsStore((s) => s.openTab);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const closeModal = () => onOpenChange(false);

  const onPickSession = async (session: ScannerSessionSummary) => {
    if (importingId) return;
    setImportingId(session.id);
    setImportError(null);
    try {
      await handleImportSession(session.id, buildSessionDisplayLabel(session), {
        fetchFn: fetch,
        openTab,
        closeModal,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setImportError(message);
      console.error('[import-session-modal] import failed', err);
    } finally {
      setImportingId(null);
    }
  };

  const sessions = data?.sessions ?? [];
  const showEmptyState = !isLoading && !isError && sessions.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl"
        data-testid="import-session-modal"
      >
        <DialogHeader>
          <DialogTitle>Import past session</DialogTitle>
          <DialogDescription>
            Pick a scanner-indexed session to clone into a new chat tab.
            Your original session stays untouched.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="h-96 rounded-md border">
          {isLoading && (
            <div className="p-4 text-sm text-muted-foreground">
              Loading sessions…
            </div>
          )}
          {isError && (
            <div className="p-4 text-sm text-destructive">
              Failed to load sessions. Try again.
            </div>
          )}
          {showEmptyState && (
            <div
              className="p-4 text-sm text-muted-foreground"
              data-testid="import-session-modal-empty"
            >
              No sessions found.
            </div>
          )}
          {sessions.map((session) => {
            const label = buildSessionDisplayLabel(session);
            const isImporting = importingId === session.id;
            return (
              <button
                key={session.id}
                type="button"
                disabled={!!importingId}
                className="w-full text-left p-3 border-b last:border-b-0 hover:bg-muted disabled:opacity-60 disabled:cursor-not-allowed"
                onClick={() => onPickSession(session)}
                data-testid={`import-session-row-${session.id}`}
              >
                <div className="font-medium truncate">{label}</div>
                <div className="text-xs text-muted-foreground flex gap-3">
                  {session.lastTs && (
                    <span>{new Date(session.lastTs).toLocaleString()}</span>
                  )}
                  {typeof session.messageCount === 'number' && (
                    <span>{session.messageCount} messages</span>
                  )}
                  {isImporting && <span>Importing…</span>}
                </div>
              </button>
            );
          })}
        </ScrollArea>
        {importError && (
          <div className="text-sm text-destructive" role="alert">
            {importError}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

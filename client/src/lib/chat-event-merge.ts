// client/src/lib/chat-event-merge.ts
//
// Pure helper for the two-layer chat rendering model used by ChatPanel.
//
// ChatPanel renders a concatenation of:
//   - `history`   — persisted InteractionEvents loaded via React Query from
//                   GET /api/chat/conversations/:id/events (source of truth).
//   - `live`      — in-flight SSE chunks buffered in the Zustand chat store.
//
// Workflow-event and hook-event SSE chunks are both appended to the live
// buffer AND trigger a history revalidation (chat-workflows-tabs-task006).
// That revalidation eventually pulls the same events back from the store,
// which — without dedup — would cause the event to render twice: once from
// the live append and once from the history refetch. This helper collapses
// that overlap by keying on `event.id`: history wins on collision, and any
// duplicate within the live buffer itself is also dropped (belt-and-
// suspenders with the store-level idempotence in appendLiveEvent).

import type { InteractionEvent } from '../../../shared/types';

export function mergeChatEvents(
  history: InteractionEvent[],
  live: InteractionEvent[],
): InteractionEvent[] {
  const seen = new Set<string>();
  const merged: InteractionEvent[] = [];
  // History is the source of truth: preserve its order verbatim and never
  // drop an entry, even if the same id appears earlier in the same array.
  for (const event of history) {
    merged.push(event);
    seen.add(event.id);
  }
  // Live events are appended in order, skipping any id already emitted —
  // either from history or from an earlier live entry.
  for (const event of live) {
    if (!seen.has(event.id)) {
      merged.push(event);
      seen.add(event.id);
    }
  }
  return merged;
}

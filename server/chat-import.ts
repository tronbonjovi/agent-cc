/**
 * Chat import module (task002 — chat-import-platforms milestone).
 *
 * Clones every event from a source conversation (typically a scanner-ingested
 * Claude session) into a brand-new conversation whose events are reclassified
 * as `chat-ai`. The original events stay untouched in the store — import is
 * purely additive. The new events carry `importedFrom` + `importedAt`
 * provenance metadata so the UI and future features can show where the
 * imported session came from without losing the trail.
 *
 * Intentional reclassification: after import, the new conversation "becomes"
 * a chat conversation, so the chat UI renders it and the user can continue
 * it in a new tab. The scanner remains the source of truth for the original
 * JSONL events.
 *
 * Responsibilities:
 *   - Read all events for `sourceConversationId` via the repo layer.
 *   - Emit a fresh `conversationId` (UUID) and fresh per-event UUIDs so the
 *     clones never collide with the originals on primary key.
 *   - Merge `importedFrom` / `importedAt` into each event's metadata,
 *     preserving any pre-existing keys.
 *   - Persist the clones in a single batch upsert.
 *
 * Out of scope: UI, sidebar refresh, tab registration, source filtering.
 * That's all later tasks in the chat-import-platforms milestone.
 */

import { randomUUID } from 'node:crypto';
import {
  getEventsByConversation,
  insertEventsBatch,
} from './interactions-repo';
import type { InteractionEvent } from '../shared/types';

export interface ImportResult {
  /** Fresh conversation id assigned to the cloned events. */
  newConversationId: string;
  /** Number of events cloned from the source conversation. */
  eventCount: number;
}

/**
 * Clone every event from `sourceConversationId` into a new conversation under
 * the `chat-ai` source. Throws when the source conversation has no events —
 * the HTTP layer converts that into a 404 so callers can distinguish
 * "missing source" from "bad request". Returns the new conversation id + the
 * count of events that were cloned.
 */
export function importConversationAsChat(
  sourceConversationId: string,
): ImportResult {
  const events = getEventsByConversation(sourceConversationId);
  if (events.length === 0) {
    throw new Error(`No events found for conversation ${sourceConversationId}`);
  }

  const newConversationId = randomUUID();
  const importedAt = new Date().toISOString();

  const cloned: InteractionEvent[] = events.map((e) => ({
    ...e,
    // Fresh primary key so INSERT OR REPLACE doesn't overwrite the original.
    id: randomUUID(),
    conversationId: newConversationId,
    // Reclassify so the chat UI picks this up as a chat conversation.
    source: 'chat-ai',
    metadata: {
      ...(e.metadata ?? {}),
      importedFrom: sourceConversationId,
      importedAt,
    },
  }));

  insertEventsBatch(cloned);

  return { newConversationId, eventCount: cloned.length };
}

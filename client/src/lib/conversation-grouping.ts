// client/src/lib/conversation-grouping.ts
//
// Pure helpers backing the ConversationSidebar component (chat-import-platforms
// task004). Factored out of the component so the grouping + click-dispatch
// logic can be unit-tested without pulling in React. Vitest excludes the
// client/ directory, so our tests live in tests/conversation-grouping.test.ts
// and import from here via the `@/lib/conversation-grouping` alias.

import type { InteractionSource } from '../../../shared/types';

/**
 * Shape returned by `GET /api/chat/conversations/all` — mirrors the row shape
 * emitted by `listConversations()` in server/interactions-repo.ts. Kept as a
 * local interface rather than reaching across the server/ boundary so the
 * client build never pulls in a node-only module.
 */
export interface ConversationSummary {
  conversationId: string;
  source: InteractionSource;
  eventCount: number;
  lastEvent: string;
}

/**
 * Group an array of conversation summaries by their `source` field. Returns
 * a partial record: only sources that actually have conversations appear as
 * keys. The sidebar iterates the metadata registry to render empty sections,
 * so missing keys are expected and treated as "zero conversations".
 *
 * Input ordering is preserved within each group — the server already sorts
 * by `lastEvent DESC` so callers get the freshest conversation first.
 */
export function groupConversationsBySource(
  conversations: ConversationSummary[],
): Partial<Record<InteractionSource, ConversationSummary[]>> {
  const out: Partial<Record<InteractionSource, ConversationSummary[]>> = {};
  for (const conv of conversations) {
    const bucket = out[conv.source] ?? [];
    bucket.push(conv);
    out[conv.source] = bucket;
  }
  return out;
}

/**
 * Dependencies injected into `handleConversationClick`. Kept as a plain
 * object so the unit tests can pass in spies without mocking the store or
 * the global `fetch`.
 */
export interface ConversationClickDeps {
  /** Matches `fetch`'s signature closely enough for the scanner-import path. */
  fetch: (
    input: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string },
  ) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;
  openTab: (conversationId: string, title: string) => Promise<void>;
  setActiveTab: (conversationId: string) => Promise<void>;
}

/**
 * Response shape we care about from `POST /api/chat/import`. Task002 returns
 * both fields but we only need `newConversationId` to pivot the tab.
 */
interface ImportResponse {
  newConversationId: string;
  eventCount?: number;
}

/**
 * Dispatch a click on a conversation sidebar row. Three branches, keyed on
 * `source`:
 *
 *   - `chat-*` sources: the conversation already lives in the chat store, so
 *     we just open a tab directly with the existing conversationId.
 *   - `scanner-jsonl`: the conversation needs to be imported first (task002).
 *     We POST to `/api/chat/import`, then open a tab with the newly-minted
 *     conversationId.
 *   - Any other source (including `planned` externals like `github-issue`,
 *     `telegram`, etc.): no-op. The component renders those rows as disabled,
 *     but we also guard the handler so accidental clicks don't fall through.
 *
 * Deliberately throws on a failed import POST so the component can surface
 * the error in its own UI shell — the sidebar's click path stays pure.
 */
export async function handleConversationClick(
  conv: ConversationSummary,
  deps: ConversationClickDeps,
): Promise<void> {
  if (conv.source.startsWith('chat-')) {
    // Title defaults to a short-form conversationId; task003's picker modal
    // owns richer titling. We keep it cheap here so the sidebar can open a
    // tab without a round-trip just to fetch a summary.
    await deps.openTab(conv.conversationId, conv.conversationId.slice(0, 12));
    await deps.setActiveTab(conv.conversationId);
    return;
  }

  if (conv.source === 'scanner-jsonl') {
    const res = await deps.fetch('/api/chat/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceConversationId: conv.conversationId }),
    });
    if (!res.ok) {
      throw new Error(`Import failed: ${conv.conversationId}`);
    }
    const body = (await res.json()) as ImportResponse;
    const newId = body.newConversationId;
    await deps.openTab(newId, `Imported: ${conv.conversationId.slice(0, 8)}`);
    await deps.setActiveTab(newId);
    return;
  }

  // planned sources (github-issue, telegram, discord, imessage): no-op.
}

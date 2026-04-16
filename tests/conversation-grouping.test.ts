// tests/conversation-grouping.test.ts
//
// Unit tests for the pure helpers backing the ConversationSidebar component
// (chat-import-platforms task004). Vitest excludes the client/ directory, so
// we import the helpers via the `@` alias configured in vitest.config.ts.
//
// Strategy (per reference_vitest_client_excluded): the sidebar component
// itself is guarded by source-text assertions in conversation-sidebar.test.ts.
// The real dispatch logic lives here as a plain function so we can exercise
// every branch with simple spies.

import { describe, it, expect, vi } from 'vitest';
import {
  groupConversationsBySource,
  handleConversationClick,
  type ConversationSummary,
  type ConversationClickDeps,
} from '@/lib/conversation-grouping';

/** Build a ConversationSummary with sensible defaults. */
function conv(
  conversationId: string,
  source: ConversationSummary['source'],
  eventCount = 1,
  lastEvent = '2026-04-15T10:00:00.000Z',
): ConversationSummary {
  return { conversationId, source, eventCount, lastEvent };
}

/** A successful fetch response stub matching the narrow shape the helper uses. */
function okResponse(body: unknown) {
  return {
    ok: true,
    json: async () => body,
  };
}

describe('groupConversationsBySource', () => {
  it('groups conversations by their source field', () => {
    const input: ConversationSummary[] = [
      conv('a', 'chat-ai'),
      conv('b', 'scanner-jsonl'),
      conv('c', 'chat-ai'),
      conv('d', 'chat-slash'),
    ];
    const grouped = groupConversationsBySource(input);

    expect(grouped['chat-ai']).toHaveLength(2);
    expect(grouped['scanner-jsonl']).toHaveLength(1);
    expect(grouped['chat-slash']).toHaveLength(1);
    // chat-workflow / chat-hook never appeared — missing keys are fine.
    expect(grouped['chat-workflow']).toBeUndefined();
  });

  it('returns an empty object for an empty array', () => {
    expect(groupConversationsBySource([])).toEqual({});
  });

  it('preserves input order within each group', () => {
    const input: ConversationSummary[] = [
      conv('first', 'chat-ai', 1, '2026-04-15T12:00:00.000Z'),
      conv('second', 'chat-ai', 1, '2026-04-15T11:00:00.000Z'),
      conv('third', 'chat-ai', 1, '2026-04-15T10:00:00.000Z'),
    ];
    const grouped = groupConversationsBySource(input);
    expect(grouped['chat-ai']?.map((c) => c.conversationId)).toEqual([
      'first',
      'second',
      'third',
    ]);
  });
});

describe('handleConversationClick', () => {
  function buildDeps(
    fetchImpl?: ConversationClickDeps['fetch'],
  ): {
    deps: ConversationClickDeps;
    openTab: ReturnType<typeof vi.fn>;
    setActiveTab: ReturnType<typeof vi.fn>;
    fetchFn: ReturnType<typeof vi.fn>;
  } {
    const openTab = vi.fn(async () => {});
    const setActiveTab = vi.fn(async () => {});
    const fetchFn = vi.fn(
      fetchImpl ?? (async () => okResponse({ newConversationId: 'should-not-be-used' })),
    );
    return {
      deps: {
        fetch: fetchFn as unknown as ConversationClickDeps['fetch'],
        openTab,
        setActiveTab,
      },
      openTab,
      setActiveTab,
      fetchFn,
    };
  }

  it('chat-* source: opens tab directly, no fetch call', async () => {
    const { deps, openTab, setActiveTab, fetchFn } = buildDeps();
    await handleConversationClick(conv('conv-123', 'chat-ai'), deps);

    expect(fetchFn).not.toHaveBeenCalled();
    expect(openTab).toHaveBeenCalledWith('conv-123', expect.any(String));
    expect(setActiveTab).toHaveBeenCalledWith('conv-123');
  });

  it('chat-slash source: still uses the direct-open path', async () => {
    // Regression guard: the branch check uses `startsWith("chat-")`, not a
    // hardcoded `chat-ai` check, so other chat sub-sources stay on the
    // direct-open path.
    const { deps, openTab, fetchFn } = buildDeps();
    await handleConversationClick(conv('slash-1', 'chat-slash'), deps);

    expect(fetchFn).not.toHaveBeenCalled();
    expect(openTab).toHaveBeenCalledWith('slash-1', expect.any(String));
  });

  it('scanner-jsonl source: POSTs to /api/chat/import then opens tab with new id', async () => {
    const { deps, openTab, setActiveTab, fetchFn } = buildDeps(async () =>
      okResponse({ newConversationId: 'new-chat-42', eventCount: 5 }),
    );
    await handleConversationClick(conv('scanner-src', 'scanner-jsonl'), deps);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('/api/chat/import');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({ sourceConversationId: 'scanner-src' });

    expect(openTab).toHaveBeenCalledWith('new-chat-42', expect.stringContaining('Imported'));
    expect(setActiveTab).toHaveBeenCalledWith('new-chat-42');
  });

  it('scanner-jsonl source: throws when import POST returns !ok', async () => {
    const { deps, openTab, setActiveTab } = buildDeps(async () => ({
      ok: false,
      json: async () => ({ error: 'boom' }),
    }));
    await expect(
      handleConversationClick(conv('scanner-src', 'scanner-jsonl'), deps),
    ).rejects.toThrow(/Import failed/);
    expect(openTab).not.toHaveBeenCalled();
    expect(setActiveTab).not.toHaveBeenCalled();
  });

  it('planned source (github-issue): no-op, no fetch, no openTab', async () => {
    const { deps, openTab, setActiveTab, fetchFn } = buildDeps();
    await handleConversationClick(conv('gh-42', 'github-issue'), deps);

    expect(fetchFn).not.toHaveBeenCalled();
    expect(openTab).not.toHaveBeenCalled();
    expect(setActiveTab).not.toHaveBeenCalled();
  });

  it('planned source (telegram): no-op', async () => {
    const { deps, openTab, fetchFn } = buildDeps();
    await handleConversationClick(conv('tg-1', 'telegram'), deps);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(openTab).not.toHaveBeenCalled();
  });
});

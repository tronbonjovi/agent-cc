// tests/chat-tab-order.test.ts
//
// Pure-logic unit tests for the chat-tab-order helper module shipped in
// chat-workflows-tabs-task002. Two exports under test:
//
//   - `buildOrderedTabs(tabs, order)` joins the store's raw `tabs` array
//     with its `order` array. It is also a drift guard: entries in `order`
//     without a matching tab are dropped (reviewer carry-over #3), and any
//     tabs missing from `order` are appended at the end (self-heal). The
//     invariant is: `buildOrderedTabs` never loses a real tab and never
//     returns a phantom one.
//
//   - `reorderIds(order, fromId, toId)` is the pure reducer the drag-end
//     handler feeds to `useChatTabsStore.reorder(...)`. Moving `from` to
//     `to`'s slot must not duplicate ids, must no-op when `from === to`,
//     and must fail safe (return the original array) when either id is
//     missing — the latter happens when a dnd-kit event references a stale
//     id after a concurrent close.
//
// These tests run under vitest's repo-root `tests/` include glob; the
// client/ directory is excluded from vitest, so the helper must be
// pure-JS/TS with zero store or React dependencies. That's enforced
// structurally by the helper's imports — it only imports the
// `ChatTabEntry` type.

import { describe, it, expect } from 'vitest';
import {
  buildOrderedTabs,
  reorderIds,
} from '../client/src/lib/chat-tab-order';
import type { ChatTabEntry } from '../shared/types';

function tab(conversationId: string, title: string): ChatTabEntry {
  return { conversationId, title };
}

describe('buildOrderedTabs', () => {
  it('joins tabs and order in the order specified', () => {
    const tabs: ChatTabEntry[] = [tab('a', 'Alpha'), tab('b', 'Bravo')];
    const order = ['b', 'a'];
    expect(buildOrderedTabs(tabs, order)).toEqual([
      { conversationId: 'b', title: 'Bravo' },
      { conversationId: 'a', title: 'Alpha' },
    ]);
  });

  it('drops order entries without a matching tab (drift guard)', () => {
    // The store's optimistic close-rollback path could leave a phantom id
    // in `order` if a PUT races — buildOrderedTabs must never render it.
    const tabs: ChatTabEntry[] = [tab('a', 'Alpha')];
    const order = ['ghost', 'a'];
    expect(buildOrderedTabs(tabs, order)).toEqual([
      { conversationId: 'a', title: 'Alpha' },
    ]);
  });

  it('appends orphan tabs not present in order at the end (self-heal)', () => {
    // Symmetric drift case: a tab exists in `tabs` but its id never made it
    // into `order`. The user still has to be able to see and interact with
    // it, so it shows up at the end of the rendered row.
    const tabs: ChatTabEntry[] = [
      tab('a', 'Alpha'),
      tab('b', 'Bravo'),
      tab('c', 'Charlie'),
    ];
    const order = ['a', 'b'];
    expect(buildOrderedTabs(tabs, order)).toEqual([
      { conversationId: 'a', title: 'Alpha' },
      { conversationId: 'b', title: 'Bravo' },
      { conversationId: 'c', title: 'Charlie' },
    ]);
  });

  it('returns an empty array when both inputs are empty', () => {
    expect(buildOrderedTabs([], [])).toEqual([]);
  });
});

describe('reorderIds', () => {
  it('moves fromId into toId slot, preserving the rest', () => {
    // Drag "a" onto "c": the result should place "a" at c's original index
    // and shift c back. This mirrors the dnd-kit arrayMove semantics the
    // drag-end handler needs.
    expect(reorderIds(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual([
      'b',
      'c',
      'a',
      'd',
    ]);
  });

  it('is a no-op when fromId === toId', () => {
    // dnd-kit fires dragEnd with over===active when the user drops in place.
    const order = ['a', 'b', 'c'];
    expect(reorderIds(order, 'b', 'b')).toEqual(order);
  });

  it('returns the original order when fromId is not present (drift guard)', () => {
    // A stale drag reference (id closed mid-drag) must not corrupt order.
    const order = ['a', 'b', 'c'];
    const out = reorderIds(order, 'missing', 'b');
    expect(out).toEqual(order);
  });
});

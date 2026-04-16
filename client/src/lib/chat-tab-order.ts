// client/src/lib/chat-tab-order.ts
//
// Pure-logic helpers for rendering and reordering the chat tab bar shipped
// in chat-workflows-tabs-task002. Extracted from the component so they can
// be unit-tested from repo-root `tests/` (vitest excludes client/, so any
// logic we want green-bar coverage on must be importable as plain TS).
//
// The store shipped in task001 exposes two arrays:
//
//   - `tabs: ChatTabEntry[]` — unordered bag, one entry per open tab.
//   - `order: string[]`      — display order, authoritative.
//
// They can drift under two failure modes:
//
//   1. Ghost id in `order` with no matching tab (rollback race after a
//      closeTab PUT failure). `buildOrderedTabs` drops these — the user
//      never sees a phantom chip with no data to show.
//   2. Orphan tab in `tabs` that never made it into `order` (openTab
//      rollback, or a future reducer bug). `buildOrderedTabs` appends
//      these at the end so the user can still see and close them.
//
// Both are self-heal invariants — reviewer carry-over #3 from task001.
//
// `reorderIds` is the dnd-kit drag-end reducer. Given the current order and
// the (from, to) pair dnd-kit reports, it returns a new order with `from`
// moved to `to`'s slot. It is the only piece of drag math the component
// needs, and keeping it pure means the drag handler in the TSX is a
// one-liner.

import type { ChatTabEntry } from '../../../shared/types';

/** A tab projected into display order — the join result the tab bar renders. */
export interface OrderedTab {
  conversationId: string;
  title: string;
}

/**
 * Join the store's raw `tabs` array with its `order` array, self-healing
 * both drift modes:
 *
 *   - Any `order` id with no matching tab is dropped.
 *   - Any tab whose id is missing from `order` is appended at the end.
 *
 * The result is always exactly the set of real tabs, in the requested order
 * where possible, with orphans stable-ordered at the tail.
 */
export function buildOrderedTabs(
  tabs: ChatTabEntry[],
  order: string[],
): OrderedTab[] {
  const byId = new Map<string, ChatTabEntry>();
  for (const tab of tabs) {
    byId.set(tab.conversationId, tab);
  }

  const result: OrderedTab[] = [];
  const seen = new Set<string>();

  // First pass: walk `order` and emit the matching tabs in sequence,
  // silently dropping ghost entries.
  for (const id of order) {
    const tab = byId.get(id);
    if (tab && !seen.has(id)) {
      result.push({ conversationId: tab.conversationId, title: tab.title });
      seen.add(id);
    }
  }

  // Second pass: append orphan tabs in their original `tabs[]` order so
  // the self-heal is deterministic (not dependent on Map iteration quirks).
  for (const tab of tabs) {
    if (!seen.has(tab.conversationId)) {
      result.push({ conversationId: tab.conversationId, title: tab.title });
      seen.add(tab.conversationId);
    }
  }

  return result;
}

/**
 * Drag-end reducer: return a new `order` array with `fromId` moved into
 * `toId`'s slot. Fails safe on missing ids (returns the original array)
 * so a stale dnd-kit reference cannot corrupt order.
 *
 * Semantics match dnd-kit's `arrayMove(items, from, to)` over the ids
 * — the caller passes ids, not indices, so the component's drag handler
 * can stay index-agnostic.
 */
export function reorderIds(
  order: string[],
  fromId: string,
  toId: string,
): string[] {
  if (fromId === toId) return order.slice();

  const fromIdx = order.indexOf(fromId);
  const toIdx = order.indexOf(toId);
  if (fromIdx === -1 || toIdx === -1) return order.slice();

  const next = order.slice();
  next.splice(fromIdx, 1);
  // Matches dnd-kit's arrayMove: the moved item lands at the destination's
  // original index, pushing the destination (and everything after) one slot
  // toward the tail. Since we already removed `fromId`, splicing at `toIdx`
  // produces that exact layout.
  next.splice(toIdx, 0, fromId);
  return next;
}

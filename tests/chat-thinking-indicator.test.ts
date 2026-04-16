// tests/chat-thinking-indicator.test.ts
//
// Tests for M9 chat-ux-cleanup task005 — the thinking indicator.
//
// The dead-air gap between the optimistic user echo (landing on Send) and
// the first assistant envelope from the Claude CLI is architecturally
// unfixable: the CLI emits whole message envelopes on a 5-10s cadence, not
// tokens (see reference_claude_cli_streaming memory). The thinking indicator
// is the UX solution — three pulsing dots styled like an assistant bubble
// that appear immediately after the optimistic echo and disappear when the
// first assistant chunk (text / thinking / tool_call) lands.
//
// Two test surfaces per project convention (vitest excludes client/, so no
// RTL renders):
//
//   1. Pure-logic unit tests on `shouldShowThinking(isStreaming, liveEvents,
//      conversationId)` — a selector helper added to `chat-store.ts`. Covers
//      all 4 combinations of (isStreaming × hasAssistantEvents).
//
//   2. Source-text guardrails on `chat-panel.tsx` — pin the indicator's
//      presence, the pulse animation, and the absence of banned
//      bounce/scale/ping animations (per feedback_no_bounce_animations).

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import type { InteractionEvent } from '../shared/types';
import { shouldShowThinking } from '../client/src/stores/chat-store';

const ROOT = path.resolve(__dirname, '..');
const CHAT_PANEL_PATH = path.resolve(
  ROOT,
  'client/src/components/chat/chat-panel.tsx',
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CONV = 'tab-x';

function makeEvent(
  overrides: Partial<InteractionEvent> = {},
): InteractionEvent {
  return {
    id: 'e1',
    conversationId: CONV,
    parentEventId: null,
    timestamp: '2026-04-16T00:00:00.000Z',
    source: 'chat-ai',
    role: 'assistant',
    content: { type: 'text', text: 'hi' },
    cost: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// shouldShowThinking — pure-logic unit tests (all 4 combos + edge cases)
// ---------------------------------------------------------------------------

describe('shouldShowThinking — selector', () => {
  it('returns false when not streaming (idle, empty buffer)', () => {
    expect(shouldShowThinking(false, {}, CONV)).toBe(false);
  });

  it('returns false when not streaming even if assistant events are present', () => {
    // Non-streaming state should never show the indicator, regardless of
    // buffer contents. Combination 1: isStreaming=false, hasAssistant=true.
    const liveEvents = {
      [CONV]: [makeEvent({ id: 'a1', role: 'assistant' })],
    };
    expect(shouldShowThinking(false, liveEvents, CONV)).toBe(false);
  });

  it('returns true when streaming and no events yet (send → first envelope gap)', () => {
    // Combination 2: isStreaming=true, no events at all. The most common
    // case — user just hit Send, optimistic echo hasn't even rendered yet.
    expect(shouldShowThinking(true, {}, CONV)).toBe(true);
  });

  it('returns true when streaming with only an optimistic user echo present', () => {
    // Combination 3: isStreaming=true, hasAssistant=false (only user echo).
    // This is the critical case — the user echo lands on Send, but we still
    // want the indicator visible until the first assistant envelope arrives.
    const liveEvents = {
      [CONV]: [makeEvent({ id: 'opt-user', role: 'user' })],
    };
    expect(shouldShowThinking(true, liveEvents, CONV)).toBe(true);
  });

  it('returns false when streaming and an assistant text event is present', () => {
    // Combination 4: isStreaming=true, hasAssistant=true. First envelope
    // landed — the indicator should hide and the actual assistant bubble
    // takes over.
    const liveEvents = {
      [CONV]: [
        makeEvent({ id: 'opt-user', role: 'user' }),
        makeEvent({ id: 'a1', role: 'assistant' }),
      ],
    };
    expect(shouldShowThinking(true, liveEvents, CONV)).toBe(false);
  });

  it('returns false when streaming and an assistant thinking event is present', () => {
    // Thinking content counts as "first envelope arrived" — the model is
    // reasoning, so hide the indicator.
    const liveEvents = {
      [CONV]: [
        makeEvent({
          id: 't1',
          role: 'assistant',
          content: { type: 'thinking', text: 'pondering' },
        }),
      ],
    };
    expect(shouldShowThinking(true, liveEvents, CONV)).toBe(false);
  });

  it('returns false when streaming and an assistant tool_call event is present', () => {
    // Tool calls also mean "envelope landed" — hide the indicator.
    const liveEvents = {
      [CONV]: [
        makeEvent({
          id: 'tc1',
          role: 'assistant',
          content: {
            type: 'tool_call',
            toolName: 'Read',
            input: { file_path: '/tmp/x' },
            toolUseId: 'tu_1',
          },
        }),
      ],
    };
    expect(shouldShowThinking(true, liveEvents, CONV)).toBe(false);
  });

  it('is conversation-scoped — assistant events in another tab do not hide the indicator in this tab', () => {
    // If tabA is showing the indicator but tabB already has an assistant
    // reply, tabA must still show its indicator. Cross-contamination would
    // be the primary risk of a naive implementation.
    const liveEvents = {
      tabA: [makeEvent({ id: 'opt', role: 'user' })],
      tabB: [makeEvent({ id: 'a1', role: 'assistant' })],
    };
    expect(shouldShowThinking(true, liveEvents, 'tabA')).toBe(true);
    expect(shouldShowThinking(true, liveEvents, 'tabB')).toBe(false);
  });

  it('treats system-role events as non-assistant (indicator still shows)', () => {
    // A stray system event (e.g. hook_fire) landing before the first real
    // assistant envelope should not hide the indicator — the user is still
    // waiting for the model to say something.
    const liveEvents = {
      [CONV]: [
        makeEvent({
          id: 'sys1',
          role: 'system',
          content: { type: 'system', subtype: 'info', text: 'heads up' },
        }),
      ],
    };
    expect(shouldShowThinking(true, liveEvents, CONV)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// chat-panel.tsx — source-text guardrails
// ---------------------------------------------------------------------------

describe('chat-panel.tsx — thinking indicator source guardrails', () => {
  const src = fs.readFileSync(CHAT_PANEL_PATH, 'utf-8');

  it('indicator component is defined in chat-panel.tsx', () => {
    // Accept either an inline function component or a const arrow. The
    // component name must contain "Thinking" so the JSX tag and test intent
    // line up. Not pinning the exact signature to keep this flexible.
    const hasFunctionForm = /function\s+ThinkingIndicator\s*\(/.test(src);
    const hasConstForm = /const\s+ThinkingIndicator\s*[:=]/.test(src);
    expect(hasFunctionForm || hasConstForm).toBe(true);
  });

  it('indicator is mounted/rendered in the panel (not just defined)', () => {
    // The JSX tag must appear somewhere in the render body — defining the
    // component without rendering it would still pass the previous check.
    expect(src).toMatch(/<ThinkingIndicator\b/);
  });

  it('gating logic uses shouldShowThinking selector from the chat store', () => {
    // The indicator render must be guarded by the pure-logic selector we
    // wrote tests for above. Guarantees panel + selector stay in sync.
    expect(src).toMatch(/shouldShowThinking/);
  });

  it('uses animate-pulse (CSS opacity animation) — no bounce, no scale, no ping', () => {
    // animate-pulse is the only allowed animation for this indicator per
    // the task contract and the project-wide no-bounce rule.
    expect(src).toMatch(/animate-pulse/);
    expect(src).not.toMatch(/animate-bounce/);
    expect(src).not.toMatch(/animate-ping/);
    expect(src).not.toMatch(/\bscale-\d/);
  });

  it('has staggered per-dot animationDelay for the classic "..." feel', () => {
    // Three dots with progressive delays produce the wave pattern. We look
    // for `animationDelay` somewhere in the source (inline style or class).
    expect(src).toMatch(/animationDelay/);
  });

  it('indicator uses assistant-bubble styling (matches TextBubble assistant case)', () => {
    // The indicator lives in a bubble styled the same as the assistant's
    // text bubble — bg-card + text-card-foreground + border. Looking for
    // at least one of the classes anchors the styling choice without
    // pinning exact shape.
    expect(src).toMatch(/bg-card/);
  });

  it('indicator is left-aligned (assistant side, self-start)', () => {
    // Left-alignment on a flex child. The existing self-start pattern from
    // TextBubble is the idiomatic choice — grep proves it's still present.
    expect(src).toMatch(/self-start/);
  });

  it('has no gradient classes in the indicator surface', () => {
    // feedback_no_gradients — this is a project-wide rule, scoped to the
    // whole file (the indicator is inline so any gradient introduced for it
    // would show up here).
    expect(src).not.toMatch(/bg-gradient/);
    expect(src).not.toMatch(/text-gradient/);
  });
});

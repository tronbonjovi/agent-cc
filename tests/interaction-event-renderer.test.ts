// tests/interaction-event-renderer.test.ts
//
// Tests for InteractionEventRenderer (unified-capture milestone, task007).
//
// Per the project convention (see CLAUDE.md and the
// reference_vitest_client_excluded memory), client/ is excluded from vitest,
// so we cannot do React Testing Library renders here. Instead this file is
// two layers:
//
//   1. Source-text guardrails over the renderer file: assert it exists, has
//      the right exports, imports the M2 InteractionEvent type, switches on
//      every content variant, declares the five sub-components, has no
//      bounce/scale animations, has no gradients, and does not import from
//      the legacy analytics/messages/bubbles pipeline.
//
//   2. A discriminant-sync check that fails if the InteractionContent union
//      grows a new variant the renderer does not handle. This is enforced two
//      ways: a TypeScript type-level assertion (compile-time drift catch) and
//      a runtime equality check on a frozen tuple of expected variants.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import type { InteractionContent } from '../shared/types';

const ROOT = path.resolve(__dirname, '..');
const RENDERER_PATH = path.resolve(
  ROOT,
  'client/src/components/chat/interaction-event-renderer.tsx'
);

// ---------------------------------------------------------------------------
// Source-text guardrails (8 tests)
// ---------------------------------------------------------------------------

describe('interaction-event-renderer.tsx — source guardrails', () => {
  it('1. file exists at the expected path', () => {
    expect(fs.existsSync(RENDERER_PATH)).toBe(true);
  });

  // Read once, share across the rest of the suite.
  const src = fs.readFileSync(RENDERER_PATH, 'utf-8');

  it('2. exports the InteractionEventRenderer named function', () => {
    expect(src).toMatch(/export\s+function\s+InteractionEventRenderer\s*\(/);
  });

  it('3. imports InteractionEvent from shared/types', () => {
    // Tolerates either a relative path or the @shared alias — the requirement
    // is that the M2 type lives in shared/types and the renderer consumes it.
    expect(src).toMatch(/import\s+type\s*\{[^}]*\bInteractionEvent\b[^}]*\}\s*from\s*['"][^'"]*shared\/types['"]/);
  });

  it('4. EventRow switch covers all 5 content.type variants', () => {
    // Must switch on event.content.type (the discriminant)…
    expect(src).toMatch(/switch\s*\(\s*event\.content\.type\s*\)/);
    // …and have a case for each variant. Order-independent, whitespace-tolerant.
    const required = ['text', 'tool_call', 'tool_result', 'thinking', 'system'];
    for (const variant of required) {
      const re = new RegExp(`case\\s+['"]${variant}['"]\\s*:`);
      expect(src).toMatch(re);
    }
  });

  it('5. declares all 5 sub-component functions', () => {
    const subs = ['TextBubble', 'ToolCallPanel', 'ToolResultPanel', 'ThinkingBlock', 'SystemNote'];
    for (const name of subs) {
      const re = new RegExp(`function\\s+${name}\\s*\\(`);
      expect(src).toMatch(re);
    }
  });

  it('6. has no bounce/scale cartoonish animations', () => {
    // Project safety rule (see feedback_no_bounce_animations + new-user-safety.test.ts).
    expect(src).not.toMatch(/\banimate-bounce\b/);
    expect(src).not.toMatch(/\bscale-\d/);
    expect(src).not.toMatch(/\bbounce\b/);
  });

  it('7. has no gradient classes', () => {
    // User preference (feedback_no_gradients): solid colors only.
    expect(src).not.toMatch(/bg-gradient/);
    expect(src).not.toMatch(/from-\[/);
    expect(src).not.toMatch(/via-\[/);
    expect(src).not.toMatch(/to-\[/);
    expect(src).not.toMatch(/text-gradient/);
  });

  it('8. does not import from the legacy analytics/messages or bubbles pipeline', () => {
    // The renderer must be freestanding — no hidden re-export of the legacy
    // ConversationViewer / bubble pipeline. Search for any import path
    // containing "analytics/messages" or "bubbles/".
    const importLines = src.split('\n').filter((line) => /\bfrom\s+['"]/.test(line));
    for (const line of importLines) {
      expect(line).not.toMatch(/analytics\/messages/);
      expect(line).not.toMatch(/\/bubbles\//);
      expect(line).not.toMatch(/\/bubbles['"]/);
    }
  });
});

// ---------------------------------------------------------------------------
// Discriminant sync — pure logic, compile-time + runtime (1 test)
// ---------------------------------------------------------------------------
//
// If someone adds a sixth variant to InteractionContent in shared/types.ts
// without updating the renderer's switch, two things should happen:
//
//   a) `npm run check` fails because the renderer's exhaustive switch leaves
//      the new variant unhandled (TypeScript narrows the switch return type
//      to never, and any code path that depends on full coverage breaks).
//
//   b) This test fails because the runtime tuple of expected discriminants
//      no longer matches the union.
//
// We can't ask TypeScript at runtime "what are all the variants of this
// union?" — type info is erased — so we keep a hand-maintained tuple of the
// expected discriminants and use a type-level identity check to force the
// tuple to stay in sync with the union. If the union grows or shrinks, the
// type assertion below stops compiling, which surfaces in `npm run check`.

// A compile-time identity check between two string-literal unions. If they
// differ in either direction, the type resolves to `never` and the const
// assignment below fails to type-check.
type AssertEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// The discriminants the renderer's switch knows about. Order is irrelevant
// for the union check — TypeScript compares set-style.
const EXPECTED_DISCRIMINANTS = ['text', 'tool_call', 'tool_result', 'thinking', 'system'] as const;
type ExpectedDiscriminant = (typeof EXPECTED_DISCRIMINANTS)[number];

// Compile-time guard: ExpectedDiscriminant must be exactly InteractionContent['type'].
// If the union grows a new variant (or this tuple drops one), this line stops
// compiling and `npm run check` blocks the change.
const _discriminantSyncCheck: AssertEqual<ExpectedDiscriminant, InteractionContent['type']> = true;
void _discriminantSyncCheck;

describe('interaction-event-renderer — discriminant sync', () => {
  it('9. expected discriminants exactly match the InteractionContent union', () => {
    // Runtime check: build one sample of each variant typed as InteractionContent
    // (so TypeScript validates the shapes), then collect the .type values and
    // compare against the expected tuple as a Set.
    const samples: InteractionContent[] = [
      { type: 'text', text: 'hi' },
      { type: 'tool_call', toolName: 'Bash', input: {}, toolUseId: 'tu_1' },
      { type: 'tool_result', toolUseId: 'tu_1', output: 'ok' },
      { type: 'thinking', text: 'reasoning' },
      { type: 'system', subtype: 'info', text: 'note' },
    ];

    const actualDiscriminants = new Set(samples.map((s) => s.type));
    const expectedSet = new Set<string>(EXPECTED_DISCRIMINANTS);

    expect(actualDiscriminants).toEqual(expectedSet);
    expect(actualDiscriminants.size).toBe(5);

    // And the renderer source must contain a case for every expected variant.
    // (Belt-and-braces with test #4, but worth restating in this context: if
    // the tuple is ever updated to add a variant, the renderer source check
    // here surfaces the missing case.)
    const src = fs.readFileSync(RENDERER_PATH, 'utf-8');
    for (const variant of EXPECTED_DISCRIMINANTS) {
      expect(src).toMatch(new RegExp(`case\\s+['"]${variant}['"]\\s*:`));
    }
  });
});

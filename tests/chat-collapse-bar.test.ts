// tests/chat-collapse-bar.test.ts
//
// Source-text guardrails for the chat panel's always-mounted collapse bar —
// chat-ux-cleanup-task006.
//
// Vitest excludes the client/ directory, so we can't render the component.
// Per `reference_vitest_client_excluded` the strategy is:
//   1. Pure-logic helpers (unit-tested where applicable)
//   2. Source-text regex guards on the TSX to pin the structural invariants
//      this task introduces — the collapse bar ref, chevron direction,
//      removal of the old artificial min/max width constraints, and the
//      mirror of the terminal panel's imperative-resize pattern.
//
// Companion pure-logic slice: the layout store already has
// tests/terminal-toggle.test.ts style coverage of the toggleChatPanel()
// selector indirectly via the persisted layout store. We don't duplicate
// it here — this file's scope is the layout.tsx plumbing.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const LAYOUT_PATH = path.resolve(ROOT, 'client/src/components/layout.tsx');
const LAYOUT_STORE_PATH = path.resolve(
  ROOT,
  'client/src/stores/layout-store.ts',
);

describe('layout.tsx — chat collapse bar (task006)', () => {
  const src = fs.readFileSync(LAYOUT_PATH, 'utf-8');

  it('no longer gates the chat Panel on chatPanelCollapsed via a fragment (always-mounted)', () => {
    // The old shape wrapped the chat Panel + its resize handle in
    // `{!chatPanelCollapsed && (\n  <>\n    <PanelResizeHandle...`
    // which unmounts the panel on collapse and remounts it on expand.
    // Forbid the fragment shape directly — that was the anti-pattern.
    expect(src).not.toMatch(/!chatPanelCollapsed\s*&&\s*\(\s*<>/);
    // And forbid the Panel or PanelResizeHandle appearing *as the very
    // next element* inside a `!chatPanelCollapsed &&` guard — those are
    // the tags that used to be conditionally rendered together. Decor
    // grip indicators (`<div ...grip... />` as the direct child) are
    // legitimate and don't match this.
    expect(src).not.toMatch(
      /!chatPanelCollapsed\s*&&\s*\(\s*<Panel(Resize)?/,
    );
  });

  it('drops the old min/max width constraints (minSize={240} / maxSize={800})', () => {
    // `feedback_no_layout_constraints`: the user dislikes artificial
    // floors/ceilings on resizable panels. Only constraint allowed is the
    // bar-width clamp when collapsed.
    expect(src).not.toMatch(/minSize=\{240\}/);
    expect(src).not.toMatch(/maxSize=\{800\}/);
  });

  it('declares a chat panel imperative ref (mirrors terminalPanelRef)', () => {
    // Mirror of the terminal pattern at layout.tsx:94-98. The collapse
    // toggle drives size via ref.resize() in a useEffect so the Panel
    // stays mounted across state flips.
    expect(src).toMatch(/chatPanelRef\s*=\s*useRef<\s*PanelImperativeHandle/);
  });

  it('wires an imperative resize effect on chatPanelCollapsed toggles', () => {
    // The effect body calls ref.resize(CHAT_COLLAPSED_PX) on collapse and
    // ref.resize(chatPanelWidth) on expand — same shape as the terminal
    // effect at layout.tsx:124-137.
    expect(src).toMatch(/chatPanelRef\.current/);
    expect(src).toMatch(/\.resize\(\s*(CHAT_COLLAPSED_PX|chatPanelWidth)/);
  });

  it('defines a CHAT_COLLAPSED_PX constant for the bar width', () => {
    // Named constant (not a magic number) makes the clamp intent explicit
    // and keeps min/max + default in sync.
    expect(src).toMatch(/CHAT_COLLAPSED_PX\s*=\s*\d+/);
  });

  it('uses both ChevronLeft and ChevronRight for the collapse bar chevron', () => {
    // Chevron flips direction based on state: `<` (ChevronLeft) when
    // expanded → clicking collapses; `>` (ChevronRight) when collapsed →
    // clicking expands. Both icons must be imported + referenced.
    expect(src).toMatch(/\bChevronLeft\b/);
    expect(src).toMatch(/\bChevronRight\b/);
    // Pattern: ternary on chatPanelCollapsed returning both icons. We
    // don't pin exact formatting (parens + newlines are typical in TSX),
    // just that the true-branch contains ChevronRight and the
    // false-branch contains ChevronLeft within a reasonable window.
    expect(src).toMatch(
      /chatPanelCollapsed\s*\?[\s\S]{0,80}?<ChevronRight[\s\S]{0,120}?:\s*\(?\s*<ChevronLeft/,
    );
  });

  it('hides the chat resize handle when collapsed (mirrors terminal pattern)', () => {
    // Terminal panel uses `terminalCollapsed ? "h-0 pointer-events-none
    // opacity-0" : "..."` on its PanelResizeHandle. Chat panel is vertical
    // so it'll use `w-0` instead of `h-0`, but the same invisibility
    // treatment applies.
    expect(src).toMatch(
      /chatPanelCollapsed[\s\S]*?w-0[\s\S]*?pointer-events-none[\s\S]*?opacity-0/,
    );
  });

  it('clamps the chat Panel min/max to CHAT_COLLAPSED_PX when collapsed', () => {
    // When collapsed, react-resizable-panels must honor the bar-width
    // clamp. When expanded, no max constraint (fluid per
    // feedback_no_layout_constraints).
    expect(src).toMatch(
      /minSize=\{\s*chatPanelCollapsed\s*\?\s*CHAT_COLLAPSED_PX/,
    );
    expect(src).toMatch(
      /maxSize=\{\s*chatPanelCollapsed\s*\?\s*CHAT_COLLAPSED_PX\s*:\s*undefined/,
    );
  });

  it('still persists the expanded width via setChatPanelWidth (skips writes when collapsed)', () => {
    // Same guard as terminal: onResize must early-return when collapsed
    // so the bar-clamped pixel value never overwrites the user's chosen
    // expanded width.
    expect(src).toMatch(/if\s*\(\s*chatPanelCollapsed\s*\)\s*return/);
    expect(src).toContain('setChatPanelWidth');
  });

  it('has no gradient / bounce / scale / ping effects in the new collapse bar region', () => {
    // `feedback_no_bounce_animations` + project-wide "no decorative
    // gradients". The collapse bar uses solid backgrounds and opacity
    // only.
    //
    // We check the full file is free of the banned animation classes
    // introduced by this task. The existing sidebar already uses
    // `bg-gradient-to-r` for brand accents and active-pill indicators, so
    // we don't assert the file is gradient-free overall — but we do
    // forbid bounce/ping/scale anywhere.
    expect(src).not.toMatch(/\banimate-bounce\b/);
    expect(src).not.toMatch(/\banimate-ping\b/);
    // `scale-` utilities on the new chat toggle would be out of scope —
    // the sidebar's existing `group-hover:scale-110` on nav icons is
    // pre-existing and scoped to `navItems`. Pin: no `hover:scale-` or
    // `active:scale-` on the chat collapse region. We can't cheaply
    // region-scope the regex, so we use a scope-stable substring: the
    // new constant's presence + a forbidden class within 400 chars.
    const chatConstIdx = src.indexOf('CHAT_COLLAPSED_PX');
    if (chatConstIdx >= 0) {
      // Find the first usage AFTER the constant declaration (the JSX
      // that renders the bar itself).
      const barJsxStart = src.indexOf(
        'CHAT_COLLAPSED_PX',
        chatConstIdx + 'CHAT_COLLAPSED_PX'.length,
      );
      if (barJsxStart >= 0) {
        const barRegion = src.slice(barJsxStart, barJsxStart + 2000);
        expect(barRegion).not.toMatch(/\bhover:scale-/);
        expect(barRegion).not.toMatch(/\bactive:scale-/);
        expect(barRegion).not.toMatch(/\bbg-gradient-/);
      }
    }
  });

  it('references chatPanelRef from a Panel element (imperative handle wired)', () => {
    // react-resizable-panels v4 wires imperative handles via
    // `panelRef={ref}`. Mirror of terminal's line 422.
    expect(src).toMatch(/panelRef=\{\s*chatPanelRef\s*\}/);
  });
});

describe('layout-store.ts — chat collapse state (sanity)', () => {
  // Task006 doesn't change the store — but the layout consumer expects
  // these exact names. Regression lock so renaming the store doesn't
  // silently break the new bar wiring.
  const src = fs.readFileSync(LAYOUT_STORE_PATH, 'utf-8');

  it('exports chatPanelCollapsed + chatPanelWidth + toggleChatPanel + setChatPanelWidth', () => {
    expect(src).toContain('chatPanelCollapsed');
    expect(src).toContain('chatPanelWidth');
    expect(src).toContain('toggleChatPanel');
    expect(src).toContain('setChatPanelWidth');
  });
});

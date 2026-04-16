// tests/chat-history-popover.test.ts
//
// Source-text guardrails for the chat history popover — chat-ux-cleanup
// task007.
//
// Task007 kills the in-panel ConversationSidebar (which duplicated the tab
// bar and wasted ~25% of panel width) and replaces its "recent sessions"
// functionality with a history icon + popover on the collapse bar built in
// task006 (which lives in layout.tsx, NOT chat-panel.tsx).
//
// Vitest excludes the client/ directory, so per
// `reference_vitest_client_excluded` the strategy is source-text guardrails
// on the TSX files + any pure-logic helpers.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const LAYOUT_PATH = path.resolve(ROOT, 'client/src/components/layout.tsx');
const CHAT_PANEL_PATH = path.resolve(
  ROOT,
  'client/src/components/chat/chat-panel.tsx',
);
const SIDEBAR_PATH = path.resolve(
  ROOT,
  'client/src/components/chat/conversation-sidebar.tsx',
);

describe('conversation-sidebar — deleted', () => {
  it('conversation-sidebar.tsx file no longer exists', () => {
    expect(fs.existsSync(SIDEBAR_PATH)).toBe(false);
  });

  it('no client source file imports conversation-sidebar', () => {
    // Walk client/src recursively; any import from
    // '@/components/chat/conversation-sidebar' or a relative path ending in
    // 'conversation-sidebar' is a regression.
    const clientSrc = path.resolve(ROOT, 'client/src');
    const offenders: string[] = [];

    const walk = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (/\.(ts|tsx)$/.test(entry.name)) {
          const src = fs.readFileSync(full, 'utf-8');
          if (/conversation-sidebar/.test(src)) {
            offenders.push(path.relative(ROOT, full));
          }
        }
      }
    };
    walk(clientSrc);

    expect(
      offenders,
      `Files still reference conversation-sidebar: ${offenders.join(', ')}`,
    ).toEqual([]);
  });
});

describe('chat-panel.tsx — sidebar stripped', () => {
  const src = fs.readFileSync(CHAT_PANEL_PATH, 'utf-8');

  it('no longer imports ConversationSidebar', () => {
    // Pin the import statement is gone, and that no JSX element
    // `<ConversationSidebar />` is mounted. We permit the bare word in
    // comments (the inline rationale explaining *why* the sidebar was
    // removed is useful context and not a regression).
    expect(src).not.toMatch(
      /import\s*\{[^}]*ConversationSidebar[^}]*\}\s*from/,
    );
    expect(src).not.toMatch(/<ConversationSidebar\b/);
  });

  it('no longer mounts the sidebar <Panel> inside a horizontal PanelGroup', () => {
    // The old shape was:
    //   <PanelGroup orientation="horizontal">
    //     <Panel defaultSize="25%" ...><ConversationSidebar /></Panel>
    //     <PanelResizeHandle .../>
    //     <Panel minSize="40%"><div ...>tab bar + messages + input</div></Panel>
    //   </PanelGroup>
    // After task007 the chat panel is a single column — no horizontal
    // PanelGroup wrapper for the sidebar split.
    expect(src).not.toMatch(/orientation="horizontal"/);
    expect(src).not.toMatch(/<PanelResizeHandle\b/);
  });

  it('does not import react-resizable-panels aliases used for the sidebar split', () => {
    // After the split is removed there's no reason to import the horizontal
    // panel primitives inside chat-panel.tsx — those are now owned by
    // layout.tsx only. A lingering import is a smell even if unused.
    expect(src).not.toMatch(/from ['"]react-resizable-panels['"]/);
  });

  it('keeps the chat-panel root testid (outer structure unchanged)', () => {
    expect(src).toContain('data-testid="chat-panel"');
  });

  it('still renders ChatTabBar, messages ScrollArea, and composer input', () => {
    // Single-column layout: tab bar → messages → composer. The component
    // names themselves are the regression lock. task002 (chat-composer-
    // controls) swapped the single-line <Input> for a multi-line <textarea>
    // so prompts can span multiple lines.
    expect(src).toContain('<ChatTabBar');
    expect(src).toMatch(/<ScrollArea\b/);
    expect(src).toMatch(/<textarea\b/);
  });
});

describe('layout.tsx — history popover on chat collapse bar', () => {
  const src = fs.readFileSync(LAYOUT_PATH, 'utf-8');

  it('imports shadcn Popover primitives', () => {
    expect(src).toMatch(
      /from ['"]@\/components\/ui\/popover['"]/,
    );
    expect(src).toMatch(/\bPopover\b/);
    expect(src).toMatch(/\bPopoverTrigger\b/);
    expect(src).toMatch(/\bPopoverContent\b/);
  });

  it('imports a history/clock icon from lucide-react for the popover trigger', () => {
    // Either `History` or `Clock` is acceptable per the task contract.
    expect(src).toMatch(/\b(History|Clock)\b/);
  });

  it('uses useChatTabsStore.openTab to hand session clicks back to the tab bar', () => {
    // The popover must route selected sessions through the tab store, not
    // spawn a parallel UI path.
    expect(src).toContain('useChatTabsStore');
    expect(src).toMatch(/\bopenTab\b/);
  });

  it('fetches /api/chat/sessions for the history list', () => {
    // Same endpoint the deleted sidebar used. Exact shape isn't pinned
    // (useQuery vs direct fetch) — just that this endpoint is what drives
    // the popover contents.
    expect(src).toContain('/api/chat/sessions');
  });

  it('keeps the history trigger mounted in BOTH collapsed and expanded states', () => {
    // Contract: the history icon is on the collapse bar itself, which is
    // always rendered (see task006 / chat-collapse-bar testid). The
    // chat-collapse-bar container must still exist after this edit.
    expect(src).toContain('chat-collapse-bar');
    // And the history trigger (either <PopoverTrigger> inline or a
    // <ChatHistoryPopover /> sub-component that wraps it) must sit inside
    // the chat-collapse-bar <div>, not inside a conditional render gated
    // on `!chatPanelCollapsed`. We look for either form within a generous
    // window from the bar testid — the popover trigger itself may live
    // inside a sub-component defined later in the file, which is fine as
    // long as that sub-component is mounted inside the bar.
    const barIdx = src.indexOf('chat-collapse-bar');
    expect(barIdx).toBeGreaterThan(-1);
    const barRegion = src.slice(barIdx, barIdx + 3000);
    expect(barRegion).toMatch(
      /<PopoverTrigger\b|<ChatHistoryPopover\b/,
    );
  });

  it('does not use banned decorative effects in the history popover region', () => {
    // Project-wide rules: no bounce/scale/ping (feedback_no_bounce_animations),
    // no decorative gradients (feedback_no_gradients), no bg-primary opacity
    // variants (reference_dark_theme_primary). We scope the check to the
    // region between `chat-collapse-bar` and the closing `</Panel>` that
    // wraps the chat slot.
    const barIdx = src.indexOf('chat-collapse-bar');
    if (barIdx >= 0) {
      const barRegion = src.slice(barIdx, barIdx + 4000);
      expect(barRegion).not.toMatch(/\banimate-bounce\b/);
      expect(barRegion).not.toMatch(/\banimate-ping\b/);
      expect(barRegion).not.toMatch(/\bhover:scale-/);
      expect(barRegion).not.toMatch(/\bactive:scale-/);
      // bg-primary/40, bg-primary/20, etc. — opacity variants on `primary`.
      expect(barRegion).not.toMatch(/\bbg-primary\/\d+\b/);
      // Decorative gradients introduced by the popover itself.
      // (Pre-existing sidebar brand gradients live outside this region.)
      expect(barRegion).not.toMatch(/\bbg-gradient-to-/);
    }
  });
});

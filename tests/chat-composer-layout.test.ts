// tests/chat-composer-layout.test.ts
//
// Source-text guardrails for the chat composer layout restructure —
// chat-composer-controls task002.
//
// Vitest excludes the client/ directory, so we can't render the component.
// Per `reference_vitest_client_excluded` the strategy is source-text regex
// guards on the TSX to pin the structural invariants this task introduces.
//
// Task002 restructures the bottom input area into three zones:
//   - Left: model dropdown stub (replaced in task003)
//   - Center: multi-line text input (textarea)
//   - Right: plus button, send button, mic icon (disabled)
//
// Stubs exist so subsequent tasks have mounting points. Behavior beyond
// send remains unchanged.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const CHAT_PANEL_PATH = path.resolve(
  ROOT,
  'client/src/components/chat/chat-panel.tsx',
);

describe('chat-panel.tsx — composer layout (task002)', () => {
  const src = fs.readFileSync(CHAT_PANEL_PATH, 'utf-8');

  // -------------------------------------------------------------------------
  // Mounting points: each zone gets a stable data-testid so subsequent tasks
  // (task003 model dropdown, task004 plus popover) can target them without
  // brittle structural traversal.
  // -------------------------------------------------------------------------

  it('wraps the composer in a distinct container with a top border', () => {
    // Composer is its own visual zone, not just a text field. A top border
    // separates it from the scrolling message area above. We search a
    // window around the chat-composer test id so attribute ordering on
    // the element doesn't matter (className may appear before or after
    // data-testid).
    expect(src).toMatch(/data-testid=["']chat-composer["']/);
    const anchor = src.indexOf('data-testid="chat-composer"');
    expect(anchor, 'composer container not found').toBeGreaterThan(-1);
    const window = src.slice(Math.max(0, anchor - 400), anchor + 400);
    expect(window).toMatch(/border-t/);
  });

  it('renders a model selector placeholder slot (left zone)', () => {
    // Task003 swaps this for a real dropdown; task002 only owns the mount.
    expect(src).toMatch(/data-testid=["']chat-composer-model["']/);
  });

  it('renders a plus button placeholder in the right zone (task004 wires behavior)', () => {
    expect(src).toMatch(/data-testid=["']chat-composer-plus["']/);
  });

  it('renders a mic icon placeholder that is disabled', () => {
    // Mic is visually present (so users see the full composer surface) but
    // disabled since voice input is not wired.
    expect(src).toMatch(/data-testid=["']chat-composer-mic["']/);
    // Scope the disabled check to the mic element so we don't accidentally
    // pass on the existing `disabled={isStreaming}` elsewhere in the file.
    const micBlock = src.match(
      /data-testid=["']chat-composer-mic["'][\s\S]{0,300}/,
    );
    expect(micBlock, 'mic element not found').not.toBeNull();
    expect(micBlock![0]).toMatch(/disabled/);
  });

  it('keeps the send button in the composer', () => {
    // Regression lock: the existing send button must stay mounted so the
    // layout-only change preserves behavior.
    expect(src).toMatch(/data-testid=["']chat-composer-send["']/);
  });

  // -------------------------------------------------------------------------
  // Multi-line input: task contract calls for textarea-style input that
  // grows with content (or at least supports multi-line prompts).
  // -------------------------------------------------------------------------

  it('uses a textarea for the message input (multi-line capable)', () => {
    // The old single-line Input primitive is replaced with a <textarea> so
    // long/multi-line prompts don't clip.
    expect(src).toMatch(/<textarea\b/);
  });

  it('textarea is wired to the drafts store (value + onChange)', () => {
    // Same wiring as before, just on a textarea element — per-tab drafts
    // must still round-trip through useChatStore.drafts.
    // Anchor on the JSX opening tag (newline + indent + `<textarea`) so we
    // don't match the literal `<textarea>` in the explanatory comment above.
    // The opening tag of the element spans many lines; grab a generous
    // window that covers attributes up to the first `/>` or `>\n`.
    // Match the full opening tag: the textarea is self-closing (`/>`), so
    // anchor on `<textarea` and consume up to the literal `/>`. Using a
    // non-self-closing `>` alone would match `<textarea>` from the comment.
    const textareaBlock = src.match(/\n\s+<textarea\b[\s\S]*?\/>/);
    expect(textareaBlock, 'textarea element not found').not.toBeNull();
    expect(textareaBlock![0]).toMatch(/value=\{input\}/);
    expect(textareaBlock![0]).toMatch(/setDraft\(\s*conversationId\s*,/);
  });

  it('textarea still supports Enter-to-submit (Shift+Enter for newline)', () => {
    // Multi-line friendly: Enter submits, Shift+Enter inserts a newline.
    // The handler must check shiftKey so newlines remain possible.
    // Match the full opening tag: the textarea is self-closing (`/>`), so
    // anchor on `<textarea` and consume up to the literal `/>`. Using a
    // non-self-closing `>` alone would match `<textarea>` from the comment.
    const textareaBlock = src.match(/\n\s+<textarea\b[\s\S]*?\/>/);
    expect(textareaBlock, 'textarea element not found').not.toBeNull();
    expect(textareaBlock![0]).toMatch(/onKeyDown/);
    expect(textareaBlock![0]).toMatch(/e\.key\s*===\s*['"]Enter['"]/);
    expect(textareaBlock![0]).toMatch(/shiftKey/);
  });

  it('textarea disables while streaming (preserves rapid-resubmit guard)', () => {
    // Match the full opening tag: the textarea is self-closing (`/>`), so
    // anchor on `<textarea` and consume up to the literal `/>`. Using a
    // non-self-closing `>` alone would match `<textarea>` from the comment.
    const textareaBlock = src.match(/\n\s+<textarea\b[\s\S]*?\/>/);
    expect(textareaBlock, 'textarea element not found').not.toBeNull();
    expect(textareaBlock![0]).toMatch(/disabled=\{isStreaming\}/);
  });

  // -------------------------------------------------------------------------
  // Style guardrails per CLAUDE.md and memory flags.
  // -------------------------------------------------------------------------

  it('composer region has no gradient or bounce/scale animations', () => {
    // Scope: only check around the composer container so we don't trip on
    // unrelated parts of the file (there aren't any gradients today, but
    // future edits shouldn't be able to smuggle one in under this feature).
    const idx = src.indexOf('data-testid="chat-composer"');
    expect(idx, 'composer container anchor not found').toBeGreaterThan(-1);
    const region = src.slice(idx, idx + 3000);
    expect(region).not.toMatch(/\bbg-gradient-/);
    expect(region).not.toMatch(/\btext-gradient\b/);
    expect(region).not.toMatch(/\banimate-bounce\b/);
    expect(region).not.toMatch(/\bhover:scale-/);
    expect(region).not.toMatch(/\bactive:scale-/);
  });

  it('imports Plus and Mic icons from lucide-react', () => {
    // Icon mounts are part of the contract — pin the import so future edits
    // don't silently swap to text labels.
    expect(src).toMatch(
      /import\s*\{[^}]*\b(Plus|Mic)\b[^}]*\}\s*from\s*['"]lucide-react['"]/,
    );
    expect(src).toMatch(/\bPlus\b/);
    expect(src).toMatch(/\bMic\b/);
  });
});

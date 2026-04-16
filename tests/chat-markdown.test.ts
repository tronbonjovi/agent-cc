// tests/chat-markdown.test.ts
//
// Source-text guardrails for M9 chat-ux-cleanup task004 — markdown rendering
// in the chat surface.
//
// Per project convention (see CLAUDE.md + reference_vitest_client_excluded),
// vitest excludes `client/`, so we cannot do RTL renders here. These are
// regex checks over the renderer source that pin the intended architecture:
// assistant text goes through react-markdown with GFM + syntax highlighting,
// user text stays plain, and fenced code blocks get a copy-to-clipboard
// button. Pattern mirrors `chat-commands-source.test.ts` and the source-text
// half of `interaction-event-renderer.test.ts`.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const RENDERER_PATH = path.resolve(
  ROOT,
  'client/src/components/chat/interaction-event-renderer.tsx'
);
const PACKAGE_JSON_PATH = path.resolve(ROOT, 'package.json');

describe('chat markdown rendering — source guardrails', () => {
  const src = fs.readFileSync(RENDERER_PATH, 'utf-8');

  it('renderer imports react-markdown', () => {
    // Default import from 'react-markdown' — that's the idiomatic shape.
    expect(src).toMatch(/import\s+\w+\s+from\s+['"]react-markdown['"]/);
  });

  it('renderer imports remark-gfm', () => {
    expect(src).toMatch(/import\s+\w+\s+from\s+['"]remark-gfm['"]/);
  });

  it('renderer imports rehype-highlight', () => {
    expect(src).toMatch(/import\s+\w+\s+from\s+['"]rehype-highlight['"]/);
  });

  it('renderer imports a highlight.js theme CSS', () => {
    // Accept any highlight.js styles/*.css — picking the exact theme is a
    // visual choice, what this test pins is "the CSS is imported somewhere
    // in the renderer module".
    expect(src).toMatch(/import\s+['"]highlight\.js\/styles\/[^'"]+\.css['"]/);
  });

  it('renderer wires remarkPlugins and rehypePlugins on ReactMarkdown', () => {
    // The plugins must actually be passed through, not just imported.
    expect(src).toMatch(/remarkPlugins=\{[^}]*remarkGfm[^}]*\}/);
    expect(src).toMatch(/rehypePlugins=\{[^}]*rehypeHighlight[^}]*\}/);
  });

  it('fenced code blocks have a copy-to-clipboard pattern', () => {
    // Any one of these shapes counts as a copy affordance:
    //   - a component named like CodeBlock / CopyButton
    //   - a handler named like handleCopy / copyToClipboard / onCopy
    //   - a direct clipboard.writeText call
    // We require at least one, AND the actual clipboard API call, so a stub
    // component with no wire-up would still fail.
    const hasCopyComponent =
      /function\s+(CodeBlock|CopyButton)\s*\(/.test(src) ||
      /const\s+(CodeBlock|CopyButton)\s*[:=]/.test(src);
    const hasCopyHandler =
      /\b(handleCopy|copyToClipboard|onCopy)\b/.test(src);
    const hasClipboardWrite = /navigator\.clipboard\.writeText\s*\(/.test(src);

    expect(hasCopyComponent || hasCopyHandler).toBe(true);
    expect(hasClipboardWrite).toBe(true);
  });

  it('distinguishes inline code from fenced code blocks', () => {
    // The custom `code` renderer override must branch on `inline` so inline
    // backticks stay inline (no copy button) and fenced blocks get the
    // highlighted + copyable treatment.
    expect(src).toMatch(/\binline\b/);
  });

  it('keeps user bubbles plain text (no ReactMarkdown for user role)', () => {
    // Narrow check: the markdown path must be gated behind an assistant-role
    // check somewhere in TextBubble. We don't want to pin an exact expression
    // shape (to avoid brittleness), but at minimum both branches must still
    // exist — i.e. the renderer still references `event.role === 'user'` so
    // user messages go through the plain-text path.
    expect(src).toMatch(/event\.role\s*===\s*['"]user['"]/);
    expect(src).toMatch(/event\.role\s*===\s*['"]assistant['"]/);
  });

  it('has no bounce/scale cartoonish animations', () => {
    // Project safety rule (feedback_no_bounce_animations).
    expect(src).not.toMatch(/\banimate-bounce\b/);
    expect(src).not.toMatch(/\bactive:scale-/);
  });

  it('has no gradient classes', () => {
    // User preference (feedback_no_gradients).
    expect(src).not.toMatch(/bg-gradient/);
    expect(src).not.toMatch(/from-\[/);
    expect(src).not.toMatch(/via-\[/);
    expect(src).not.toMatch(/to-\[/);
    expect(src).not.toMatch(/text-gradient/);
  });

  it('does not introduce bg-primary/* on distinctive markdown elements', () => {
    // Per reference_dark_theme_primary memory: `--primary` is near-white, so
    // `bg-primary/*` on distinctive UI renders as washed-out gray. The
    // existing user bubble intentionally uses `bg-primary text-primary-foreground`
    // for the solid user-bubble fill — that's load-bearing and predates this
    // task. What we guard against here is new `bg-primary/<opacity>` on
    // markdown widgets (code block wrappers, copy button backgrounds, etc.),
    // which would be the easy-to-reach-for wrong choice.
    expect(src).not.toMatch(/bg-primary\/\d/);
  });
});

describe('package.json — markdown deps declared', () => {
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf-8')) as {
    dependencies?: Record<string, string>;
  };
  const deps = pkg.dependencies ?? {};

  it.each([
    ['react-markdown'],
    ['remark-gfm'],
    ['rehype-highlight'],
    ['highlight.js'],
  ])('%s is declared as a direct dependency', (name) => {
    expect(deps[name], `${name} missing from package.json dependencies`).toBeDefined();
  });
});

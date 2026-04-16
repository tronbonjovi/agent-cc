// tests/source-filter.test.ts
//
// Source-text guardrails for the SourceFilter component shipped in
// chat-import-platforms task005. Vitest excludes the client/ directory
// (see reference_vitest_client_excluded in memory), so we can't render
// React here — instead we pin the structural invariants of the component
// against its TSX source file with regex assertions.
//
// The variant-picking logic (`pickFilterVariant`) and the canonical
// `FILTER_MODES` tuple both live in @/lib/conversation-grouping and have
// dedicated unit tests in tests/conversation-grouping.test.ts. This file
// just locks in:
//
//   1. the component imports the canonical FILTER_MODES + pickFilterVariant
//      from @/lib/conversation-grouping (no re-implementing the tuple)
//   2. it iterates FILTER_MODES rather than hard-coding chip values
//   3. it uses the shadcn Button component
//   4. it exposes data-testid="filter-{mode}" for each chip
//   5. it routes onClick to the onChange prop
//   6. its FilterMode type comes from the shared helper, not redefined locally
//
// Maps to the 3 contract test cases for the component:
//   1. Renders 4 filter chips                — guardrail (FILTER_MODES iteration)
//   2. Active chip uses default variant      — guardrail (pickFilterVariant import)
//   3. Clicking chip calls onChange          — guardrail (onClick → onChange)
//
// The variant-by-mode behavior itself is pinned by the pickFilterVariant
// unit tests in tests/conversation-grouping.test.ts.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const SOURCE_FILTER_PATH = path.resolve(
  ROOT,
  'client/src/components/chat/source-filter.tsx',
);

describe('source-filter.tsx — source guardrails', () => {
  const src = fs.readFileSync(SOURCE_FILTER_PATH, 'utf-8');
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  it('imports FILTER_MODES, pickFilterVariant, and FilterMode from the grouping helper', () => {
    expect(src).toMatch(/from ['"]@\/lib\/conversation-grouping['"]/);
    expect(src).toContain('FILTER_MODES');
    expect(src).toContain('pickFilterVariant');
    expect(src).toContain('FilterMode');
  });

  it('imports the shadcn Button component', () => {
    expect(src).toMatch(/from ['"]@\/components\/ui\/button['"]/);
    expect(src).toContain('Button');
  });

  it('iterates FILTER_MODES rather than hard-coding chip values', () => {
    // The chip layout must come from the canonical tuple so adding a new
    // mode to FILTER_MODES propagates to the UI without an edit here.
    expect(codeOnly).toMatch(/FILTER_MODES\.map\(/);
  });

  it('renders one Button per mode with data-testid="filter-{option}"', () => {
    // The data-testid pattern is pinned because task006 E2E tests need it
    // to drive the chips from Playwright.
    expect(codeOnly).toMatch(/data-testid=\{`filter-\$\{option\}`\}/);
    expect(codeOnly).toMatch(/<Button\b/);
  });

  it('uses pickFilterVariant for the active-chip variant', () => {
    // Pure-function variant selection means the active-state behavior is
    // unit-testable in conversation-grouping.test.ts. The component must
    // route through the helper rather than inline the ternary.
    expect(codeOnly).toMatch(/variant=\{pickFilterVariant\(mode, option\)\}/);
  });

  it('routes the chip onClick to the onChange prop with the option value', () => {
    expect(codeOnly).toMatch(/onClick=\{\(\) => onChange\(option\)\}/);
  });

  it('exposes aria-pressed for screen readers and the source-filter testid root', () => {
    // aria-pressed is the standard semantic for toggle-style buttons; the
    // root testid lets E2E grab the filter row in one hop.
    expect(codeOnly).toMatch(/aria-pressed=\{mode === option\}/);
    expect(codeOnly).toMatch(/data-testid="source-filter"/);
  });

  it('does not introduce `any` (strict TS hygiene)', () => {
    // Mirrors the no-any guardrail from conversation-sidebar.test.ts so a
    // future edit can't quietly soften the prop types.
    expect(codeOnly).not.toMatch(/\bany\b/);
  });

  it('does not redefine FILTER_MODES locally', () => {
    // Regression guard — the only canonical FILTER_MODES lives in
    // @/lib/conversation-grouping. Re-declaring it here would let the chip
    // ordering drift from the filter helper.
    expect(codeOnly).not.toMatch(/const FILTER_MODES\s*=/);
  });
});

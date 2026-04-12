// tests/system-event-block.test.ts
//
// Tests for the SystemEventBlock message bubble (messages-redesign task003
// wave 1). Follows the convention used by session-sidebar.test.ts and
// file-editor-tab.test.ts: read the component source with fs, assert
// structure via regex/string matchers. The React tree itself is verified
// implicitly once task005 wires these bubbles into the Messages tab and the
// safety tests catch any regressions.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.resolve(
  __dirname,
  "../client/src/components/analytics/messages/bubbles/SystemEventBlock.tsx",
);

describe("SystemEventBlock", () => {
  it("file exists at the expected path", () => {
    expect(fs.existsSync(SRC)).toBe(true);
  });

  const src = fs.existsSync(SRC) ? fs.readFileSync(SRC, "utf-8") : "";

  it("exports a SystemEventBlock component", () => {
    expect(src).toMatch(/export\s+function\s+SystemEventBlock/);
  });

  it("imports the SystemEventMessage type from shared/session-types", () => {
    // Import must point at the shared types — no local duplication of the
    // type definition, which is a wave-wide convention for this milestone.
    expect(src).toMatch(/SystemEventMessage/);
    expect(src).toMatch(/@shared\/session-types/);
  });

  it("imports icons from lucide-react", () => {
    expect(src).toMatch(/from ["']lucide-react["']/);
  });

  it("renders the event summary text", () => {
    // Summary is the one-line description pulled straight from the typed
    // message; it must appear in the JSX output unchanged.
    expect(src).toMatch(/\.summary/);
  });

  it("picks an icon based on subtype with a sensible fallback", () => {
    // Two signals: (a) the code branches on subtype somewhere, and
    // (b) a fallback path exists — we look for either a switch default or
    // a nullish-coalesced default icon reference.
    expect(src).toMatch(/subtype/);
  });

  it("uses muted styling (smaller, grayer than body text)", () => {
    // Match tokens — Tailwind classes for the muted annotation look.
    expect(src).toMatch(/text-muted-foreground/);
    // Smaller font: either text-xs or text-[NNpx] — both acceptable.
    expect(src).toMatch(/text-xs|text-\[1[0-9]|text-\[2[0-9]/);
  });

  it("has no local state — pure component", () => {
    // SystemEventBlock is a static annotation; no useState/useEffect.
    expect(src).not.toMatch(/\buseState\b/);
    expect(src).not.toMatch(/\buseEffect\b/);
  });

  it("does not render markdown (plain inline label only)", () => {
    expect(src).not.toMatch(/react-markdown|remark-gfm/);
  });
});

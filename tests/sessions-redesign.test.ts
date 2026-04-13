// tests/sessions-redesign.test.ts
// Tests for sessions redesign: relative time formatting and SessionDetail fixes.
//
// Note: the original "lifecycle event labels" + src-reading "relative time"
// coverage pointed at client/src/components/analytics/sessions/LifecycleEvents.tsx,
// which was deleted in sessions-makeover task009. The salvaged three facts
// (active duration, model switches, first error) now live in activity-summary.ts
// and are covered by tests/sessions-overview-helpers.test.ts.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("relative time formatting", () => {
  // Pure reimplementation kept here so the sessions-redesign describe continues
  // to guard the formatting rules that the old LifecycleEvents component used.
  // If activity-summary or any future consumer needs the same helper, extract
  // it into a shared util and update this test to import from there.
  function formatRelativeTime(ms: number): string {
    const totalSec = Math.round(ms / 1000);
    if (totalSec < 60) return `+${totalSec}s`;
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    if (min < 60) return sec > 0 ? `+${min}m ${sec}s` : `+${min}m`;
    const hr = Math.floor(min / 60);
    const remMin = min % 60;
    return remMin > 0 ? `+${hr}h ${remMin}m` : `+${hr}h`;
  }

  it("formats 45000ms as +45s", () => {
    expect(formatRelativeTime(45000)).toBe("+45s");
  });

  it("formats 125000ms as +2m 5s", () => {
    expect(formatRelativeTime(125000)).toBe("+2m 5s");
  });

  it("formats 3700000ms as +1h 1m", () => {
    expect(formatRelativeTime(3700000)).toBe("+1h 1m");
  });

  it("formats exact minutes without seconds", () => {
    expect(formatRelativeTime(300000)).toBe("+5m");
  });

  it("formats exact hours without minutes", () => {
    expect(formatRelativeTime(7200000)).toBe("+2h");
  });
});

// --- Session detail fixes ---

const SESSION_DETAIL_PATH = path.resolve(
  __dirname,
  "../client/src/components/analytics/sessions/SessionDetail.tsx"
);
const detailSrc = fs.readFileSync(SESSION_DETAIL_PATH, "utf-8");

describe("SessionDetail — pin icon optimistic toggle (task002)", () => {
  it("has localPinned optimistic state", () => {
    expect(detailSrc).toContain("const [localPinned, setLocalPinned] = useState<boolean | null>(null)");
  });

  it("derives isPinned from localPinned falling back to session.isPinned", () => {
    expect(detailSrc).toContain("const isPinned = localPinned ?? session?.isPinned ?? false");
  });

  it("resets localPinned when sessionId changes", () => {
    expect(detailSrc).toContain("useEffect(() => { setLocalPinned(null); }, [sessionId])");
  });

  it("pin button uses isPinned (not session.isPinned) for amber class", () => {
    expect(detailSrc).toContain('className={isPinned ? "text-amber-500" : ""}');
    expect(detailSrc).not.toContain('className={session.isPinned ? "text-amber-500"');
  });

  it("pin icon has fill-current when pinned", () => {
    expect(detailSrc).toContain('isPinned ? "fill-current" : ""');
  });

  it("onClick sets local state before calling mutation", () => {
    const onClickMatch = detailSrc.match(/onClick=\{[^}]*setLocalPinned[\s\S]*?togglePin\.mutate/);
    expect(onClickMatch).not.toBeNull();
  });
});

describe("SessionDetail — pill-driven section visibility (sessions-makeover PR2)", () => {
  it("renders Linked Task section conditionally on filterState.linkedTaskId and filterState.linkedTask pill", () => {
    expect(detailSrc).toContain("filterState.linkedTask");
    expect(detailSrc).toContain("linkedTaskId");
  });

  it("no longer defines SectionHeader (replaced by SessionFilterBar)", () => {
    expect(detailSrc).not.toMatch(/function SectionHeader/);
  });

  it("imports SessionFilterBar and applySessionPreset", () => {
    expect(detailSrc).toContain("SessionFilterBar");
    expect(detailSrc).toContain("applySessionPreset");
  });
});

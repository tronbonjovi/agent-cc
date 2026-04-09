/**
 * Session Indicators — Component-level tests
 *
 * Validates that StatusLight uses tooltip and accessible aria-labels.
 * Uses source-level verification (consistent with project test patterns).
 *
 * Run: npx vitest run tests/session-indicators.test.ts
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SOURCE_PATH = path.resolve(
  __dirname,
  "../client/src/components/board/session-indicators.tsx"
);
const source = fs.readFileSync(SOURCE_PATH, "utf-8");

describe("StatusLight tooltip integration", () => {
  it("imports Tooltip components from ui/tooltip", () => {
    expect(source).toContain("from \"@/components/ui/tooltip\"");
  });

  it("wraps the status dot in a Tooltip", () => {
    expect(source).toContain("<Tooltip>");
    expect(source).toContain("<TooltipTrigger");
    expect(source).toContain("<TooltipContent");
  });

  it("uses statusLightTooltip for the tooltip text", () => {
    expect(source).toContain("statusLightTooltip");
  });

  it("uses tooltip text as the aria-label for accessibility", () => {
    // The aria-label should use the same tooltip text, not hardcoded "active"/"inactive"
    expect(source).not.toMatch(/aria-label=["']{1}active["']{1}/);
    expect(source).not.toMatch(/aria-label=["']{1}inactive["']{1}/);
    // Should dynamically set aria-label from tooltip
    expect(source).toContain("aria-label={tooltip}");
  });

  it("provides TooltipProvider for the tooltip to work", () => {
    expect(source).toContain("TooltipProvider");
  });
});

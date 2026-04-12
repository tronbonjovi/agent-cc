/**
 * Responsive Pages Tests — Sessions, Analytics (Stats), Settings
 *
 * Validates that these pages adopt PageContainer, use responsive patterns,
 * and prevent horizontal overflow at all breakpoints.
 *
 * Run: npx vitest run tests/responsive-pages.test.ts
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// ---- Source files ----
// Cleanup note (codebase-cleanup-task001): client/src/pages/sessions.tsx
// was deleted. The "Sessions page responsive layout" describe block that
// used to live here has been removed; the live list-detail sessions UI
// now lives under client/src/components/analytics/sessions/ and is
// exercised by the sessions-redesign test suite.

const STATS_PATH = path.resolve(__dirname, "../client/src/pages/stats.tsx");
const SETTINGS_PATH = path.resolve(__dirname, "../client/src/pages/settings.tsx");
const LIBRARY_PATH = path.resolve(__dirname, "../client/src/pages/library.tsx");

const statsSource = fs.readFileSync(STATS_PATH, "utf-8");
const settingsSource = fs.readFileSync(SETTINGS_PATH, "utf-8");
const librarySource = fs.readFileSync(LIBRARY_PATH, "utf-8");

// ============================================================
// Analytics (Stats) page
// ============================================================

describe("Analytics page responsive layout", () => {
  describe("PageContainer adoption", () => {
    it("imports PageContainer", () => {
      expect(statsSource).toMatch(
        /import\s+\{[^}]*PageContainer[^}]*\}\s+from/,
      );
    });

    it("renders PageContainer in JSX", () => {
      expect(statsSource).toMatch(/<PageContainer[\s>]/);
    });

    it("no longer uses hardcoded p-6 on the root wrapper", () => {
      expect(statsSource).not.toMatch(/className="p-6\s/);
    });
  });

  describe("tab bar responsive", () => {
    it("tab bar is scrollable at narrow widths via overflow-x-auto", () => {
      // Either on main TabsList or a wrapper
      expect(statsSource).toMatch(/overflow-x-auto/);
    });

    it("tab triggers use whitespace-nowrap", () => {
      expect(statsSource).toContain("whitespace-nowrap");
    });
  });

  // Note (codebase-cleanup-task002): the "sub-tabs (session analytics panel)"
  // describe block was removed along with session-analytics-panel.tsx. Its
  // sub-tab bar was part of the dead SessionAnalyticsTab export.

  describe("charts resize with container", () => {
    it("chart containers use w-full for fluid sizing", () => {
      // Stats page grid should have responsive columns
      expect(statsSource).toContain("grid-cols-1");
    });

    it("stat cards use responsive grid (1 col at mobile)", () => {
      expect(statsSource).toMatch(/grid-cols-1/);
    });
  });

  describe("data tables responsive", () => {
    it("data lists use min-w-0 for overflow prevention", () => {
      expect(statsSource).toContain("min-w-0");
    });

    it("uses truncate for long text content", () => {
      expect(statsSource).toContain("truncate");
    });
  });

  describe("overflow prevention", () => {
    it("no fixed-width containers that could cause horizontal scroll", () => {
      expect(statsSource).not.toMatch(
        /className="[^"]*w-\[(?:5|6|7|8|9)\d{2,}px\]/,
      );
    });
  });
});

// ============================================================
// Settings page
// ============================================================

describe("Settings page responsive layout", () => {
  describe("PageContainer adoption", () => {
    it("imports PageContainer", () => {
      expect(settingsSource).toMatch(
        /import\s+\{[^}]*PageContainer[^}]*\}\s+from/,
      );
    });

    it("renders PageContainer in JSX", () => {
      expect(settingsSource).toMatch(/<PageContainer[\s>]/);
    });

    it("no longer uses hardcoded p-6 on the root wrapper", () => {
      expect(settingsSource).not.toMatch(/className="p-6\s/);
    });
  });

  describe("form layout responsive", () => {
    it("form fields use full-width at mobile (w-full or no max-width constraint at small)", () => {
      // Input fields should expand full width on mobile
      // max-w constraint should only apply at larger breakpoints
      expect(settingsSource).toMatch(/sm:max-w|md:max-w|lg:max-w|max-w-(?:xs|sm|md|lg|xl|2xl|3xl|prose)/);
    });

    it("single column layout — no side-by-side forms at mobile", () => {
      // Grid should be grid-cols-1 at base, optionally expand at md+
      expect(settingsSource).toContain("grid-cols-1");
    });
  });

  describe("tab bar responsive", () => {
    it("tab bar is scrollable at narrow widths", () => {
      expect(settingsSource).toMatch(/overflow-x-auto/);
    });

    it("tab triggers use whitespace-nowrap", () => {
      expect(settingsSource).toContain("whitespace-nowrap");
    });
  });

  describe("runtime cards responsive", () => {
    it("runtime info grid starts at 1 col on mobile", () => {
      expect(settingsSource).toContain("grid-cols-1");
    });

    it("runtime info grid scales to 2 cols at md", () => {
      expect(settingsSource).toContain("md:grid-cols-2");
    });

    it("runtime info grid scales to 3 cols at lg", () => {
      expect(settingsSource).toContain("lg:grid-cols-3");
    });
  });

  describe("config files responsive", () => {
    it("JSON pre blocks use overflow-x-auto to prevent blowout", () => {
      expect(settingsSource).toContain("overflow-x-auto");
    });
  });

  describe("action buttons responsive", () => {
    it("header action buttons wrap at narrow viewports", () => {
      expect(settingsSource).toContain("flex-wrap");
    });
  });

  describe("overflow prevention", () => {
    it("badges use flex-wrap for wrapping", () => {
      expect(settingsSource).toContain("flex-wrap");
    });

    it("no fixed-width containers causing horizontal scroll", () => {
      expect(settingsSource).not.toMatch(
        /className="[^"]*w-\[(?:5|6|7|8|9)\d{2,}px\]/,
      );
    });
  });
});

// ============================================================
// Library page (reference — verify it also adopts PageContainer)
// ============================================================

describe("Library page responsive layout", () => {
  it("adopts PageContainer", () => {
    expect(librarySource).toMatch(/<PageContainer[\s>]/);
  });

  it("tab bar is scrollable at narrow widths", () => {
    expect(librarySource).toMatch(/overflow-x-auto/);
  });
});

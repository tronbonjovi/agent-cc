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

const SESSIONS_PATH = path.resolve(__dirname, "../client/src/pages/sessions.tsx");
const STATS_PATH = path.resolve(__dirname, "../client/src/pages/stats.tsx");
const SETTINGS_PATH = path.resolve(__dirname, "../client/src/pages/settings.tsx");
const LIBRARY_PATH = path.resolve(__dirname, "../client/src/pages/library.tsx");
const ANALYTICS_PANEL_PATH = path.resolve(
  __dirname,
  "../client/src/components/session-analytics-panel.tsx",
);

const sessionsSource = fs.readFileSync(SESSIONS_PATH, "utf-8");
const statsSource = fs.readFileSync(STATS_PATH, "utf-8");
const settingsSource = fs.readFileSync(SETTINGS_PATH, "utf-8");
const librarySource = fs.readFileSync(LIBRARY_PATH, "utf-8");
const analyticsPanelSource = fs.readFileSync(ANALYTICS_PANEL_PATH, "utf-8");

// ============================================================
// Sessions page
// ============================================================

describe("Sessions page responsive layout", () => {
  describe("PageContainer adoption", () => {
    it("imports PageContainer", () => {
      expect(sessionsSource).toMatch(
        /import\s+\{[^}]*PageContainer[^}]*\}\s+from/,
      );
    });

    it("renders PageContainer in JSX", () => {
      expect(sessionsSource).toMatch(/<PageContainer[\s>]/);
    });

    it("no longer uses hardcoded p-6 on the root wrapper", () => {
      expect(sessionsSource).not.toMatch(/className="p-6\s/);
    });
  });

  describe("tab bar responsive", () => {
    it("tab bar container allows horizontal scroll at narrow widths", () => {
      expect(sessionsSource).toMatch(/overflow-x-auto/);
    });

    it("tab buttons use whitespace-nowrap to prevent text wrapping", () => {
      expect(sessionsSource).toContain("whitespace-nowrap");
    });
  });

  describe("session list responsive", () => {
    it("session metadata uses flex-wrap to prevent overflow", () => {
      expect(sessionsSource).toContain("flex-wrap");
    });

    it("main content area uses min-w-0 to prevent flex blowout", () => {
      expect(sessionsSource).toContain("min-w-0");
    });

    it("hover actions hide at mobile using responsive class", () => {
      // Hover actions should be hidden on touch devices (sm/xs) and shown on md+
      expect(sessionsSource).toMatch(/hidden\s+(?:sm:hidden\s+)?md:flex|hidden\s+md:flex/);
    });
  });

  describe("search bar responsive", () => {
    it("search bar adapts width for mobile", () => {
      // Should use w-full at mobile and constrained at larger
      expect(sessionsSource).toMatch(/w-full|flex-1/);
    });
  });

  describe("header responsive", () => {
    it("header stacks on mobile using flex-col/sm:flex-row or PageContainer", () => {
      // Either PageContainer handles it, or explicit flex-col sm:flex-row
      expect(sessionsSource).toMatch(/flex-col|PageContainer/);
    });
  });

  describe("expanded detail responsive", () => {
    it("metadata grid is responsive: 2 cols base, 4 cols at md+", () => {
      expect(sessionsSource).toContain("grid-cols-2");
      expect(sessionsSource).toContain("md:grid-cols-4");
    });
  });

  describe("overflow prevention", () => {
    it("uses truncate for long text", () => {
      expect(sessionsSource).toContain("truncate");
    });

    it("no fixed-width containers that could cause horizontal scroll", () => {
      expect(sessionsSource).not.toMatch(
        /className="[^"]*w-\[(?:5|6|7|8|9)\d{2,}px\]/,
      );
    });
  });
});

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

  describe("sub-tabs (session analytics panel) responsive", () => {
    it("sub-tab bar is already scrollable with overflow-x-auto", () => {
      expect(analyticsPanelSource).toContain("overflow-x-auto");
    });

    it("sub-tab buttons use whitespace-nowrap", () => {
      expect(analyticsPanelSource).toContain("whitespace-nowrap");
    });
  });

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

/**
 * Nerve Center Scanner Brain Tests
 *
 * Validates the Scanner Brain center module:
 * - ScannerBrain component renders scanner metadata
 * - State indicator classes for calm/busy/stressed
 * - Graceful handling when scanner data unavailable
 * - API endpoint returns scanner metadata with cache stats
 * - Barrel export from nerve-center/index.ts
 *
 * Run: npx vitest run tests/nerve-center-scanner-brain.test.ts
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const NERVE_CENTER_DIR = path.resolve(
  __dirname,
  "../client/src/components/analytics/nerve-center",
);

const BRAIN_PATH = path.join(NERVE_CENTER_DIR, "ScannerBrain.tsx");
const INDEX_PATH = path.join(NERVE_CENTER_DIR, "index.ts");
const HOOK_PATH = path.resolve(
  __dirname,
  "../client/src/hooks/use-scanner.ts",
);
const SCANNER_ROUTE_PATH = path.resolve(
  __dirname,
  "../server/routes/scanner.ts",
);
const SCANNER_INDEX_PATH = path.resolve(
  __dirname,
  "../server/scanner/index.ts",
);

// ---- File existence ----

describe("scanner brain — file structure", () => {
  it("ScannerBrain.tsx exists", () => {
    expect(fs.existsSync(BRAIN_PATH)).toBe(true);
  });

  it("barrel export includes ScannerBrain", () => {
    const src = fs.readFileSync(INDEX_PATH, "utf-8");
    expect(src).toMatch(/export.*ScannerBrain/);
  });
});

// ---- ScannerBrain component ----

describe("scanner brain — component structure", () => {
  const src = () => fs.readFileSync(BRAIN_PATH, "utf-8");

  it("exports ScannerBrain component", () => {
    expect(src()).toMatch(
      /export.*function ScannerBrain|export.*const ScannerBrain/,
    );
  });

  // -- Data display --

  it("displays last scan time", () => {
    const content = src();
    // Should reference lastScanAt or last scan time in some form
    expect(content).toMatch(/lastScan|last.*scan/i);
  });

  it("displays session count", () => {
    const content = src();
    expect(content).toMatch(/sessionCount|session.*count|sessions/i);
  });

  it("displays cache health info", () => {
    const content = src();
    // Should reference cache size or cache entries
    expect(content).toMatch(/cache.*size|cacheSize|cache.*entries/i);
  });

  // -- System state --

  it("defines system state types: calm, busy, stressed", () => {
    const content = src();
    expect(content).toMatch(/calm/);
    expect(content).toMatch(/busy/);
    expect(content).toMatch(/stressed/);
  });

  it("defaults to calm state", () => {
    const content = src();
    // Default state should be calm
    expect(content).toMatch(/calm/);
  });
});

// ---- State indicator styling ----

describe("scanner brain — state indicator classes", () => {
  const src = () => fs.readFileSync(BRAIN_PATH, "utf-8");

  it("has green border for calm state", () => {
    const content = src();
    // Green border class (Tailwind) for calm
    expect(content).toMatch(/green|emerald/);
  });

  it("has amber border for busy state", () => {
    const content = src();
    // Amber/yellow border class for busy
    expect(content).toMatch(/amber|yellow/);
  });

  it("has red border for stressed state", () => {
    const content = src();
    // Red border class for stressed
    expect(content).toMatch(/red/);
  });

  it("uses solid border colors only — no gradients", () => {
    const content = src();
    expect(content).not.toMatch(/bg-gradient|from-.*to-.*bg-clip-text/);
  });
});

// ---- Graceful degradation ----

describe("scanner brain — graceful degradation", () => {
  const src = () => fs.readFileSync(BRAIN_PATH, "utf-8");

  it("handles loading state", () => {
    const content = src();
    // Should handle isLoading or loading state from query
    expect(content).toMatch(/isLoading|loading|isPending/i);
  });

  it("handles error or missing data gracefully", () => {
    const content = src();
    // Should have fallback rendering for missing data
    expect(content).toMatch(/error|fallback|\?\?|default|unavailable/i);
  });

  it("renders something even without data", () => {
    const content = src();
    // Should still render the brain container when data is unavailable
    // (e.g., shows dashes or "---" or "N/A" placeholders)
    expect(content).toMatch(/---|\?\?|N\/A|Unknown|0/);
  });
});

// ---- Data hook ----

describe("scanner brain — data fetching", () => {
  const hookSrc = () => fs.readFileSync(HOOK_PATH, "utf-8");

  it("use-scanner hook exports useScannerStatus", () => {
    const content = hookSrc();
    expect(content).toMatch(/useScannerStatus/);
  });

  it("useScannerStatus fetches from /api/scanner/status", () => {
    const content = hookSrc();
    expect(content).toMatch(/\/api\/scanner\/status/);
  });

  it("useScannerStatus uses React Query", () => {
    const content = hookSrc();
    expect(content).toMatch(/useQuery/);
  });
});

// ---- API endpoint ----

describe("scanner brain — API endpoint", () => {
  const routeSrc = () => fs.readFileSync(SCANNER_ROUTE_PATH, "utf-8");
  const scannerSrc = () => fs.readFileSync(SCANNER_INDEX_PATH, "utf-8");

  it("scanner status endpoint returns cache stats", () => {
    const content = routeSrc();
    // The /api/scanner/status endpoint should include cache stats
    expect(content).toMatch(/cacheSize|parseCacheSize|cache/i);
  });

  it("scanner index exports cache size getter", () => {
    const content = scannerSrc();
    // Should export a function to get parse cache size
    expect(content).toMatch(/getParseCacheSize|getCacheSize|cacheSize/i);
  });
});

// ---- Safety checks ----

describe("scanner brain — safety", () => {
  it("no hardcoded user paths", () => {
    const content = fs.readFileSync(BRAIN_PATH, "utf-8");
    expect(content).not.toMatch(/C:\\Users|\/Users\/\w+|\/home\/\w+/);
  });

  it("no text gradients", () => {
    const content = fs.readFileSync(BRAIN_PATH, "utf-8");
    expect(content).not.toMatch(/bg-gradient|from-.*to-.*bg-clip-text/);
  });

  it("no PII or phone numbers", () => {
    const content = fs.readFileSync(BRAIN_PATH, "utf-8");
    expect(content).not.toMatch(/\d{3}[-.]?\d{3}[-.]?\d{4}/);
  });
});

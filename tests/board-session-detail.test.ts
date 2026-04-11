import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const indicatorsSource = readFileSync(
  join(__dirname, "..", "client", "src", "components", "board", "session-indicators.tsx"),
  "utf-8"
);

const boardTypesSource = readFileSync(
  join(__dirname, "..", "shared", "board-types.ts"),
  "utf-8"
);

const newFields = [
  { name: "healthReasons", type: "string[]" },
  { name: "totalToolCalls", type: "number" },
  { name: "retries", type: "number" },
  { name: "cacheHitRate", type: "number | null" },
  { name: "maxTokensStops", type: "number" },
  { name: "webRequests", type: "number" },
  { name: "sidechainCount", type: "number" },
  { name: "turnCount", type: "number" },
];

/**
 * Extract the body of an interface declaration from the source text.
 * Returns the text between the opening { and closing } of the interface.
 */
function extractInterfaceBody(source: string, name: string): string {
  const regex = new RegExp(
    `export\\s+interface\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`,
  );
  const match = source.match(regex);
  if (!match) throw new Error(`Interface ${name} not found in source`);
  return match[1];
}

describe("SessionEnrichment detail fields", () => {
  const body = extractInterfaceBody(boardTypesSource, "SessionEnrichment");

  for (const field of newFields) {
    it(`has field ${field.name}: ${field.type}`, () => {
      const escaped = field.type.replace(/[\[\]|()]/g, "\\$&");
      const pattern = new RegExp(
        `${field.name}\\s*:\\s*${escaped.replace(/\s+/g, "\\s*")}`,
      );
      expect(body).toMatch(pattern);
    });
  }
});

describe("HealthReasonTag component", () => {
  it("exports HealthReasonTag function", () => {
    expect(indicatorsSource).toMatch(/export\s+function\s+HealthReasonTag/);
  });

  it('maps "high error rate" to red color scheme', () => {
    expect(indicatorsSource).toMatch(/high error rate/);
    expect(indicatorsSource).toMatch(/bg-red-500\/10\s+text-red-400\s+border-red-500\/20/);
  });

  it('maps "context overflow" to red color scheme', () => {
    expect(indicatorsSource).toMatch(/context overflow/);
  });

  it('maps "excessive retries" to amber color scheme', () => {
    expect(indicatorsSource).toMatch(/excessive retries/);
    expect(indicatorsSource).toMatch(/bg-amber-500\/10\s+text-amber-400\s+border-amber-500\/20/);
  });

  it('maps "long idle gaps" to amber color scheme', () => {
    expect(indicatorsSource).toMatch(/long idle gaps/);
  });

  it('maps "high cost" to amber color scheme', () => {
    expect(indicatorsSource).toMatch(/high cost/);
  });

  it('maps "short session" to muted color scheme', () => {
    expect(indicatorsSource).toMatch(/short session/);
    expect(indicatorsSource).toMatch(/bg-slate-500\/10\s+text-slate-400\s+border-slate-500\/20/);
  });
});

describe("SessionDetailAccordion component", () => {
  const accordionSource = readFileSync(
    join(__dirname, "..", "client", "src", "components", "board", "session-detail-accordion.tsx"),
    "utf-8"
  );

  it("exports SessionDetailAccordion function", () => {
    expect(accordionSource).toMatch(/export\s+function\s+SessionDetailAccordion/);
  });

  it("imports HealthReasonTag from session-indicators", () => {
    expect(accordionSource).toMatch(/import\s+.*HealthReasonTag.*from\s+["']\.\/session-indicators["']/);
  });

  it('contains "Session details" toggle text', () => {
    expect(accordionSource).toContain("Session details");
  });

  const statLabels = [
    "Tool calls",
    "Errors",
    "Retries",
    "Cache hit",
    "Max tokens",
    "Web requests",
    "Sidechains",
    "Turns",
  ];

  for (const label of statLabels) {
    it(`contains stat label "${label}"`, () => {
      expect(accordionSource).toContain(label);
    });
  }

  it("uses useState with false initial value", () => {
    expect(accordionSource).toMatch(/useState\(\s*false\s*\)/);
  });
});

describe("LastSessionSnapshot detail fields", () => {
  const body = extractInterfaceBody(boardTypesSource, "LastSessionSnapshot");

  for (const field of newFields) {
    it(`has field ${field.name}: ${field.type}`, () => {
      const escaped = field.type.replace(/[\[\]|()]/g, "\\$&");
      const pattern = new RegExp(
        `${field.name}\\s*:\\s*${escaped.replace(/\s+/g, "\\s*")}`,
      );
      expect(body).toMatch(pattern);
    });
  }
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

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

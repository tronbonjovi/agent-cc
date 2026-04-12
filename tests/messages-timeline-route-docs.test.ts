// tests/messages-timeline-route-docs.test.ts
//
// Guardrails for the deferred docblock polish from messages-redesign-task001
// review (closed out in task005). These are not behavior tests — they catch
// documentation regressions in `server/routes/sessions.ts` so the contract
// the front-end relies on stays explicit.
//
// 1. The `GET /api/sessions/:id/messages` JSDoc must explain that
//    `totalMessages` reflects the post-`?types=` filter count.
// 2. The route-local `TIMELINE_MESSAGE_TYPES` ReadonlySet must carry a
//    sync-with-shared-types comment so a future TimelineMessageType variant
//    is not silently rejected.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.resolve(__dirname, "../server/routes/sessions.ts");

describe("messages timeline route — deferred docblock polish", () => {
  const src = fs.readFileSync(SRC, "utf-8");

  it("JSDoc on GET /api/sessions/:id/messages explains the filter-scoped totalMessages count", () => {
    // Find the docblock that immediately precedes the route definition.
    const docblockMatch = src.match(
      /\/\*\*[\s\S]*?\*\/\s*router\.get\(["']\/api\/sessions\/:id\/messages["']/,
    );
    expect(docblockMatch).toBeTruthy();
    const doc = docblockMatch?.[0] ?? "";
    // The docblock must explicitly call out that totalMessages is the
    // filter-scoped count when ?types= is present. We don't pin exact
    // wording — only that it mentions both "totalMessages" and the
    // post-filter behavior.
    expect(doc).toMatch(/totalMessages/);
    expect(doc).toMatch(/types/i);
    // Look for a phrase that conveys "after the filter" semantics.
    expect(doc).toMatch(/after\s+(the\s+)?(filter|types|filtering)|filter[- ]scoped|post[- ]filter/i);
  });

  it("TIMELINE_MESSAGE_TYPES carries a sync-with-shared-types comment", () => {
    // Find the const declaration. The keep-in-sync comment must live
    // immediately above or to the right of it.
    const idx = src.indexOf("TIMELINE_MESSAGE_TYPES");
    expect(idx).toBeGreaterThan(0);
    const window = src.slice(Math.max(0, idx - 400), idx + 200);
    expect(window).toMatch(/keep in sync/i);
    expect(window).toMatch(/shared\/session-types/);
  });
});

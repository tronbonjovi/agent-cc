import { describe, it, expect } from "vitest";
import {
  getSourcesForType,
  getSearchableSources,
  getBrowseSources,
} from "../server/discover/sources";

describe("discover sources registry", () => {
  it("returns sources in priority order for skills", () => {
    const sources = getSourcesForType("skills");
    expect(sources.length).toBeGreaterThanOrEqual(2);
    // First source should NOT be github fallback
    expect(sources[0].id).not.toBe("github-search");
    // Last source IS github fallback
    expect(sources[sources.length - 1].id).toBe("github-search");
  });

  it("returns github as only/last source for agents", () => {
    const sources = getSourcesForType("agents");
    expect(sources.length).toBeGreaterThanOrEqual(1);
    // Last source is github
    expect(sources[sources.length - 1].id).toBe("github-search");
  });

  it("separates searchable from browse sources", () => {
    for (const type of ["skills", "agents", "plugins"] as const) {
      const searchable = getSearchableSources(type);
      const browse = getBrowseSources(type);

      // Sets are disjoint
      const searchableIds = new Set(searchable.map((s) => s.id));
      const browseIds = new Set(browse.map((s) => s.id));
      for (const id of searchableIds) {
        expect(browseIds.has(id)).toBe(false);
      }
      for (const id of browseIds) {
        expect(searchableIds.has(id)).toBe(false);
      }

      // Union covers all sources for this type
      const all = getSourcesForType(type);
      expect(searchable.length + browse.length).toBe(all.length);
    }
  });

  it("returns buildwithclaude for all entity types", () => {
    for (const type of ["skills", "agents", "plugins"] as const) {
      const sources = getSourcesForType(type);
      const bwc = sources.find((s) => s.id === "buildwithclaude");
      expect(bwc).toBeDefined();
    }
  });

  it("returns empty array for invalid type", () => {
    const sources = getSourcesForType("invalid" as any);
    expect(sources).toEqual([]);
  });
});

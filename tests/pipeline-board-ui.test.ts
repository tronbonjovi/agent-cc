import { describe, it, expect } from "vitest";
import { stageToColumn, PIPELINE_COLUMNS, isKnownStage } from "../client/src/lib/pipeline-stages";
import * as fs from "fs";

describe("pipeline stage mapping", () => {
  it("maps undefined/missing pipelineStage to backlog", () => {
    expect(stageToColumn(undefined)).toBe("backlog");
    expect(stageToColumn("")).toBe("backlog");
  });

  it("maps known stages to correct columns", () => {
    expect(stageToColumn("queued")).toBe("queued");
    expect(stageToColumn("build")).toBe("build");
    expect(stageToColumn("ai-review")).toBe("ai-review");
    expect(stageToColumn("human-review")).toBe("human-review");
    expect(stageToColumn("done")).toBe("done");
  });

  it("returns null for blocked (placement uses blockedFromStage)", () => {
    expect(stageToColumn("blocked")).toBeNull();
  });

  it("returns null for hidden stages", () => {
    expect(stageToColumn("descoped")).toBeNull();
    expect(stageToColumn("cancelled")).toBeNull();
  });

  it("returns 'unknown' for unrecognized stages", () => {
    expect(stageToColumn("some-future-stage")).toBe("unknown");
  });

  it("isKnownStage identifies valid stages", () => {
    expect(isKnownStage("build")).toBe(true);
    expect(isKnownStage("blocked")).toBe(true);
    expect(isKnownStage("descoped")).toBe(true);
    expect(isKnownStage("some-future-stage")).toBe(false);
  });

  it("PIPELINE_COLUMNS has 6 entries in order", () => {
    expect(PIPELINE_COLUMNS.map((c) => c.id)).toEqual([
      "backlog", "queued", "build", "ai-review", "human-review", "done",
    ]);
  });
});

describe("pipeline hooks contract", () => {
  it("all mutation hooks must use onSettled for cache invalidation", async () => {
    const content = fs.readFileSync("client/src/hooks/use-pipeline.ts", "utf-8");
    const onSettledCount = (content.match(/onSettled/g) || []).length;
    expect(onSettledCount).toBeGreaterThanOrEqual(6); // 6 mutation hooks
  });
});

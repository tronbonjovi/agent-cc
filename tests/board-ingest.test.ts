// tests/board-ingest.test.ts
import { describe, it, expect } from "vitest";
import { parseRoadmapMarkdown } from "../server/board/ingest";

describe("parseRoadmapMarkdown", () => {
  it("parses a roadmap with milestones and tasks", () => {
    const content = `---
project: my-app
status: active
---

# Roadmap

## Milestones

### MILE-001: Core API
Priority: high

Tasks:
- TASK-001: Set up Express server [priority: high]
- TASK-002: Add auth middleware [priority: high, depends: TASK-001]
- TASK-003: Write API tests [priority: medium, depends: TASK-001]

### MILE-002: Frontend
Priority: medium

Tasks:
- TASK-004: Scaffold React app [priority: high]
- TASK-005: Build login page [priority: high, depends: TASK-004, TASK-002]
`;
    const result = parseRoadmapMarkdown(content);
    expect(result.project).toBe("my-app");
    expect(result.milestones).toHaveLength(2);
    expect(result.milestones[0].title).toBe("Core API");
    expect(result.milestones[0].id).toBe("MILE-001");
    expect(result.milestones[0].priority).toBe("high");
    expect(result.tasks).toHaveLength(5);
    expect(result.tasks[0].title).toBe("Set up Express server");
    expect(result.tasks[0].milestone).toBe("MILE-001");
    expect(result.tasks[0].priority).toBe("high");
    expect(result.tasks[1].dependsOn).toEqual(["TASK-001"]);
    expect(result.tasks[4].dependsOn).toEqual(["TASK-004", "TASK-002"]);
  });

  it("handles minimal roadmap with just tasks", () => {
    const content = `---
project: simple
---

# Tasks
- TASK-001: Do the thing [priority: low]
- TASK-002: Do another thing [priority: medium]
`;
    const result = parseRoadmapMarkdown(content);
    expect(result.project).toBe("simple");
    expect(result.milestones).toHaveLength(0);
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks[0].milestone).toBeUndefined();
  });

  it("returns empty when content has no parseable structure", () => {
    const result = parseRoadmapMarkdown("Just some random markdown");
    expect(result.project).toBe("");
    expect(result.milestones).toHaveLength(0);
    expect(result.tasks).toHaveLength(0);
  });

  it("parses task metadata in brackets", () => {
    const content = `---
project: test
---
- TASK-001: Build API [priority: high, depends: TASK-000]
`;
    const result = parseRoadmapMarkdown(content);
    expect(result.tasks[0].priority).toBe("high");
    expect(result.tasks[0].dependsOn).toEqual(["TASK-000"]);
  });
});

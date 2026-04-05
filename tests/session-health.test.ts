import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";

const tmpDir = path.join(os.tmpdir(), "cc-health-test-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8));
process.env.AGENT_CC_DATA = tmpDir;

const { Storage } = await import("../server/storage");
const { getDB, defaultAppSettings } = await import("../server/db");

describe("Session Health Thresholds", () => {
  let storage: InstanceType<typeof Storage>;

  beforeEach(() => {
    const dbPath = path.join(tmpDir, "agent-cc.json");
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    const tmpPath = dbPath + ".tmp";
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    storage = new Storage();
  });

  it("should have default health thresholds in AppSettings", () => {
    const settings = storage.getAppSettings();
    expect(settings.healthThresholds).toBeDefined();
    expect(settings.healthThresholds).toEqual({
      context: { yellow: 20, red: 50 },
      cost: { yellow: 3, red: 5 },
      messages: { yellow: 30, red: 60 },
    });
  });

  it("should match defaultAppSettings export", () => {
    expect(defaultAppSettings.healthThresholds).toEqual({
      context: { yellow: 20, red: 50 },
      cost: { yellow: 3, red: 5 },
      messages: { yellow: 30, red: 60 },
    });
  });
});

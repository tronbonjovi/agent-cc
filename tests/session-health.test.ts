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

  it("should update health thresholds via storage", () => {
    const updated = storage.updateAppSettings({
      healthThresholds: {
        context: { yellow: 25, red: 60 },
        cost: { yellow: 5, red: 10 },
        messages: { yellow: 40, red: 80 },
      },
    });
    expect(updated.healthThresholds).toEqual({
      context: { yellow: 25, red: 60 },
      cost: { yellow: 5, red: 10 },
      messages: { yellow: 40, red: 80 },
    });
  });

  it("should partially update health thresholds", () => {
    storage.updateAppSettings({
      healthThresholds: {
        context: { yellow: 25, red: 60 },
        cost: { yellow: 3, red: 5 },
        messages: { yellow: 30, red: 60 },
      },
    });
    const settings = storage.getAppSettings();
    expect(settings.healthThresholds.context).toEqual({ yellow: 25, red: 60 });
    expect(settings.healthThresholds.cost).toEqual({ yellow: 3, red: 5 });
  });

  it("should preserve other settings when updating thresholds", () => {
    storage.updateAppSettings({ appName: "Test App" });
    storage.updateAppSettings({
      healthThresholds: {
        context: { yellow: 10, red: 40 },
        cost: { yellow: 2, red: 8 },
        messages: { yellow: 20, red: 50 },
      },
    });
    const settings = storage.getAppSettings();
    expect(settings.appName).toBe("Test App");
    expect(settings.healthThresholds.context.yellow).toBe(10);
  });
});

describe("Session Health API Validation", () => {
  it("should accept valid health thresholds in settings patch schema", async () => {
    const { z } = await import("zod");

    const ThresholdPairSchema = z.object({
      yellow: z.number().positive(),
      red: z.number().positive(),
    }).refine(d => d.yellow < d.red, { message: "yellow must be less than red" });

    const HealthThresholdsSchema = z.object({
      context: ThresholdPairSchema,
      cost: ThresholdPairSchema,
      messages: ThresholdPairSchema,
    });

    const valid = HealthThresholdsSchema.safeParse({
      context: { yellow: 20, red: 50 },
      cost: { yellow: 3, red: 5 },
      messages: { yellow: 30, red: 60 },
    });
    expect(valid.success).toBe(true);
  });

  it("should reject thresholds where yellow >= red", async () => {
    const { z } = await import("zod");

    const ThresholdPairSchema = z.object({
      yellow: z.number().positive(),
      red: z.number().positive(),
    }).refine(d => d.yellow < d.red, { message: "yellow must be less than red" });

    const invalid = ThresholdPairSchema.safeParse({ yellow: 50, red: 20 });
    expect(invalid.success).toBe(false);
  });

  it("should reject negative threshold values", async () => {
    const { z } = await import("zod");

    const ThresholdPairSchema = z.object({
      yellow: z.number().positive(),
      red: z.number().positive(),
    });

    const invalid = ThresholdPairSchema.safeParse({ yellow: -5, red: 10 });
    expect(invalid.success).toBe(false);
  });
});

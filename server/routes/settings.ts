import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { defaultAppSettings, defaultChatDefaults, getDB, save } from "../db";
import { validate } from "./validation";
import { clearProjectDirsCache } from "../scanner/utils";
import type { ChatGlobalDefaults } from "@shared/types";

const ThresholdPairSchema = z.object({
  yellow: z.number().positive(),
  red: z.number().positive(),
}).refine(d => d.yellow < d.red, { message: "yellow must be less than red" });

const HealthThresholdsSchema = z.object({
  context: ThresholdPairSchema,
  cost: ThresholdPairSchema,
  messages: ThresholdPairSchema,
  dataSize: ThresholdPairSchema,
}).optional();

const ScanPathsSchema = z.object({
  homeDir: z.string().nullable().optional(),
  claudeDir: z.string().nullable().optional(),
  extraMcpFiles: z.array(z.string()).max(50).optional(),
  extraProjectDirs: z.array(z.string()).max(50).optional(),
  extraSkillDirs: z.array(z.string()).max(50).optional(),
  extraPluginDirs: z.array(z.string()).max(50).optional(),
}).optional();

const SettingsPatchSchema = z.object({
  appName: z.string().trim().min(1, "appName must be a non-empty string").max(50, "appName must be 50 characters or fewer").optional(),
  scanPaths: ScanPathsSchema,
  onboarded: z.boolean().optional(),
  healthThresholds: HealthThresholdsSchema,
});

const router = Router();

router.get("/api/settings", (_req, res) => {
  res.json(storage.getAppSettings());
});

router.patch("/api/settings", (req, res) => {
  const parsed = validate(SettingsPatchSchema, req.body, res);
  if (!parsed) return;

  const patch: Partial<import("@shared/types").AppSettings> = {};
  if (parsed.appName !== undefined) patch.appName = parsed.appName;
  if (parsed.scanPaths !== undefined) {
    const current = storage.getAppSettings().scanPaths;
    patch.scanPaths = { ...current, ...parsed.scanPaths };
  }
  if (parsed.onboarded !== undefined) patch.onboarded = parsed.onboarded;
  if (parsed.healthThresholds !== undefined) patch.healthThresholds = parsed.healthThresholds;

  const updated = storage.updateAppSettings(patch);
  if (parsed.scanPaths !== undefined) {
    clearProjectDirsCache();
  }
  res.json(updated);
});

router.post("/api/settings/reset", (_req, res) => {
  clearProjectDirsCache();
  const updated = storage.updateAppSettings({
    appName: defaultAppSettings.appName,
    scanPaths: { ...defaultAppSettings.scanPaths },
  });
  res.json(updated);
});

// ---------------------------------------------------------------------------
// Chat composer defaults — chat-composer-controls task001
// ---------------------------------------------------------------------------
//
// `providerId` and `model` are the only strictly required fields. Everything
// else is optional because it's provider-specific (effort / webSearch are
// Claude Code only, temperature is OpenAI-compatible only, etc.). The shape
// mirrors the `ChatSettings` interface in `shared/types.ts`.
//
// PUT is idempotent — it *replaces* the full defaults object, it does not
// merge. Callers should send the entire shape they want persisted.

const ChatDefaultsSchema = z.object({
  providerId: z.string().trim().min(1, "providerId must be a non-empty string"),
  model: z.string().trim().min(1, "model must be a non-empty string"),
  effort: z.string().trim().min(1).optional(),
  thinking: z.boolean().optional(),
  webSearch: z.boolean().optional(),
  systemPrompt: z.string().optional(),
  projectPath: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

router.get("/api/settings/chat-defaults", (_req, res) => {
  const db = getDB();
  const defaults = db?.chatDefaults ?? { ...defaultChatDefaults };
  res.json(defaults);
});

router.put("/api/settings/chat-defaults", (req, res) => {
  const parsed = validate(ChatDefaultsSchema, req.body, res);
  if (!parsed) return;
  const db = getDB();
  const next: ChatGlobalDefaults = { ...parsed };
  db.chatDefaults = next;
  save();
  res.json(next);
});

export default router;

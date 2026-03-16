import { Router } from "express";
import { storage } from "../storage";
import { defaultAppSettings } from "../db";

const router = Router();

router.get("/api/settings", (_req, res) => {
  res.json(storage.getAppSettings());
});

router.patch("/api/settings", (req, res) => {
  const { appName, scanPaths, onboarded } = req.body;

  // Validate appName
  if (appName !== undefined) {
    if (typeof appName !== "string" || appName.trim().length === 0) {
      return res.status(400).json({ message: "appName must be a non-empty string" });
    }
    if (appName.length > 50) {
      return res.status(400).json({ message: "appName must be 50 characters or fewer" });
    }
  }

  // Validate scanPaths
  if (scanPaths !== undefined) {
    if (typeof scanPaths !== "object" || scanPaths === null) {
      return res.status(400).json({ message: "scanPaths must be an object" });
    }
    const arrayFields = ["extraMcpFiles", "extraProjectDirs", "extraSkillDirs", "extraPluginDirs"] as const;
    for (const field of arrayFields) {
      if (scanPaths[field] !== undefined) {
        if (!Array.isArray(scanPaths[field]) || !scanPaths[field].every((v: unknown) => typeof v === "string")) {
          return res.status(400).json({ message: `scanPaths.${field} must be an array of strings` });
        }
        if (scanPaths[field].length > 50) {
          return res.status(400).json({ message: `scanPaths.${field} too many entries (max 50)` });
        }
      }
    }
    const stringFields = ["homeDir", "claudeDir"] as const;
    for (const field of stringFields) {
      if (scanPaths[field] !== undefined && scanPaths[field] !== null && typeof scanPaths[field] !== "string") {
        return res.status(400).json({ message: `scanPaths.${field} must be a string or null` });
      }
    }
  }

  const patch: Partial<import("@shared/types").AppSettings> = {};
  if (appName !== undefined) patch.appName = appName.trim();
  if (scanPaths !== undefined) patch.scanPaths = scanPaths;
  if (onboarded === true) patch.onboarded = true;

  const updated = storage.updateAppSettings(patch);
  res.json(updated);
});

router.post("/api/settings/reset", (_req, res) => {
  const updated = storage.updateAppSettings({
    appName: defaultAppSettings.appName,
    scanPaths: { ...defaultAppSettings.scanPaths },
  });
  res.json(updated);
});

export default router;

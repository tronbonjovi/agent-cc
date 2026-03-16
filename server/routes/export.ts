import { Router } from "express";
import { storage } from "../storage";
import { getDB, save } from "../db";

const router = Router();

router.get("/api/export", (_req, res) => {
  res.json({
    entities: storage.getEntities(),
    relationships: storage.getAllRelationships(),
    customNodes: storage.getCustomNodes(),
    customEdges: storage.getCustomEdges(),
    entityOverrides: storage.getEntityOverrides(),
    appSettings: storage.getAppSettings(),
    exportedAt: new Date().toISOString(),
    version: "1.0.0",
  });
});

router.post("/api/import", (req, res) => {
  const body = req.body;

  // Validate the input has the expected shape
  if (!body || typeof body !== "object") {
    return res.status(400).json({ message: "Request body must be a JSON object" });
  }
  if (!body.version || typeof body.version !== "string") {
    return res.status(400).json({ message: "Missing or invalid version field" });
  }
  if (body.customNodes !== undefined && !Array.isArray(body.customNodes)) {
    return res.status(400).json({ message: "customNodes must be an array" });
  }
  if (body.customEdges !== undefined && !Array.isArray(body.customEdges)) {
    return res.status(400).json({ message: "customEdges must be an array" });
  }
  if (body.entityOverrides !== undefined && (typeof body.entityOverrides !== "object" || body.entityOverrides === null || Array.isArray(body.entityOverrides))) {
    return res.status(400).json({ message: "entityOverrides must be an object" });
  }
  if (body.appSettings !== undefined && (typeof body.appSettings !== "object" || body.appSettings === null || Array.isArray(body.appSettings))) {
    return res.status(400).json({ message: "appSettings must be an object" });
  }

  const db = getDB();
  const imported: Record<string, number> = {};

  // Replace customNodes
  if (body.customNodes !== undefined) {
    db.customNodes = body.customNodes;
    imported.customNodes = body.customNodes.length;
  }

  // Replace customEdges
  if (body.customEdges !== undefined) {
    db.customEdges = body.customEdges;
    imported.customEdges = body.customEdges.length;
  }

  // Replace entityOverrides
  if (body.entityOverrides !== undefined) {
    db.entityOverrides = body.entityOverrides;
    imported.entityOverrides = Object.keys(body.entityOverrides).length;
  }

  // Replace appSettings
  if (body.appSettings !== undefined) {
    db.appSettings = body.appSettings;
    imported.appSettings = 1;
  }

  save();

  res.json({ imported });
});

export default router;

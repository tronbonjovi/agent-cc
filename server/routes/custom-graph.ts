import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import type { CustomNode, CustomEdge, EntityOverride } from "@shared/types";
import crypto from "crypto";
import { z } from "zod";

const VALID_SUBTYPES = ["service", "database", "api", "cicd", "deploy", "queue", "cache", "other"] as const;

const VALID_SOURCES = ["manual", "config-file", "ai-suggested", "docker-compose", "auto-discovered"] as const;

const CustomNodeSchema = z.object({
  id: z.string().max(100).optional(),
  subType: z.enum(VALID_SUBTYPES),
  label: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  url: z.string().max(500).optional(),
  icon: z.string().max(100).optional(),
  color: z.string().max(50).optional(),
  source: z.enum(VALID_SOURCES).optional(),
});

const CustomEdgeSchema = z.object({
  id: z.string().max(100).optional(),
  source: z.string().min(1).max(200),
  target: z.string().min(1).max(200),
  label: z.string().min(1).max(200),
  color: z.string().max(50).optional(),
  dashed: z.boolean().optional(),
  source_origin: z.enum(VALID_SOURCES).optional(),
});

const EntityOverrideSchema = z.object({
  description: z.string().max(1000).optional(),
  color: z.string().max(50).optional(),
  label: z.string().max(200).optional(),
}).strict();

const router = Router();

// ---- Custom Nodes ----

router.get("/api/graph/custom-nodes", (_req: Request, res: Response) => {
  res.json(storage.getCustomNodes());
});

router.post("/api/graph/custom-nodes", (req: Request, res: Response) => {
  const parsed = CustomNodeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") });
  }

  const node: CustomNode = {
    ...parsed.data,
    id: parsed.data.id || `manual-${crypto.randomBytes(6).toString("hex")}`,
    source: parsed.data.source || "manual",
  };

  storage.upsertCustomNode(node);
  res.json(node);
});

router.put("/api/graph/custom-nodes/:id", (req: Request, res: Response) => {
  const id = String(req.params.id);
  const existing = storage.getCustomNodes().find((n) => n.id === id);
  if (!existing) return res.status(404).json({ message: "Node not found" });

  const parsed = CustomNodeSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") });
  }

  const updated: CustomNode = { ...existing, ...parsed.data, id };
  storage.upsertCustomNode(updated);
  res.json(updated);
});

router.delete("/api/graph/custom-nodes/:id", (req: Request, res: Response) => {
  storage.deleteCustomNode(String(req.params.id));
  res.json({ message: "Deleted" });
});

// ---- Custom Edges ----

router.get("/api/graph/custom-edges", (_req: Request, res: Response) => {
  res.json(storage.getCustomEdges());
});

router.post("/api/graph/custom-edges", (req: Request, res: Response) => {
  const parsed = CustomEdgeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") });
  }

  const edge: CustomEdge = {
    ...parsed.data,
    id: parsed.data.id || `manual-edge-${crypto.randomBytes(6).toString("hex")}`,
    source_origin: parsed.data.source_origin || "manual",
  };

  storage.upsertCustomEdge(edge);
  res.json(edge);
});

router.delete("/api/graph/custom-edges/:id", (req: Request, res: Response) => {
  storage.deleteCustomEdge(String(req.params.id));
  res.json({ message: "Deleted" });
});

// ---- Entity Overrides ----

router.get("/api/graph/overrides", (_req: Request, res: Response) => {
  res.json(storage.getEntityOverrides());
});

router.put("/api/graph/overrides/:entityId", (req: Request, res: Response) => {
  const eid = String(req.params.entityId);
  const parsed = EntityOverrideSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") });
  }
  storage.setEntityOverride(eid, parsed.data as EntityOverride);
  res.json({ entityId: eid, ...parsed.data });
});

router.delete("/api/graph/overrides/:entityId", (req: Request, res: Response) => {
  storage.deleteEntityOverride(String(req.params.entityId));
  res.json({ message: "Deleted" });
});

export default router;

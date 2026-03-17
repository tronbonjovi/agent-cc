import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { qstr, validate } from "./validation";

const EntityTypeEnum = z.enum(["project", "mcp", "plugin", "skill", "markdown", "config"]);

const EntitiesQuerySchema = z.object({
  type: EntityTypeEnum.optional(),
  q: z.string().max(500).optional(),
});

const router = Router();

router.get("/api/entities", (req: Request, res: Response) => {
  const parsed = validate(EntitiesQuerySchema, { type: qstr(req.query.type), q: qstr(req.query.q) }, res);
  if (!parsed) return;
  const entities = storage.getEntities(parsed.type, parsed.q);
  res.json(entities);
});

router.get("/api/entities/:id", (req: Request, res: Response) => {
  const entity = storage.getEntity(req.params.id as string);
  if (!entity) return res.status(404).json({ message: "Entity not found" });
  res.json(entity);
});

router.get("/api/entities/:id/relationships", (req: Request, res: Response) => {
  const rels = storage.getRelationships(req.params.id as string);
  res.json(rels);
});

export default router;

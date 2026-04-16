/**
 * Provider CRUD — chat-provider-system task001.
 *
 * Server-side CRUD for the `providers` list that the chat composer reads
 * from. Providers live in `agent-cc.json`; this router is the only layer
 * that touches them. Secret fields (API keys, OAuth tokens) are kept
 * server-side — responses mask the key to `sk-...<last4>` so the client
 * settings UI can indicate "a key is set" without leaking the value.
 *
 * Built-in providers (`claude-code`, `ollama`) are flagged with
 * `builtin: true`. The DELETE handler refuses them; PUT refuses to mutate
 * their `id` or `type` but allows tweaking name, baseUrl, auth, and
 * capabilities. Deleting a user-created provider is a straightforward
 * splice + save.
 */
import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getDB, save } from "../db";
import { validate } from "./validation";
import { discoverModels } from "../providers/model-discovery";
import type { ProviderConfig } from "@shared/types";

const router = Router();

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const AuthSchema = z.object({
  type: z.enum(["none", "api-key", "oauth"]),
  apiKey: z.string().optional(),
});

const CapabilitiesSchema = z
  .object({
    thinking: z.boolean().optional(),
    effort: z.boolean().optional(),
    webSearch: z.boolean().optional(),
    temperature: z.boolean().optional(),
    systemPrompt: z.boolean().optional(),
    fileAttachments: z.boolean().optional(),
    projectContext: z.boolean().optional(),
  })
  .default({});

const ProviderCreateSchema = z
  .object({
    name: z.string().trim().min(1, "name must be a non-empty string"),
    type: z.enum(["claude-cli", "openai-compatible"], {
      message: "type must be one of: claude-cli, openai-compatible",
    }),
    baseUrl: z.string().trim().min(1).optional(),
    auth: AuthSchema,
    capabilities: CapabilitiesSchema,
  })
  .refine(
    (v) => v.type !== "openai-compatible" || (v.baseUrl && v.baseUrl.length > 0),
    {
      message: "baseUrl is required for openai-compatible providers",
      path: ["baseUrl"],
    },
  );

// PUT is a partial update — every field optional, but if `type` is present
// on a built-in we reject in the handler (zod can't express "forbidden on
// specific records").
const ProviderUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  type: z.enum(["claude-cli", "openai-compatible"]).optional(),
  baseUrl: z.string().trim().optional(),
  auth: AuthSchema.optional(),
  capabilities: CapabilitiesSchema.optional(),
});

// ---------------------------------------------------------------------------
// Masking helpers
// ---------------------------------------------------------------------------

/**
 * `sk-...<last4>` for non-empty keys; empty/undefined stays undefined.
 * Anything shorter than 4 chars becomes `sk-...****` so we never
 * accidentally echo a full short key back.
 */
function maskApiKey(key: string | undefined): string | undefined {
  if (!key) return undefined;
  const last4 = key.length >= 4 ? key.slice(-4) : "****";
  return `sk-...${last4}`;
}

/** A masked form is anything beginning with `sk-...` — the client round-tripped
 * a value they never saw unmasked, so the server must not overwrite the real
 * stored key with it. */
function isMaskedKey(value: string | undefined): boolean {
  if (!value) return false;
  return value.startsWith("sk-...") || value === "••••••";
}

/** Public (wire) shape — strips secret fields so they never reach the client. */
function toPublic(p: ProviderConfig): ProviderConfig {
  const publicAuth: ProviderConfig["auth"] = { type: p.auth.type };
  if (p.auth.type === "api-key") {
    publicAuth.apiKey = maskApiKey(p.auth.apiKey);
  }
  // Deliberately omit oauth secret fields — `auth.type` alone is enough for
  // the UI to render an "OAuth configured" badge.
  return {
    id: p.id,
    name: p.name,
    type: p.type,
    baseUrl: p.baseUrl,
    auth: publicAuth,
    capabilities: p.capabilities,
    builtin: p.builtin,
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

router.get("/api/providers", (_req, res) => {
  const db = getDB();
  res.json((db.providers ?? []).map(toPublic));
});

router.post("/api/providers", (req, res) => {
  const parsed = validate(ProviderCreateSchema, req.body, res);
  if (!parsed) return;

  const created: ProviderConfig = {
    id: randomUUID(),
    name: parsed.name,
    type: parsed.type,
    baseUrl: parsed.baseUrl,
    auth: { type: parsed.auth.type },
    capabilities: parsed.capabilities ?? {},
  };
  if (parsed.auth.type === "api-key" && parsed.auth.apiKey) {
    created.auth.apiKey = parsed.auth.apiKey;
  }

  const db = getDB();
  if (!db.providers) db.providers = [];
  db.providers.push(created);
  save();
  res.status(201).json(toPublic(created));
});

router.put("/api/providers/:id", (req, res) => {
  const { id } = req.params;
  const db = getDB();
  const idx = (db.providers ?? []).findIndex((p) => p.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: "Provider not found" });
  }
  const existing = db.providers[idx];

  const parsed = validate(ProviderUpdateSchema, req.body, res);
  if (!parsed) return;

  // Built-in lock — id is immutable by route (captured from the path) and
  // type is explicitly refused here. Everything else is fair game.
  if (existing.builtin && parsed.type && parsed.type !== existing.type) {
    return res
      .status(400)
      .json({ error: "Cannot change type on built-in provider" });
  }

  const updated: ProviderConfig = {
    ...existing,
    name: parsed.name ?? existing.name,
    // For built-ins, `type` is locked (checked above). For non-built-ins
    // we accept the new type; the client is expected to pair it with a
    // compatible baseUrl.
    type: existing.builtin ? existing.type : parsed.type ?? existing.type,
    baseUrl:
      parsed.baseUrl !== undefined ? parsed.baseUrl || undefined : existing.baseUrl,
    capabilities: parsed.capabilities ?? existing.capabilities,
  };

  if (parsed.auth) {
    const nextAuth: ProviderConfig["auth"] = { type: parsed.auth.type };
    if (parsed.auth.type === "api-key") {
      // If the client sent back the masked form, keep the stored secret.
      if (parsed.auth.apiKey && !isMaskedKey(parsed.auth.apiKey)) {
        nextAuth.apiKey = parsed.auth.apiKey;
      } else if (existing.auth.type === "api-key" && existing.auth.apiKey) {
        nextAuth.apiKey = existing.auth.apiKey;
      }
    }
    updated.auth = nextAuth;
  }

  db.providers[idx] = updated;
  save();
  res.json(toPublic(updated));
});

/**
 * Discover models offered by a provider — task005.
 *
 * Reads the provider record (with its server-side secret) and hands it to
 * `discoverModels`. Failures inside discovery degrade to an empty array, so
 * callers always see a consistent shape. Unknown provider ids return 404 —
 * the client's `useProviderModels` hook keys on the provider id, so a
 * cleaner error than "empty array" helps surface misconfiguration.
 */
router.get("/api/providers/:id/models", async (req, res) => {
  const { id } = req.params;
  const db = getDB();
  const provider = (db.providers ?? []).find((p) => p.id === id);
  if (!provider) {
    return res.status(404).json({ error: "Provider not found" });
  }
  const models = await discoverModels(provider);
  res.json(models);
});

router.delete("/api/providers/:id", (req, res) => {
  const { id } = req.params;
  const db = getDB();
  const idx = (db.providers ?? []).findIndex((p) => p.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: "Provider not found" });
  }
  const existing = db.providers[idx];
  if (existing.builtin) {
    return res
      .status(400)
      .json({ error: "Cannot delete built-in provider" });
  }
  db.providers.splice(idx, 1);
  save();
  res.status(204).end();
});

export default router;

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
import {
  generateAuthUrl,
  exchangeCode,
  consumeAuthState,
} from "../providers/oauth";
import type { ProviderConfig } from "@shared/types";

const router = Router();

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

// OAuth provider parameters captured at create/edit time — the client
// collects these in the provider-manager form. `clientSecret` and `scopes`
// are optional (public clients / default-scope providers). `authUrl`,
// `tokenUrl`, and `clientId` are required whenever `auth.type === 'oauth'`
// (enforced by the refine below).
const OAuthConfigSchema = z.object({
  authUrl: z.string().trim().min(1, "oauthConfig.authUrl is required"),
  tokenUrl: z.string().trim().min(1, "oauthConfig.tokenUrl is required"),
  clientId: z.string().trim().min(1, "oauthConfig.clientId is required"),
  clientSecret: z.string().optional(),
  scopes: z.array(z.string()).optional(),
});

const AuthSchema = z.object({
  type: z.enum(["none", "api-key", "oauth"]),
  apiKey: z.string().optional(),
  oauthConfig: OAuthConfigSchema.optional(),
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
  )
  .refine(
    // An `oauth` auth-type is only useful if the caller also supplies the
    // OAuth discovery parameters. Without them, the /auth endpoint has no
    // authorize URL to redirect to and the UI has no form to edit later.
    (v) => v.auth.type !== "oauth" || Boolean(v.auth.oauthConfig),
    {
      message: "oauthConfig is required when auth.type is oauth",
      path: ["auth", "oauthConfig"],
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

/** Public (wire) shape — strips secret fields so they never reach the client.
 *
 * For api-key auth we echo the masked `sk-...<last4>` form so the settings
 * UI can show "a key is set". For oauth we forward the non-secret parts of
 * `oauthConfig` (authUrl, tokenUrl, clientId, scopes) so the UI can render
 * the connection form, but we ALWAYS strip:
 *
 *   - `oauthTokens` (access + refresh) — the whole point of server-side
 *     token storage is that clients never see them.
 *   - `clientSecret` — it's a credential, same security model as apiKey.
 *
 * Connection state is surfaced via the separate `/status` endpoint rather
 * than a boolean on this record; keeps the CRUD shape stable and means the
 * UI polls the more specific endpoint when it cares about "is this
 * provider actually logged in right now". */
function toPublic(p: ProviderConfig): ProviderConfig {
  const publicAuth: ProviderConfig["auth"] = { type: p.auth.type };
  if (p.auth.type === "api-key") {
    publicAuth.apiKey = maskApiKey(p.auth.apiKey);
  }
  if (p.auth.type === "oauth" && p.auth.oauthConfig) {
    // Strip clientSecret; pass through the rest so the UI can show which
    // endpoint/clientId is configured.
    const { clientSecret: _clientSecret, ...publicCfg } = p.auth.oauthConfig;
    publicAuth.oauthConfig = publicCfg;
  }
  // `oauthTokens` is never copied onto publicAuth — it stays server-side.
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
  if (parsed.auth.type === "oauth" && parsed.auth.oauthConfig) {
    // Persist the full oauthConfig (including clientSecret). `toPublic()`
    // scrubs clientSecret on the wire — storage keeps it for the token
    // exchange in the callback route.
    created.auth.oauthConfig = { ...parsed.auth.oauthConfig };
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
    if (parsed.auth.type === "oauth") {
      // Accept fresh oauthConfig on edits; fall through to the stored value
      // so callers can PUT other fields without re-sending the config.
      if (parsed.auth.oauthConfig) {
        nextAuth.oauthConfig = { ...parsed.auth.oauthConfig };
      } else if (existing.auth.oauthConfig) {
        nextAuth.oauthConfig = existing.auth.oauthConfig;
      }
      // Preserve any stored access/refresh tokens across edits — the PUT is
      // for provider config, not for revoking an active session.
      if (existing.auth.oauthTokens) {
        nextAuth.oauthTokens = existing.auth.oauthTokens;
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

// ---------------------------------------------------------------------------
// OAuth — task004
// ---------------------------------------------------------------------------
//
// The flow is orchestrated from the browser:
//
//   1. User clicks "Sign in" in the settings popover.
//   2. Client calls GET /api/providers/:id/auth, receives { authUrl }, and
//      opens it in a popup (or the same tab).
//   3. Provider redirects back to /api/providers/:id/auth/callback with
//      ?code&state. We validate state, exchange the code, persist the
//      tokens, and return a self-closing HTML page.
//   4. Subsequent API calls thread the access token via getValidToken() at
//      the chat route layer (wired in a later task).
//
// The callback URL is built dynamically from the inbound request so it
// matches whatever host the user's browser is hitting (dev: localhost:5100,
// production: whatever acc.devbox resolves to). This assumes the OAuth app
// at the provider was registered with the matching redirect URL.

/** Build the self-URL for the OAuth callback endpoint. */
function callbackUrlFor(req: import("express").Request, providerId: string): string {
  const host = req.get("host") ?? "localhost:5100";
  return `${req.protocol}://${host}/api/providers/${providerId}/auth/callback`;
}

/**
 * GET /api/providers/:id/auth
 *
 * Returns the authorization URL the client should navigate to. Generating
 * the URL also seeds the in-memory CSRF store so the callback can later
 * validate that the `state` round-tripped came from us.
 */
router.get("/api/providers/:id/auth", (req, res) => {
  const { id } = req.params;
  const db = getDB();
  const provider = (db.providers ?? []).find((p) => p.id === id);
  if (!provider) {
    return res.status(404).json({ error: "Provider not found" });
  }
  if (provider.auth.type !== "oauth" || !provider.auth.oauthConfig) {
    return res
      .status(400)
      .json({ error: "Provider is not configured for OAuth" });
  }
  try {
    const authUrl = generateAuthUrl(provider, callbackUrlFor(req, id));
    res.json({ authUrl });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/**
 * GET /api/providers/:id/auth/callback
 *
 * The provider redirects the browser here with `?code&state`. We validate
 * state against the CSRF store, exchange the code for tokens, persist them,
 * and return an HTML page that closes the popup (or shows a note if the
 * browser disallows window.close()).
 */
router.get("/api/providers/:id/auth/callback", async (req, res) => {
  const { id } = req.params;
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";

  if (!state) {
    return res.status(400).json({ error: "Missing state parameter" });
  }
  if (!code) {
    return res.status(400).json({ error: "Missing code parameter" });
  }
  if (!consumeAuthState(state, id)) {
    return res.status(400).json({ error: "Invalid or expired state" });
  }

  const db = getDB();
  const idx = (db.providers ?? []).findIndex((p) => p.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: "Provider not found" });
  }
  const provider = db.providers[idx];
  if (provider.auth.type !== "oauth" || !provider.auth.oauthConfig) {
    return res
      .status(400)
      .json({ error: "Provider is not configured for OAuth" });
  }

  try {
    const tokens = await exchangeCode(provider, code, callbackUrlFor(req, id));
    db.providers[idx] = {
      ...provider,
      auth: { ...provider.auth, oauthTokens: tokens },
    };
    save();
    res
      .status(200)
      .type("html")
      .send(
        `<!DOCTYPE html><html><body><p>Connected! You can close this tab.</p><script>window.close()</script></body></html>`,
      );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(502).json({ error: `OAuth exchange failed: ${msg}` });
  }
});

/**
 * POST /api/providers/:id/disconnect
 *
 * Clears stored tokens so `getValidToken` will throw until the user signs
 * in again. Leaves the provider's `oauthConfig` alone — disconnecting is
 * reversible by signing back in, without re-entering URLs / clientId.
 */
router.post("/api/providers/:id/disconnect", (req, res) => {
  const { id } = req.params;
  const db = getDB();
  const idx = (db.providers ?? []).findIndex((p) => p.id === id);
  if (idx === -1) {
    return res.status(404).json({ error: "Provider not found" });
  }
  const existing = db.providers[idx];
  const nextAuth: ProviderConfig["auth"] = { ...existing.auth };
  delete nextAuth.oauthTokens;
  db.providers[idx] = { ...existing, auth: nextAuth };
  save();
  res.json({ connected: false });
});

/**
 * GET /api/providers/:id/status
 *
 * Cheap boolean — true iff we have a token record stored. Expiration is
 * handled transparently by `getValidToken` on next use, so we don't check
 * `expiresAt` here; reporting "connected" when the token is refreshable is
 * the more useful signal for the UI.
 */
router.get("/api/providers/:id/status", (req, res) => {
  const { id } = req.params;
  const db = getDB();
  const provider = (db.providers ?? []).find((p) => p.id === id);
  if (!provider) {
    return res.status(404).json({ error: "Provider not found" });
  }
  res.json({ connected: Boolean(provider.auth.oauthTokens) });
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

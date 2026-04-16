/**
 * OAuth 2.0 authorization code flow — chat-provider-system task004.
 *
 * Four pure helpers the route layer composes into the end-to-end flow:
 *
 *   - `generateAuthUrl(provider, callbackUrl)` — builds the authorize URL and
 *     records the `state` → `providerId` mapping in an in-memory CSRF store
 *     keyed by state. Callback handlers validate against this store.
 *
 *   - `exchangeCode(provider, code, callbackUrl)` — trades the callback code
 *     for an access/refresh pair via POST to the provider's token URL.
 *
 *   - `refreshAccessToken(provider)` — trades the stored refresh token for a
 *     fresh access token. Some providers rotate the refresh token on each
 *     call; others don't — this helper reuses the stored refresh token when
 *     the server doesn't return a new one.
 *
 *   - `getValidToken(provider)` — returns a usable access token. If the
 *     cached one is within the 5-minute expiry buffer (or already expired),
 *     runs a refresh, writes the new tokens back to the DB, and returns the
 *     new access token. This is the only helper with DB side effects; the
 *     other three are pure-ish (the auth-URL generator mutates the CSRF
 *     store but that's an in-memory Map).
 *
 * Design notes:
 *
 *   - CSRF state is stored in an in-memory Map keyed by `state → providerId`,
 *     with a 10-minute TTL so abandoned auth flows don't accumulate. If the
 *     server restarts mid-flow, callbacks will fail validation — acceptable
 *     for a single-user devbox, and the user can simply click "Sign in"
 *     again.
 *
 *   - Token endpoint is hit with `application/x-www-form-urlencoded`, which
 *     is what every OAuth 2.0 provider expects by spec. JSON-formatted
 *     bodies work with some providers but not all, so form-encoding is the
 *     safer default.
 *
 *   - `clientSecret` is sent in the request body rather than via HTTP Basic
 *     auth. Either is spec-compliant; body-form is simpler and matches
 *     what most OAuth libraries default to.
 */
import { randomBytes } from "node:crypto";
import type { ProviderConfig } from "../../shared/types";
import { getDB, save } from "../db";

/** Oauth token pair, normalized to absolute expiry for storage. */
export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Absolute epoch ms when the access token expires. */
  expiresAt: number;
}

/**
 * CSRF state store. Keys are per-request random strings. Values carry the
 * provider id the state was issued for plus the issued-at timestamp so we
 * can GC stale entries.
 */
interface AuthState {
  providerId: string;
  issuedAt: number;
}
const STATE_TTL_MS = 10 * 60_000; // 10 minutes
const authStates = new Map<string, AuthState>();

/** Remove any entries older than STATE_TTL_MS. Called on read + write. */
function gcAuthStates(): void {
  const cutoff = Date.now() - STATE_TTL_MS;
  // `forEach` avoids iterating the Map directly, which the repo's current
  // tsconfig target can't destructure without `--downlevelIteration`.
  authStates.forEach((entry, state) => {
    if (entry.issuedAt < cutoff) authStates.delete(state);
  });
}

/**
 * Test-only — exposes the CSRF map so unit tests can assert state/provider
 * bindings without reaching into module internals. Prefixed `__` so it's
 * obvious at call sites that this isn't part of the public API.
 */
export function __peekAuthStateForTests(state: string): string | undefined {
  return authStates.get(state)?.providerId;
}

/** Test-only — wipes the state store between tests so runs are isolated. */
export function __clearAuthStateStoreForTests(): void {
  authStates.clear();
}

/**
 * Build the authorization URL the user's browser navigates to. Records the
 * `state` → `providerId` binding so the callback can validate origin.
 *
 * Throws if the provider isn't configured for OAuth — catching this early
 * prevents the route layer from redirecting into an undefined URL.
 */
export function generateAuthUrl(provider: ProviderConfig, callbackUrl: string): string {
  if (provider.auth.type !== "oauth" || !provider.auth.oauthConfig) {
    throw new Error(`Provider ${provider.id} is not configured for OAuth`);
  }
  const cfg = provider.auth.oauthConfig;
  const state = randomBytes(24).toString("hex");
  gcAuthStates();
  authStates.set(state, { providerId: provider.id, issuedAt: Date.now() });

  const url = new URL(cfg.authUrl);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("response_type", "code");
  if (cfg.scopes && cfg.scopes.length > 0) {
    url.searchParams.set("scope", cfg.scopes.join(" "));
  }
  url.searchParams.set("state", state);
  return url.toString();
}

/**
 * Validate a callback's `state` against the CSRF store. Returns `true` iff
 * the state exists and was issued for the same provider. Consumes the
 * entry on success so replays are rejected.
 */
export function consumeAuthState(state: string, providerId: string): boolean {
  gcAuthStates();
  const entry = authStates.get(state);
  if (!entry) return false;
  if (entry.providerId !== providerId) return false;
  authStates.delete(state);
  return true;
}

/** Normalize a token-endpoint response body to our internal shape. */
function normalizeTokens(
  body: Record<string, unknown>,
  fallbackRefresh?: string,
): OAuthTokens {
  const accessToken = typeof body.access_token === "string" ? body.access_token : "";
  if (!accessToken) {
    throw new Error("Token response missing access_token");
  }
  const refreshToken =
    typeof body.refresh_token === "string" ? body.refresh_token : fallbackRefresh ?? "";
  if (!refreshToken) {
    throw new Error("Token response missing refresh_token and no existing one to reuse");
  }
  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : 3600;
  return {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000,
  };
}

/** POST form-encoded body to a token endpoint and parse the JSON response. */
async function postTokenRequest(
  tokenUrl: string,
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  const body = new URLSearchParams(params).toString();
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  if (!response.ok) {
    let detail = "";
    try {
      detail = await response.text();
    } catch {
      /* ignore */
    }
    throw new Error(
      `Token endpoint returned ${response.status} ${response.statusText}: ${detail.slice(0, 500)}`,
    );
  }
  return (await response.json()) as Record<string, unknown>;
}

/**
 * Exchange an authorization code for an access + refresh token pair.
 * `callbackUrl` must match what was sent on the authorize request.
 */
export async function exchangeCode(
  provider: ProviderConfig,
  code: string,
  callbackUrl: string,
): Promise<OAuthTokens> {
  if (provider.auth.type !== "oauth" || !provider.auth.oauthConfig) {
    throw new Error(`Provider ${provider.id} is not configured for OAuth`);
  }
  const cfg = provider.auth.oauthConfig;
  const params: Record<string, string> = {
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl,
    client_id: cfg.clientId,
  };
  if (cfg.clientSecret) params.client_secret = cfg.clientSecret;
  const body = await postTokenRequest(cfg.tokenUrl, params);
  return normalizeTokens(body);
}

/**
 * Use the stored refresh token to mint a new access token. Providers that
 * rotate refresh tokens will return one; providers that don't leave the
 * existing one untouched — `normalizeTokens` handles both by threading the
 * existing refresh token through as a fallback.
 */
export async function refreshAccessToken(provider: ProviderConfig): Promise<OAuthTokens> {
  if (provider.auth.type !== "oauth" || !provider.auth.oauthConfig) {
    throw new Error(`Provider ${provider.id} is not configured for OAuth`);
  }
  const existing = provider.auth.oauthTokens;
  if (!existing || !existing.refreshToken) {
    throw new Error(`Provider ${provider.id} has no refresh token — re-authenticate`);
  }
  const cfg = provider.auth.oauthConfig;
  const params: Record<string, string> = {
    grant_type: "refresh_token",
    refresh_token: existing.refreshToken,
    client_id: cfg.clientId,
  };
  if (cfg.clientSecret) params.client_secret = cfg.clientSecret;
  const body = await postTokenRequest(cfg.tokenUrl, params);
  return normalizeTokens(body, existing.refreshToken);
}

/** 5-minute buffer so we refresh before the access token actually expires. */
const EXPIRY_BUFFER_MS = 5 * 60_000;

/**
 * Return a usable access token for the provider. Refreshes if the cached
 * token is inside the 5-minute expiry buffer, persists the new pair to the
 * DB, and returns the new access token. Throws if the provider has no
 * stored tokens at all (user never completed auth) or if the refresh fails
 * (caller should prompt re-authenticate).
 */
export async function getValidToken(provider: ProviderConfig): Promise<string> {
  const tokens = provider.auth.oauthTokens;
  if (!tokens) {
    throw new Error(`Provider ${provider.id} is not connected — sign in required`);
  }
  if (tokens.expiresAt > Date.now() + EXPIRY_BUFFER_MS) {
    return tokens.accessToken;
  }
  const refreshed = await refreshAccessToken(provider);
  // Mirror the refresh onto the live provider object so in-memory callers
  // see the new token without re-reading the DB.
  provider.auth.oauthTokens = refreshed;

  // Persist. `getDB()` returns the singleton in-memory DB; find the matching
  // record and splice in the refreshed auth. If the provider isn't in the DB
  // (shouldn't happen via the route layer, but defensive) we skip the save
  // rather than crash.
  const db = getDB();
  if (db.providers) {
    const idx = db.providers.findIndex((p) => p.id === provider.id);
    if (idx !== -1) {
      db.providers[idx] = {
        ...db.providers[idx],
        auth: { ...db.providers[idx].auth, oauthTokens: refreshed },
      };
      save();
    }
  }

  return refreshed.accessToken;
}

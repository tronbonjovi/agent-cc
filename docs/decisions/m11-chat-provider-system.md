# M11 chat-provider-system — decisions log

Running log of mid-task decisions, scope shifts, and gaps surfaced during M11 execution. Each entry: context, decision, consequences. Captured so the rationale survives the milestone and informs post-M11 work.

**Milestone:** chat-provider-system (M11)
**Branch:** `feature/chat-provider-system`
**Status:** in progress

---

## Integration path — merge M10 before branching

- **Context:** M10 `feature/chat-composer-controls` was complete but not merged. Handoff offered two paths: merge M10 first (clean) or chain M11 on top of M10 branch (faster, larger combined diff).
- **Decision:** Merge M10 to main first, then branch `feature/chat-provider-system` from main. No PR (single-dev project, PR ceremony removed).
- **Consequences:** M11 gets its own branch and diff. Project-wide rule (TASK.md: "do not start N+1 until N is merged") honored.

---

## task001 — router registration location

- **Context:** Contract listed `server/index.ts` in `filesTouch`, but routes register via `server/routes/index.ts` → `registerRoutes()` pattern in this codebase.
- **Decision:** Register provider router in `server/routes/index.ts` instead. Intent honored, `server/index.ts` not modified.
- **Consequences:** Follows existing convention. Minor `filesTouch` deviation — flagged in task report, not a contract violation.

---

## task002 — `ProviderRequest` extra fields

- **Context:** Contract specified `ProviderRequest` shape with `provider`, `messages`, `model`, `temperature?`, `stream: true`. Implementer needed a way to pass credentials (API key or OAuth token) without embedding them in `ProviderConfig` (which is the wire-safe public type).
- **Decision:** Added optional `apiKey`, `timeoutMs`, `signal` to `ProviderRequest`. Credentials live server-side in `db.providers`, resolved by the route layer, passed into the adapter as `apiKey`.
- **Consequences:** Clean separation — `ProviderConfig` stays wire-safe; credentials only flow through the adapter boundary. task003 picked this pattern up and extended it to OAuth via `getValidToken`.

---

## Phase 2 pair → sequential due to file collision

- **Context:** TASK.md recommended task004 (OAuth) and task005 (model discovery) as a parallel pair. Both modify `server/routes/providers.ts`. Per `feedback_parallel_dispatch_collisions`, 2 agents racing on the same file risks git staging conflicts.
- **Decision:** Dispatched sequentially — task005 first (smaller server footprint, bigger client-side surface), then task004 (OAuth on top of the clean tree).
- **Consequences:** Slightly slower than true parallel dispatch. No conflicts, both tasks landed cleanly. Confirms the 2-parallel cap should only apply when `filesTouch` sets are disjoint, even though tasks are marked `parallelSafe: true`.

---

## task005 — Ollama detection heuristic

- **Context:** Ollama uses `/api/tags` for its native model list; OpenAI-compatible providers use `/v1/models`. Ollama v0.1.33+ exposes both, but `/api/tags` is the faster native path.
- **Decision:** Branch to `/api/tags` when `baseUrl` contains `11434` (default Ollama port) or the string `ollama`; otherwise `/v1/models`.
- **Consequences:** Works for default Ollama installs without config. Non-standard Ollama deployments still work via the OpenAI-compat fallback. Revisit if users hit false negatives on unusual baseUrls.

---

## task005 — empty model lists not cached

- **Context:** 60s TTL cache on discovery results. If a provider is offline on first call, caching the empty list would lock the user out for 60s after the provider recovers.
- **Decision:** Only populated results cache. Failures (empty list + logged error) retry on every call.
- **Consequences:** Slightly more network chatter when a provider is down (acceptable — discovery is on dropdown open, not the hot path). User sees models as soon as provider comes back.

---

## task005 — partial rewire of M10 catalog helpers

- **Context:** M10 introduced `client/src/stores/builtin-providers.ts` with static `MODEL_CATALOGS` consumed by both `model-dropdown.tsx` and `settings-popover.tsx`. Handoff called for swapping the data source to React Query while keeping helper signatures stable.
- **Decision:** Only `model-dropdown.tsx` was rewired to `useProviderModels()`. `settings-popover.tsx` still imports the static catalogs from M10 (`defaultModelFor`, `isModelInCatalog`, etc.).
- **Consequences:** Model dropdown is dynamic; settings popover's provider-switch cascade logic still falls back to the static catalog. task007 (composer wiring) owns the final rewire — allows a coherent design pass on per-provider model pickers rather than a piecemeal swap.

---

## task004 — provider CRUD schemas don't accept `oauthConfig`

- **Context:** task001 defined `ProviderCreateSchema` / `ProviderUpdateSchema` with fields known at the time (name, type, baseUrl, auth). task004 added `oauthConfig` to `ProviderConfig.auth` in `shared/types.ts`, but didn't extend the CRUD schemas.
- **Decision:** Gap flagged, not fixed in task004 (out of scope). Tests seed OAuth providers directly into the DB to validate the flow. Gap will be closed in **task006** (settings page UI) — that task needs to render OAuth config inputs anyway and will extend the schema as part of its work.
- **Consequences:** OAuth providers cannot be created via HTTP API between task004 and task006. No production impact — no user-facing flow exposes provider creation yet.

---

## task004 — `toPublic()` forwards non-secret OAuth config

- **Context:** `toPublic()` strips `apiKey` masking, `oauthTokens`, and other secrets before sending provider data over the wire. OAuth config has mixed sensitivity: `authUrl` / `tokenUrl` / `clientId` / `scopes` are public (stamped on the auth URL anyway); `clientSecret` is not.
- **Decision:** Forward `authUrl`, `tokenUrl`, `clientId`, `scopes` on public responses. Strip `clientSecret` alongside `oauthTokens`.
- **Consequences:** Settings UI can display "connected to `https://auth.example.com` as client `abc`" without a separate endpoint. Secrets still never leave the server.

---

## task004 — disconnect keeps `oauthConfig`, only clears tokens

- **Context:** Disconnect could either clear the entire OAuth setup (tokens + config) or just the tokens.
- **Decision:** Disconnect clears `oauthTokens` only. `oauthConfig` (URLs, clientId) stays.
- **Consequences:** "Sign in again" doesn't require re-entering provider config. Aligns with expected UX — disconnect is session-level, not destroy-provider-level.

---

## task003 — OpenAI history on reload: accepted limitation

- **Context:** OpenAI-compatible providers are stateless — every request must carry full conversation history. Claude CLI manages history via `--session-id` and JSONL session files. The scanner reads Claude JSONL files; there's no server-side store for non-Claude chat turns.
- **Decision:** **Option (b) — accept the limitation for M11.** task003 passes empty history with a TODO in the route. OpenAI chats retain context within a single SSE session (client-side buffer) but lose prior turns on page reload.
- **Rejected alternatives:**
  - (a) Chat route writes synthetic JSONL for OpenAI providers, scanner treats them uniformly → aligns with M8's unification vision, but large scope, reopens the chat–scanner integration just after stabilizing it.
  - (c) Defer to a dedicated milestone → fine but risks orphaning the TODO indefinitely.
- **Consequences:** Ship-now answer. Non-Claude chats are "session-scoped." Persistence is a post-M11 design call — revisit when there's a concrete user who cares about non-Claude reload continuity. task006/007 (UI tasks) intentionally NOT tapped to invent a persistence store.

---

## task003 — `HISTORY_CAP = 50` (message count, not token-aware)

- **Context:** OpenAI history could grow unbounded and blow provider context limits.
- **Decision:** Cap at last 50 messages. Single exported constant `HISTORY_CAP` at `server/providers/router.ts` for easy tuning.
- **Consequences:** Good enough for current use. A token-estimator is a cheap follow-up if users hit it (openai-tokens or tiktoken). Constant is tunable without a rewrite.

---

## task003 — fixture-only update outside `filesTouch`

- **Context:** `tests/chat-scanner-unification-e2e.test.ts` uses a mocked `getDB()`. After task003, the provider lookup in `routeToProvider` short-circuits with "Provider not found" if `db.providers` is absent.
- **Decision:** Added a minimal `providers: [claude-code]` seed to the mocked DB in that test. Outside `filesTouch` but necessary — flagged in task report.
- **Consequences:** Test remains accurate. Pattern to remember: new dependencies on `db.providers` may require fixture updates in unrelated tests.

---

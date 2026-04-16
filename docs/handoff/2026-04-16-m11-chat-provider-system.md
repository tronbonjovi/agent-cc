# Handoff — M11 chat-provider-system

**Date:** 2026-04-16
**Context:** M10 chat-composer-controls complete, ready to start M11 in a fresh session.

## Current State

- Branch `feature/chat-composer-controls` is complete: 8 commits, 6356 tests passing, TS clean, **not pushed**, **not merged** to main.
- Before starting M11, decide on one of:
  1. Live smoke test on `acc.devbox` → push → PR → merge, then branch `feature/chat-provider-system` from main
  2. Chain M11 on top of the M10 branch (faster, but larger combined PR)

## M11 Summary

Generic multi-provider backend. 8 tasks across 4 phases. See `.claude/roadmap/chat-provider-system/` for contracts and `.claude/roadmap/TASK.md` for the phase breakdown.

**Phase 1 (parallel pair, disjoint):** task001 provider CRUD + storage, task002 OpenAI-compatible adapter.
**Phase 2 (staggered):** task004 OAuth + task005 model discovery as parallel pair, then task003 provider-aware routing solo.
**Phase 3 (parallel pair):** task006 settings page + task007 wire composer to live providers.
**Phase 4 (solo):** task008 E2E.

## Load-Bearing Context M11 Must Respect

Two M10 carry-overs that M11 is the right layer to resolve:

1. **`thinking` and `webSearch` are forwarded-but-unflagged.** `ChatSettings.thinking` and `ChatSettings.webSearch` are written to the store and forwarded in the POST body to `/api/chat/prompt`, which passes them into `StreamingClaudeOptions`. The runner currently emits NO CLI flag for either because `--thinking` and `--web-search` don't exist in Claude CLI. When M11 adds OpenAI-compatible providers, the adapter should translate these capability flags into provider-native mechanisms (e.g., system prompt augmentation, tool-use config, or provider-specific API fields).

2. **"General" project mode inherits agent-cc's systemd cwd.** `runClaudeStreaming` only sets `spawn` options `cwd` when `opts.cwd` is a non-empty string; otherwise the process inherits agent-cc's working directory (the project tree, under systemd). Documented inline in `server/scanner/claude-runner.ts`. If this causes confusion with OpenAI-compatible providers (where cwd doesn't matter), the adapter can simply ignore it.

## Capability Registry Migration

M10 introduced `client/src/stores/builtin-providers.ts` as the single source of truth for `BUILTIN_PROVIDERS`, `MODEL_CATALOGS`, and the helpers `resolveProvider`, `defaultModelFor`, `isModelInCatalog`. M11's task005 (model discovery) replaces this with dynamic fetching. Pattern:

- Keep the helper signatures stable; swap the backing data source from the hardcoded constants to a React Query result keyed on provider id.
- `settings-popover.tsx` and `model-dropdown.tsx` consume these helpers — don't touch their import paths, just change what the module exports resolve to.

## Key M10 Files M11 Touches

- `shared/types.ts` — `ChatSettings`, `ChatGlobalDefaults`, `ProviderConfig`, `ProviderCapabilities` already defined. Credentials stay server-side only (`ProviderConfig.auth.type` is the only auth info on the client).
- `server/db.ts` — `DBData.chatDefaults` already exists. M11 adds `DBData.providers: ProviderConfig[]` (with credentials).
- `server/scanner/claude-runner.ts` — already handles model/effort/systemPrompt/cwd for Claude CLI. M11 must branch by `provider.type === 'claude-cli'` vs `'openai-compatible'` and route accordingly.
- `server/routes/chat.ts` — POST `/api/chat/prompt` already forwards all composer settings. M11 makes the handler provider-aware.
- `client/src/components/chat/settings-popover.tsx` — provider selector currently hardcodes "Claude Code". M11 populates from server.
- `client/src/components/chat/model-dropdown.tsx` — catalog currently hardcoded. M11 populates from server via model discovery.

## To Resume

Start a fresh session, open `.claude/roadmap/chat-provider-system/`, and run `/work-task`. The orchestrator will see M11 as the next active milestone.

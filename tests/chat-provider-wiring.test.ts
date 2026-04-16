// tests/chat-provider-wiring.test.ts
//
// chat-provider-system task007 — Wire composer to live provider API.
//
// Closes out M11 by replacing the static `BUILTIN_PROVIDERS` registry the
// composer read from in M10 with live data from `GET /api/providers`. The
// settings popover calls `loadProviders()` on mount, the store caches the
// fetched list, and `getActiveProvider(conversationId)` now looks up against
// that list. Deleted providers fall back to `claude-code`; mid-load reads
// return a sensible default without crashing.
//
// Two layers verified here:
//
//   1. Source-text guardrails on `settings-popover.tsx` and `model-dropdown.tsx`.
//      Vitest excludes `client/` (reference_vitest_client_excluded), so we
//      pin structure via regex instead of rendering React.
//
//   2. Pure-logic tests on the chat settings store — setting `providerId` to
//      a fetched id, fallback to `claude-code` when the provider is gone,
//      and graceful behavior when providers haven't loaded yet.

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { useChatSettingsStore } from '../client/src/stores/chat-settings-store';
import type { ProviderConfig } from '../shared/types';

const ROOT = path.resolve(__dirname, '..');
const SETTINGS_POPOVER_PATH = path.resolve(
  ROOT,
  'client/src/components/chat/settings-popover.tsx',
);
const MODEL_DROPDOWN_PATH = path.resolve(
  ROOT,
  'client/src/components/chat/model-dropdown.tsx',
);

// ---------------------------------------------------------------------------
// 1. Source-text guardrails on settings-popover.tsx
// ---------------------------------------------------------------------------

describe('settings-popover.tsx — live provider wiring', () => {
  const src = fs.readFileSync(SETTINGS_POPOVER_PATH, 'utf-8');

  it('reads providers from the store (not the static BUILTIN_PROVIDERS import)', () => {
    // The runtime list must come through the store slice so deletions /
    // updates from the settings page propagate. A raw import of
    // BUILTIN_PROVIDERS would mean a stale snapshot from module-load time.
    expect(src).not.toMatch(
      /import\s*\{[^}]*\bBUILTIN_PROVIDERS\b[^}]*\}\s*from\s*['"][^'"]*builtin-providers['"]/,
    );
  });

  it('subscribes to the providers slice from the store', () => {
    // Either `s.providers` in a selector, or a direct `providers` destructure
    // off the store state. Pin the name so the wiring is traceable.
    expect(src).toMatch(/\bproviders\b/);
  });

  it('calls loadProviders() on mount', () => {
    // useEffect + loadProviders() is the expected pattern. We check for the
    // action name appearing; the exact hook structure is a client-only
    // concern, but the action-name pin catches refactors that drop the
    // fetch entirely.
    expect(src).toMatch(/loadProviders\b/);
  });

  it('has no gradient or bounce/scale animations (safety)', () => {
    expect(src).not.toMatch(/\bbg-gradient-/);
    expect(src).not.toMatch(/\btext-gradient\b/);
    expect(src).not.toMatch(/\banimate-bounce\b/);
    expect(src).not.toMatch(/\bhover:scale-/);
    expect(src).not.toMatch(/\bactive:scale-/);
  });

  it('has no hardcoded user paths or PII', () => {
    expect(src).not.toMatch(/C:[/\\]Users[/\\]/i);
    expect(src).not.toMatch(/\/Users\/hi\//);
    expect(src).not.toMatch(/\/home\/tron\//);
    // No phone numbers
    expect(src).not.toMatch(/\+?\d{10,}/);
  });

  it('has no user-specific project names in UI (generic examples only)', () => {
    // Pin against the list the safety test enforces elsewhere — keeps this
    // file self-contained about UI-copy cleanliness without depending on the
    // broader safety scan.
    expect(src).not.toMatch(/Nicora Desk/i);
    expect(src).not.toMatch(/findash/i);
  });
});

// ---------------------------------------------------------------------------
// 2. Source-text guardrails on model-dropdown.tsx
// ---------------------------------------------------------------------------

describe('model-dropdown.tsx — live provider wiring', () => {
  const src = fs.readFileSync(MODEL_DROPDOWN_PATH, 'utf-8');

  it('uses useProviderModels (live hook, not static catalog)', () => {
    // The hook is the contract. Pin it here so the dropdown can't silently
    // fall back to a hardcoded lookup.
    expect(src).toMatch(/\buseProviderModels\b/);
  });

  it('has no gradient or bounce/scale animations (safety)', () => {
    expect(src).not.toMatch(/\bbg-gradient-/);
    expect(src).not.toMatch(/\btext-gradient\b/);
    expect(src).not.toMatch(/\banimate-bounce\b/);
    expect(src).not.toMatch(/\bhover:scale-/);
    expect(src).not.toMatch(/\bactive:scale-/);
  });

  it('has no hardcoded user paths or PII', () => {
    expect(src).not.toMatch(/C:[/\\]Users[/\\]/i);
    expect(src).not.toMatch(/\/Users\/hi\//);
    expect(src).not.toMatch(/\/home\/tron\//);
    expect(src).not.toMatch(/\+?\d{10,}/);
  });
});

// ---------------------------------------------------------------------------
// 3. Pure-logic: settings store — provider slice + fallbacks
// ---------------------------------------------------------------------------

function resetStore() {
  useChatSettingsStore.setState({
    globalDefaults: {
      providerId: 'claude-code',
      model: 'claude-sonnet-4-6',
      effort: 'medium',
    },
    overrides: {},
    loaded: false,
    providers: [],
    providersLoaded: false,
  });
}

// Helper to build a public provider config (the shape `GET /api/providers`
// returns). The server masks secrets before sending.
function makeProvider(
  id: string,
  name: string,
  overrides: Partial<ProviderConfig> = {},
): ProviderConfig {
  return {
    id,
    name,
    type: 'claude-cli',
    auth: { type: 'none' },
    capabilities: {
      thinking: true,
      effort: true,
      webSearch: true,
      systemPrompt: true,
      fileAttachments: true,
      projectContext: true,
    },
    ...overrides,
  };
}

describe('chat settings store — providers slice', () => {
  beforeEach(() => {
    resetStore();
  });

  it('exposes a providers array + providersLoaded flag', () => {
    const state = useChatSettingsStore.getState();
    expect(Array.isArray(state.providers)).toBe(true);
    expect(typeof state.providersLoaded).toBe('boolean');
  });

  it('setting providerId to a fetched id updates the active conversation settings', () => {
    // Simulate: the store hydrated providers from the API, then the popover
    // handler selected one. The override must reflect the new providerId
    // and subsequent reads of getSettings must merge it.
    useChatSettingsStore.setState({
      providers: [
        makeProvider('claude-code', 'Claude Code'),
        makeProvider('user-ollama', 'Local Ollama', {
          type: 'openai-compatible',
          baseUrl: 'http://localhost:11434/v1',
        }),
      ],
      providersLoaded: true,
    });
    useChatSettingsStore
      .getState()
      .updateSettings('conv-1', { providerId: 'user-ollama' });
    const resolved = useChatSettingsStore.getState().getSettings('conv-1');
    expect(resolved.providerId).toBe('user-ollama');
  });

  it('getActiveProvider returns the fetched provider when present', () => {
    useChatSettingsStore.setState({
      providers: [
        makeProvider('claude-code', 'Claude Code'),
        makeProvider('user-ollama', 'Local Ollama'),
      ],
      providersLoaded: true,
    });
    useChatSettingsStore
      .getState()
      .updateSettings('conv-1', { providerId: 'user-ollama' });
    const provider = useChatSettingsStore
      .getState()
      .getActiveProvider('conv-1');
    expect(provider).toBeDefined();
    expect(provider?.id).toBe('user-ollama');
  });

  it('falls back to claude-code when the referenced provider was deleted', () => {
    // Mid-conversation: user picked "user-ollama", then deleted it from the
    // settings page. The store still carries the stale providerId on the
    // override; the lookup must gracefully fall back to claude-code so the
    // next POST still has a valid provider.
    useChatSettingsStore.setState({
      providers: [makeProvider('claude-code', 'Claude Code')],
      providersLoaded: true,
    });
    useChatSettingsStore
      .getState()
      .updateSettings('conv-1', { providerId: 'user-ollama' });
    const provider = useChatSettingsStore
      .getState()
      .getActiveProvider('conv-1');
    expect(provider).toBeDefined();
    expect(provider?.id).toBe('claude-code');
  });

  it('returns undefined when no providers are loaded and claude-code not present', () => {
    // Worst case: the API call is in-flight AND no provider list has been
    // hydrated. Callers must be defensive — but the store itself must not
    // throw. Returning undefined is the explicit contract; the popover
    // renders an empty selector when this happens.
    useChatSettingsStore.setState({
      providers: [],
      providersLoaded: false,
    });
    const provider = useChatSettingsStore
      .getState()
      .getActiveProvider('conv-fresh');
    expect(provider).toBeUndefined();
  });

  it('getCapabilities returns empty capabilities object when provider is undefined', () => {
    // When getActiveProvider returns undefined (mid-load, no claude-code seed
    // yet), getCapabilities must still return an object so the popover's
    // `caps.effort` etc. reads don't crash. All flags fall through to the
    // falsy default — the popover hides every gated control until providers
    // load, which is the correct degraded-mode behavior.
    useChatSettingsStore.setState({
      providers: [],
      providersLoaded: false,
    });
    const caps = useChatSettingsStore.getState().getCapabilities('conv-fresh');
    expect(caps).toBeDefined();
    expect(typeof caps).toBe('object');
    // No flags should be truthy when there's no provider to resolve.
    expect(caps.effort).toBeFalsy();
    expect(caps.thinking).toBeFalsy();
  });

  it('loadProviders action is exposed on the store', () => {
    // Structural check — the action must exist so settings-popover.tsx can
    // invoke it on mount. Actual fetch behavior is integration-level; here
    // we only pin the API surface.
    const state = useChatSettingsStore.getState();
    expect(typeof state.loadProviders).toBe('function');
  });
});

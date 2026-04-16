// tests/chat-settings-popover.test.ts
//
// chat-composer-controls task004 — Settings popover shell + provider selector.
//
// Two layers verified:
//
//   1. Source-text guardrails on the new `settings-popover.tsx` component
//      and its mount point in `chat-panel.tsx`. Vitest excludes `client/`,
//      so we assert structure via regex per `reference_vitest_client_excluded`.
//
//   2. Pure-logic: when `updateSettings(conversationId, { providerId })` is
//      called through the settings store, the override is recorded and
//      `getSettings` reflects the new provider. This covers the contract
//      the popover is responsible for honoring on provider change.
//
// Vitest excludes `client/` so the popover is not rendered — the behavioral
// guard is the pure-logic store test below plus the source-text check that
// the popover calls updateSettings.

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { useChatSettingsStore } from '../client/src/stores/chat-settings-store';

const ROOT = path.resolve(__dirname, '..');
const CHAT_PANEL_PATH = path.resolve(
  ROOT,
  'client/src/components/chat/chat-panel.tsx',
);
const SETTINGS_POPOVER_PATH = path.resolve(
  ROOT,
  'client/src/components/chat/settings-popover.tsx',
);
const SHARED_TYPES_PATH = path.resolve(ROOT, 'shared/types.ts');

// ---------------------------------------------------------------------------
// 1. Source-text guardrails on settings-popover.tsx
// ---------------------------------------------------------------------------

describe('settings-popover.tsx — source-text structure', () => {
  const src = fs.readFileSync(SETTINGS_POPOVER_PATH, 'utf-8');

  it('exports a SettingsPopover component', () => {
    expect(src).toMatch(/export\s+(function|const)\s+SettingsPopover\b/);
  });

  it('uses the shadcn Popover primitive', () => {
    // The popover container mounts on Popover / PopoverTrigger / PopoverContent
    // from shadcn. Pin the import so the structural invariant survives
    // refactors.
    expect(src).toMatch(/from\s+['"]@\/components\/ui\/popover['"]/);
    expect(src).toMatch(/<Popover\b/);
    expect(src).toMatch(/<PopoverTrigger\b/);
    expect(src).toMatch(/<PopoverContent\b/);
  });

  it('wraps the + button as the PopoverTrigger (owns the data-testid)', () => {
    // The + button's `data-testid="chat-composer-plus"` was set up by
    // task002 and must live inside the popover trigger so clicking it opens
    // the popover rather than a no-op stub.
    expect(src).toMatch(/data-testid=["']chat-composer-plus["']/);
  });

  it('exposes a provider selector with a stable test id', () => {
    // The provider selector is the first control added to the popover.
    // Pin its mounting point so task005 / task007 can layout-traverse
    // without brittle DOM queries.
    expect(src).toMatch(/data-testid=["']chat-settings-provider["']/);
  });

  it('reads + writes the settings store', () => {
    // Provider selection must round-trip through `updateSettings` just like
    // the model dropdown — no local-component state for a field that's
    // persisted on the per-conversation override.
    expect(src).toMatch(
      /from\s+['"]@\/stores\/chat-settings-store['"]/,
    );
    expect(src).toMatch(/getSettings\s*\(/);
    expect(src).toMatch(/updateSettings\s*\(/);
    // `providerId` is the field the provider selector writes; confirm it's
    // the value being persisted (not a stray `model:` or other field).
    expect(src).toMatch(/providerId\s*:/);
  });

  it('imports the Plus icon from lucide-react (moved here from chat-panel)', () => {
    // Task004 relocates the Plus icon to the popover's trigger. The
    // chat-composer-layout test used to pin this import on chat-panel.tsx;
    // the pin moves here to preserve coverage.
    expect(src).toMatch(
      /import\s*\{[^}]*\bPlus\b[^}]*\}\s*from\s*['"]lucide-react['"]/,
    );
    expect(src).toMatch(/<Plus\b/);
  });

  it('hardcodes claude-code as the initial available provider', () => {
    // The task contract stipulates only Claude Code is offered for this
    // milestone. Additional providers land in M11 — until then, asserting
    // the id anchors the behavior.
    expect(src).toContain('claude-code');
    expect(src).toMatch(/Claude Code/);
  });

  it('leaves placeholder slots for task005 / task006 additional controls', () => {
    // Comments or explicit slot containers are expected so the subsequent
    // tasks have mounting points. We accept either "task005" or "task006"
    // anywhere in the source as the pinning signal.
    expect(src).toMatch(/task005/);
    expect(src).toMatch(/task006/);
  });

  it('has no gradient or bounce/scale animations (safety)', () => {
    expect(src).not.toMatch(/\bbg-gradient-/);
    expect(src).not.toMatch(/\btext-gradient\b/);
    expect(src).not.toMatch(/\banimate-bounce\b/);
    expect(src).not.toMatch(/\bhover:scale-/);
    expect(src).not.toMatch(/\bactive:scale-/);
  });
});

// ---------------------------------------------------------------------------
// 2. chat-panel.tsx mounts the popover in place of the task002 + button stub
// ---------------------------------------------------------------------------

describe('chat-panel.tsx — mounts SettingsPopover', () => {
  const src = fs.readFileSync(CHAT_PANEL_PATH, 'utf-8');

  it('imports SettingsPopover', () => {
    expect(src).toMatch(
      /import\s*\{[^}]*\bSettingsPopover\b[^}]*\}\s*from\s*['"][^'"]*settings-popover['"]/,
    );
  });

  it('renders <SettingsPopover /> with the conversationId prop', () => {
    // The popover owns the + button trigger internally — the panel only
    // mounts the component with the active conversationId so the popover
    // can read + write the right override record.
    expect(src).toMatch(/<SettingsPopover[^>]*conversationId=\{conversationId\}/);
  });

  it('no longer renders the stub + <Button data-testid="chat-composer-plus">', () => {
    // Regression guard: task002's placeholder Button must be gone — the
    // popover now owns the trigger. If the old stub sticks around, clicking
    // it will be a silent no-op and the popover will never open.
    //
    // The stub was a Button element with data-testid chat-composer-plus.
    // The popover mounts its own Button (inside PopoverTrigger) with the
    // same testid, so the existence of the testid in the panel src is
    // NOT the regression — the regression is the stub `Button ... Plus`
    // element still appearing OUTSIDE the new SettingsPopover component.
    //
    // We check by scanning: if we see a Button with `<Plus` directly inside
    // it in chat-panel.tsx, the stub wasn't removed. (The same Plus now
    // lives inside settings-popover.tsx instead.)
    expect(src).not.toMatch(/<Plus\s*\/>/);
  });
});

// ---------------------------------------------------------------------------
// 3. shared/types.ts defines ProviderConfig + ProviderCapabilities
// ---------------------------------------------------------------------------

describe('shared/types.ts — ProviderConfig + ProviderCapabilities', () => {
  const src = fs.readFileSync(SHARED_TYPES_PATH, 'utf-8');

  it('declares ProviderCapabilities interface with the expected flags', () => {
    // The capability flags drive task007's show/hide logic. Pin the shape
    // so additions don't silently break the dependent milestone.
    expect(src).toMatch(/interface\s+ProviderCapabilities\b/);
    expect(src).toMatch(/\bthinking\?\s*:\s*boolean\b/);
    expect(src).toMatch(/\beffort\?\s*:\s*boolean\b/);
    expect(src).toMatch(/\bwebSearch\?\s*:\s*boolean\b/);
    expect(src).toMatch(/\btemperature\?\s*:\s*boolean\b/);
    expect(src).toMatch(/\bsystemPrompt\?\s*:\s*boolean\b/);
    expect(src).toMatch(/\bfileAttachments\?\s*:\s*boolean\b/);
    expect(src).toMatch(/\bprojectContext\?\s*:\s*boolean\b/);
  });

  it('declares ProviderConfig interface with id/name/type/auth/capabilities', () => {
    expect(src).toMatch(/interface\s+ProviderConfig\b/);
    // Quick structural pins on the required fields.
    expect(src).toMatch(/\bid\s*:\s*string\b/);
    // `type` is a narrow union — pin the two variants the contract calls
    // for so M11 can't accidentally remove either without the test
    // screaming.
    expect(src).toMatch(/type\s*:\s*["']claude-cli["']\s*\|\s*["']openai-compatible["']/);
    // The auth details (apiKey / oauthConfig) live server-side. Client
    // only sees auth.type.
    expect(src).toMatch(/auth\s*:\s*\{[^}]*type\s*:\s*["']none["']\s*\|\s*["']api-key["']\s*\|\s*["']oauth["']/);
    expect(src).toMatch(/capabilities\s*:\s*ProviderCapabilities\b/);
  });
});

// ---------------------------------------------------------------------------
// 4. Pure-logic: selecting a provider updates the settings store
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
  });
}

describe('chat settings store — provider selection behavior', () => {
  beforeEach(() => {
    resetStore();
  });

  it('updateSettings with providerId records the override', () => {
    // Simulates what the popover does when the user picks a provider.
    useChatSettingsStore.getState().updateSettings('conv-1', {
      providerId: 'ollama',
    });
    const s = useChatSettingsStore.getState().getSettings('conv-1');
    expect(s.providerId).toBe('ollama');
    // Other fields still inherit from defaults — provider change alone
    // shouldn't wipe model/effort.
    expect(s.model).toBe('claude-sonnet-4-6');
    expect(s.effort).toBe('medium');
  });

  it('updateSettings can reset the model alongside providerId in the same call', () => {
    // The popover resets model to the provider's default when provider
    // changes (see task004 instructions). Verify both fields land on a
    // single merged override, not two separate writes.
    useChatSettingsStore.getState().updateSettings('conv-1', {
      providerId: 'ollama',
      model: 'llama3.2:8b',
    });
    const s = useChatSettingsStore.getState().getSettings('conv-1');
    expect(s.providerId).toBe('ollama');
    expect(s.model).toBe('llama3.2:8b');
  });

  it('per-conversation isolation: changing provider on conv-1 does not affect conv-2', () => {
    useChatSettingsStore.getState().updateSettings('conv-1', {
      providerId: 'ollama',
    });
    const conv2 = useChatSettingsStore.getState().getSettings('conv-2');
    expect(conv2.providerId).toBe('claude-code');
  });
});

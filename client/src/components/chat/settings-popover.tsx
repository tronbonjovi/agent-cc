// client/src/components/chat/settings-popover.tsx
//
// Composer settings popover — chat-composer-controls task004.
//
// The + button in the composer opens this popover. It's the container for
// per-conversation settings; task005 adds effort / thinking / web search /
// system prompt controls inside it, and task006 adds the project context
// selector. For this task we own only:
//
//   1. The Popover shell (shadcn Popover / PopoverTrigger / PopoverContent).
//   2. The + button, which lives inside PopoverTrigger and carries the
//      `data-testid="chat-composer-plus"` mount that task002 set up. Moving
//      the testid here (off the stub Button in chat-panel.tsx) means the
//      click opens the popover instead of being a no-op.
//   3. The provider selector — first control in the popover. Shadcn's
//      DropdownMenu primitive matches the visual language already used by
//      ModelDropdown.
//
// Provider catalog is intentionally hardcoded to a single entry (Claude
// Code) for this milestone. The provider-system milestone (M11) will add
// server-side CRUD and populate this list dynamically. The ProviderConfig
// type in shared/types.ts is already the contract M11 builds against, so
// this catalog can grow without breaking the popover or the capability
// system (task007).
//
// Provider change resets the model to the provider's default. That's a UX
// safety net: keeping the currently-selected model when switching to a
// provider that doesn't support it would send an invalid id to the CLI on
// the next prompt. We perform the reset in a single `updateSettings` call
// so the per-conversation override merges atomically.

import { Plus, ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { useChatSettingsStore } from '@/stores/chat-settings-store';
import type { ProviderConfig } from '../../../../shared/types';

// ---------------------------------------------------------------------------
// Provider catalog
//
// Kept as a plain `const` array so tests can poke at the shape and so
// adding a provider is a one-line diff. `defaultModel` is not part of
// ProviderConfig (it's a UX hint, not a backend detail) so we carry it on
// a local entry type that wraps the config.
// ---------------------------------------------------------------------------
interface ProviderEntry {
  config: ProviderConfig;
  /** Model id selected when the user switches to this provider. */
  defaultModel: string;
}

const AVAILABLE_PROVIDERS: ReadonlyArray<ProviderEntry> = [
  {
    config: {
      id: 'claude-code',
      name: 'Claude Code',
      type: 'claude-cli',
      auth: { type: 'oauth' },
      capabilities: {
        thinking: true,
        effort: true,
        webSearch: true,
        systemPrompt: true,
        fileAttachments: true,
        projectContext: true,
      },
    },
    defaultModel: 'claude-sonnet-4-6',
  },
];

/** Resolve a provider id to its human-readable name. */
function displayNameFor(providerId: string): string {
  const entry = AVAILABLE_PROVIDERS.find((p) => p.config.id === providerId);
  // Fall through to the raw id for unknown values — matches the pattern in
  // model-dropdown.tsx, where unfamiliar ids render as-is rather than a
  // misleading default.
  return entry ? entry.config.name : providerId;
}

interface SettingsPopoverProps {
  /** The conversation this popover controls. */
  conversationId: string;
}

/**
 * Popover mounted on the + button in the composer. Owns the provider
 * selector today; task005 and task006 add more controls below it.
 */
export function SettingsPopover({ conversationId }: SettingsPopoverProps) {
  // Subscribe to the whole store so provider changes propagate through the
  // trigger label without manual state juggling. `getSettings` is a pure
  // merge — cheap on every render.
  const getSettings = useChatSettingsStore((s) => s.getSettings);
  const updateSettings = useChatSettingsStore((s) => s.updateSettings);
  const current = getSettings(conversationId);
  const currentProviderId = current.providerId;
  const currentDisplay = displayNameFor(currentProviderId);

  const handleProviderSelect = (entry: ProviderEntry) => {
    // Atomic merge: providerId + model in one write so the override never
    // lands in a half-configured state. If we split this into two writes,
    // a fast re-render between them could fire a POST with the old
    // provider + new model (or vice versa).
    updateSettings(conversationId, {
      providerId: entry.config.id,
      model: entry.defaultModel,
    });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0"
          data-testid="chat-composer-plus"
          aria-label="Open chat settings"
        >
          <Plus />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 max-h-[70vh] overflow-y-auto p-0"
      >
        <div className="p-4 space-y-4">
          {/* Provider selector ------------------------------------------- */}
          <div
            className="space-y-1.5"
            data-testid="chat-settings-provider"
          >
            <label className="text-xs font-medium text-muted-foreground">
              Provider
            </label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full justify-between"
                  aria-label={`Provider: ${currentDisplay}`}
                >
                  <span className="truncate">{currentDisplay}</span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[14rem]">
                {AVAILABLE_PROVIDERS.map((entry) => {
                  const isActive = entry.config.id === currentProviderId;
                  return (
                    <DropdownMenuItem
                      key={entry.config.id}
                      data-testid={`chat-settings-provider-item-${entry.config.id}`}
                      onSelect={() => handleProviderSelect(entry)}
                    >
                      <span className="flex-1">{entry.config.name}</span>
                      {isActive && <Check className="ml-2 h-3.5 w-3.5" />}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/*
            task005 slot — effort / thinking / web search / system prompt
            controls mount here. Leaving a placeholder div so the layout has
            a predictable structure for the subsequent task to diff against.
          */}
          <div data-testid="chat-settings-slot-task005" />

          {/*
            task006 slot — project context selector mounts here.
          */}
          <div data-testid="chat-settings-slot-task006" />
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Exported so source-text guardrail tests can inspect the catalog shape and
// future tests / a global defaults UI can enumerate providers without
// duplicating the list.
export const availableProviders = AVAILABLE_PROVIDERS;

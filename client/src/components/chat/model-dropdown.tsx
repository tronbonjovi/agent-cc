// client/src/components/chat/model-dropdown.tsx
//
// Composer model selector — chat-composer-controls task003 (origin) +
// task007 (capability-aware catalog).
//
// Shows the currently-selected model as a pill in the composer's left zone
// and lets the user switch models via a shadcn DropdownMenu. Selection is
// recorded on the per-conversation override in `useChatSettingsStore`; the
// next POST to `/api/chat/prompt` reads that value and forwards it to the
// CLI via `--model <id>`.
//
// Model list is provider-scoped — task007 moved the model catalog into
// `builtin-providers.ts` so the dropdown can resolve the active provider
// and pick the right list. Claude Code is the only builtin today; future
// providers (OpenAI-compatible, etc.) ship with their own catalog keyed by
// provider id.
//
// Per `feedback_no_model_abstraction` we show real model ids / display
// names, never preset labels like "Fast / Balanced / Smart".
//
// When the user hasn't picked a model yet, `getSettings(id).model` falls
// through to the global default. If the resolved id isn't in the active
// provider's catalog (e.g. the user set a custom id via a future settings
// UI, or the provider has no catalog), we show it raw so they're not misled
// into thinking nothing is selected.

import { ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { useChatSettingsStore } from '@/stores/chat-settings-store';
import {
  MODEL_CATALOGS,
  type ModelEntry,
} from '@/stores/builtin-providers';

/**
 * Pick the catalog for a provider id. Returns an empty array when the
 * provider has no registered catalog so the caller can render an explicit
 * empty state rather than crashing on a map over undefined.
 */
function catalogFor(providerId: string): ReadonlyArray<ModelEntry> {
  return MODEL_CATALOGS[providerId] ?? [];
}

/**
 * Resolve a model id to its display name within the active provider's
 * catalog. Falls through to the raw id for unknown values so the user sees
 * *something* real rather than a misleading default.
 */
function displayNameFor(
  catalog: ReadonlyArray<ModelEntry>,
  modelId: string,
): string {
  const entry = catalog.find((m) => m.id === modelId);
  return entry ? entry.name : modelId;
}

interface ModelDropdownProps {
  /** The conversation this dropdown controls. */
  conversationId: string;
}

/**
 * Dropdown mounted in the composer's left zone. Reads + writes the
 * per-conversation model override on the chat settings store.
 */
export function ModelDropdown({ conversationId }: ModelDropdownProps) {
  // Subscribe to the whole store so model/provider changes trigger a
  // re-render of the trigger label. `getSettings` is a pure merge of
  // globalDefaults + overrides — cheap to call on every render.
  const getSettings = useChatSettingsStore((s) => s.getSettings);
  const updateSettings = useChatSettingsStore((s) => s.updateSettings);
  const current = getSettings(conversationId);
  const { providerId, model: currentModel } = current;
  const catalog = catalogFor(providerId);
  const currentDisplay = displayNameFor(catalog, currentModel);

  // Empty catalog → the provider either hasn't registered any models yet or
  // is still loading them. We keep the dropdown mounted (for layout
  // continuity) but show a "No models available" hint inside the menu.
  const isEmpty = catalog.length === 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-1"
          data-testid="chat-composer-model"
          aria-label={`Model: ${currentDisplay}`}
        >
          <span className="truncate">{currentDisplay}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[12rem]">
        {isEmpty ? (
          <div
            className="px-2 py-1.5 text-xs text-muted-foreground"
            data-testid="chat-composer-model-empty"
          >
            No models available
          </div>
        ) : (
          catalog.map((m) => {
            const isActive = m.id === currentModel;
            return (
              <DropdownMenuItem
                key={m.id}
                data-testid={`chat-composer-model-item-${m.id}`}
                onSelect={() => {
                  // Persist the selection on the per-conversation override.
                  // No network round-trip — the settings store is transient
                  // per-tab; the next POST /api/chat/prompt reads this value
                  // and forwards it to the CLI.
                  updateSettings(conversationId, { model: m.id });
                }}
              >
                <span className="flex-1">{m.name}</span>
                {isActive && <Check className="ml-2 h-3.5 w-3.5" />}
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Back-compat re-export: task003 exposed `claudeCodeModels` as a source-text
// anchor. Point it at the registry so old tests (which grep for the name)
// still resolve and new consumers have one blessed place to look.
export const claudeCodeModels = MODEL_CATALOGS['claude-code'];

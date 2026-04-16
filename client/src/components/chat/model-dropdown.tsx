// client/src/components/chat/model-dropdown.tsx
//
// Composer model selector — chat-composer-controls task003 (origin) +
// task007 (capability-aware catalog) + chat-provider-system task005
// (dynamic discovery).
//
// Shows the currently-selected model as a pill in the composer's left zone
// and lets the user switch models via a shadcn DropdownMenu. Selection is
// recorded on the per-conversation override in `useChatSettingsStore`; the
// next POST to `/api/chat/prompt` reads that value and forwards it to the
// CLI via `--model <id>`.
//
// Model list source — task005 swapped the backing store from a hardcoded
// client-side MODEL_CATALOGS lookup to a live `useProviderModels(id)` query
// against `GET /api/providers/:id/models`. The server branches per provider
// type: Claude Code returns a known set, Ollama hits `/api/tags`, OpenAI-
// compatible hits `/v1/models`. Results cache for 60s on both sides so the
// dropdown opens instantly on subsequent renders.
//
// Per `feedback_no_model_abstraction` we show real model ids / display
// names, never preset labels like "Fast / Balanced / Smart".
//
// States the dropdown can land in:
//
//   - **loading** — hook's `isLoading` is true; show a disabled trigger
//     labeled "Loading models..." so the user knows something's pending.
//   - **error** — the fetch failed (provider offline, non-2xx); show the
//     current model id on the trigger (truthful fallback) and render an
//     "Unavailable" hint inside the menu.
//   - **empty** — query succeeded but returned []; show "No models
//     available" in the menu so the user knows it's not a loading glitch.
//   - **populated** — render model items; current selection gets a check.

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
import { useProviderModels, type ProviderModel } from '@/hooks/use-provider-models';

/**
 * Resolve a model id to its display name within the discovered catalog.
 * Falls through to the raw id for unknown values so the user sees
 * *something* real rather than a misleading default. Matches the
 * `feedback_no_model_abstraction` stance — truthful raw id is better than
 * a synthetic "Default" label.
 */
function displayNameFor(
  models: ReadonlyArray<ProviderModel>,
  modelId: string,
): string {
  const entry = models.find((m) => m.id === modelId);
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

  // Pull the discovered model list. `staleTime: 60_000` in the hook means
  // the cache is warm across most dropdown opens; the first mount after a
  // provider switch briefly shows the loading state.
  const { models, isLoading, error } = useProviderModels(providerId);

  const currentDisplay = displayNameFor(models, currentModel);

  // Trigger-label resolution. When we're still loading and have nothing
  // cached, the store-recorded id (which may have been set from the M10
  // static defaults) is the most truthful label we can show. We explicitly
  // call out the loading state on aria-label for screen readers.
  const triggerLabel = isLoading && models.length === 0
    ? 'Loading models...'
    : currentDisplay;

  const isEmpty = !isLoading && !error && models.length === 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-1"
          data-testid="chat-composer-model"
          aria-label={`Model: ${triggerLabel}`}
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[12rem]">
        {isLoading ? (
          <div
            className="px-2 py-1.5 text-xs text-muted-foreground"
            data-testid="chat-composer-model-loading"
          >
            Loading models...
          </div>
        ) : error ? (
          <div
            className="px-2 py-1.5 text-xs text-muted-foreground"
            data-testid="chat-composer-model-error"
          >
            Models unavailable
          </div>
        ) : isEmpty ? (
          <div
            className="px-2 py-1.5 text-xs text-muted-foreground"
            data-testid="chat-composer-model-empty"
          >
            No models available
          </div>
        ) : (
          models.map((m) => {
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
// still resolve and new consumers have one blessed place to look. The
// registry stays the M10 static fallback used by settings-popover — task007
// cascading logic still depends on it for pre-switch model-compat checks.
export const claudeCodeModels: ReadonlyArray<ModelEntry> =
  MODEL_CATALOGS['claude-code'] ?? [];

// client/src/components/chat/model-dropdown.tsx
//
// Composer model selector — chat-composer-controls task003 (origin) +
// task007 (capability-aware catalog) + chat-provider-system task005
// (dynamic discovery) + chat-provider-system M11 task007 (provider-change
// model reset).
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
//   - **stale selection** (M11) — query returned a non-empty list but the
//     currently stored model id isn't in it. Shows the raw id on the
//     trigger with a `(not in catalog)` hint; an effect auto-resets the
//     stored model to the first available entry on the next tick so the
//     next POST won't 4xx. The "not in catalog" hint window is therefore
//     very brief in practice, but the explicit fallback render prevents
//     the store from being forced to always carry a valid id.
//
// Provider-change coordination (M11): the settings popover atomically sets
// `{ providerId, model }` in one write. If the new provider's model list
// is already cached, the popover picks a compatible model up front; if not,
// it clears `model` to `''` and THIS component's selection-reset effect
// fills in the first available entry once the query resolves. Owning the
// reset here keeps it close to the data that drives it.

import { useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { useChatSettingsStore } from '@/stores/chat-settings-store';
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

  // Is the stored model present in the provider's live list? We use this
  // for both trigger-label hinting ("(not in catalog)") and the one-shot
  // auto-reset effect below.
  const hasModels = models.length > 0;
  const modelInList = hasModels && models.some((m) => m.id === currentModel);

  // Selection-reset (M11). When the popover switches providers it clears
  // `model` to empty OR leaves a stale id from the previous provider. Once
  // this hook's query resolves with a non-empty list, we pick the first
  // available model if the current one isn't valid.
  //
  // Why not do this synchronously in the popover? The popover doesn't know
  // what the new provider's model list looks like without also running
  // `useProviderModels` for that provider — which fires a fetch per render
  // and couples the popover to every provider's discovery endpoint. Keeping
  // the reset next to the hook call means one fetch, one effect, one place
  // to look when the reset behavior changes.
  //
  // Loop-safety: the effect only fires when (providerId, currentModel,
  // models) change. Once we write a model from the list, `modelInList`
  // flips to true and the effect no-ops on subsequent renders.
  useEffect(() => {
    if (!hasModels) return;
    if (modelInList) return;
    // Prefer a stable first-entry pick over "closest match" so behavior is
    // predictable across providers — the user can always open the dropdown
    // and pick something else.
    updateSettings(conversationId, { model: models[0].id });
  }, [conversationId, providerId, hasModels, modelInList, models, updateSettings]);

  const currentDisplay = displayNameFor(models, currentModel);

  // Trigger-label resolution. When we're still loading and have nothing
  // cached, the store-recorded id (which may have been set from the M10
  // static defaults) is the most truthful label we can show. We explicitly
  // call out the loading state on aria-label for screen readers.
  //
  // Stale-selection hint: when the query resolved but the stored id isn't
  // in the list, we append "(not in catalog)". The selection-reset effect
  // above fires on the same render so this is usually one frame of copy,
  // but pinning it on the trigger means a long-lived stale id (e.g. empty
  // string when the current provider returns empty) doesn't render as a
  // blank button.
  let triggerLabel: string;
  if (isLoading && models.length === 0) {
    triggerLabel = 'Loading models...';
  } else if (!currentModel) {
    // Empty stored model — common transient state right after a provider
    // change with no cached catalog. Show a neutral placeholder so the
    // button doesn't render as a blank pill.
    triggerLabel = 'Select model';
  } else if (hasModels && !modelInList) {
    // Truthful fallback per feedback_no_model_abstraction — show the id
    // verbatim with a hint so the user knows why "their" model doesn't
    // appear in the list.
    triggerLabel = `${currentModel} (not in catalog)`;
  } else {
    triggerLabel = currentDisplay;
  }

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

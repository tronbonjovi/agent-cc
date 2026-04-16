// client/src/components/chat/settings-popover.tsx
//
// Composer settings popover — chat-composer-controls task004 (shell) +
// task005 (controls) + task006 (project selector) + task007 (capability
// gating & temperature slider) + chat-provider-system M11 task007 (live
// provider wiring — this edit).
//
// The + button in the composer opens this popover. It's the container for
// per-conversation settings. Ownership layers:
//
//   1. The Popover shell (shadcn Popover / PopoverTrigger / PopoverContent).
//   2. The + button, which lives inside PopoverTrigger and carries the
//      `data-testid="chat-composer-plus"` mount that task002 set up.
//   3. The provider selector — first control in the popover. Reads from
//      `store.providers` (hydrated via `loadProviders()` against
//      `GET /api/providers`) so user-added providers from the Settings page
//      appear here automatically.
//   4. Capability-gated controls — each control renders only if the active
//      provider's capability flag for it is true. Switching providers
//      updates `caps` through the store selector and the controls show/hide
//      automatically. When no provider resolves (mid-load, or a stale
//      providerId), `getCapabilities` returns `{}` — every flag is falsy,
//      every gated control hides. Degraded but safe.
//   5. Provider-change cascade — when the user picks a different provider,
//      we atomically reset `model` to empty alongside the new `providerId`.
//      The model dropdown owns the "select-first-available-model-after-
//      provider-change" responsibility because it's the only layer that
//      can see the new provider's live model list. See
//      `model-dropdown.tsx` for the selection-reset logic.

import { useEffect } from 'react';
import { useRef, useState, type ChangeEvent } from 'react';
import { Plus, ChevronDown, ChevronRight, Check, Paperclip, X } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import type { ProviderModel } from '@/hooks/use-provider-models';

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
  const getCapabilities = useChatSettingsStore((s) => s.getCapabilities);
  // M11: provider list now comes from the API — not a static import. The
  // `providers` slice is subscribed (not read via `.getState()`) so provider
  // changes on the Settings page re-render this popover automatically.
  const providers = useChatSettingsStore((s) => s.providers);
  const providersLoaded = useChatSettingsStore((s) => s.providersLoaded);
  const loadProviders = useChatSettingsStore((s) => s.loadProviders);

  // Idempotent load on mount. Zustand actions are stable references, so the
  // effect deps array only ever runs once per popover instance. Guarding on
  // `providersLoaded` avoids a second fetch if the hook re-mounts (e.g. tab
  // switch) after the first load already succeeded.
  useEffect(() => {
    if (!providersLoaded) {
      void loadProviders();
    }
  }, [providersLoaded, loadProviders]);

  const current = getSettings(conversationId);
  const currentProviderId = current.providerId;
  // Capability flags drive per-control visibility below. The selector
  // returns {} when no provider resolves (empty list, or deleted id with no
  // claude-code seed yet), so every gated control safely hides until the
  // API load completes.
  const caps = getCapabilities(conversationId);

  // Resolve the trigger label from the live list. Unknown ids render as the
  // raw id so the user sees *something* real — matches the truthful-fallback
  // pattern in model-dropdown.tsx.
  const currentProvider = providers.find((p) => p.id === currentProviderId);
  const currentDisplay = currentProvider?.name ?? currentProviderId;

  // React Query client for peeking at cached model lists without triggering
  // a fetch. Used by the provider-change handler to compare the current
  // model against the new provider's catalog at click time — if the new
  // provider's models are already cached (common — the Settings page or a
  // previous open of this popover pre-warmed them), we can pick a compatible
  // model immediately. Uncached providers get the model cleared to empty;
  // model-dropdown.tsx auto-selects the first entry once its query resolves.
  const queryClient = useQueryClient();

  const handleProviderSelect = (provider: ProviderConfig) => {
    // Provider-change cascade (M11 version): unlike M10 — where we had a
    // static MODEL_CATALOGS map — we no longer have synchronous access to
    // every provider's model list. Two paths:
    //
    //   a) The new provider's models are already cached in React Query
    //      (same key useProviderModels uses). Pick the current model if
    //      it's in the cached list, else the first cached model.
    //   b) Not cached. Clear model to empty string; the model dropdown
    //      auto-selects the first available entry once its query resolves
    //      (see model-dropdown.tsx's selection-reset effect).
    //
    // Atomic merge: providerId + model in one write so the override never
    // lands half-configured. A fast re-render between two separate writes
    // could fire a POST with the old provider + new model (or vice versa).
    const cachedModels = queryClient.getQueryData<ProviderModel[]>([
      '/api/providers',
      provider.id,
      'models',
    ]);
    let nextModel = '';
    if (Array.isArray(cachedModels) && cachedModels.length > 0) {
      const keep = cachedModels.find((m) => m.id === current.model);
      nextModel = keep ? current.model : cachedModels[0].id;
    }
    updateSettings(conversationId, {
      providerId: provider.id,
      model: nextModel,
    });
  };

  // Empty-state copy: no providers configured after load completes. The
  // server auto-seeds claude-code + ollama on startup, so this should only
  // fire if /api/providers returned an empty array (misconfiguration) or
  // the fetch failed. Either way, the user's next step is the Settings page.
  const providersEmpty = providersLoaded && providers.length === 0;

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
                  disabled={providersEmpty}
                >
                  <span className="truncate">{currentDisplay}</span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[14rem]">
                {providersEmpty ? (
                  <div
                    className="px-2 py-1.5 text-xs text-muted-foreground"
                    data-testid="chat-settings-provider-empty"
                  >
                    No providers configured. Add one in Settings.
                  </div>
                ) : (
                  providers.map((provider) => (
                    <ProviderMenuItem
                      key={provider.id}
                      provider={provider}
                      isActive={provider.id === currentProviderId}
                      onSelect={() => handleProviderSelect(provider)}
                    />
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/*
            task005 controls — effort / thinking / web search / system prompt
            / attachments. Each control writes its field through
            updateSettings so state is per-conversation and the composer's
            POST body picks them up on submit (see chat-panel.tsx).
          */}

          {/* Effort selector ----------------------------------------------
              Gated on caps.effort — task007. Claude CLI (`--effort <level>`)
              accepts low / medium / high / xhigh / max; we surface only the
              three most common as a segmented control. */}
          {caps.effort && (
            <div
              className="space-y-1.5"
              data-testid="chat-settings-effort"
            >
              <label className="text-xs font-medium text-muted-foreground">
                Effort
              </label>
              <EffortSegmented
                value={current.effort ?? 'medium'}
                onChange={(level) =>
                  updateSettings(conversationId, { effort: level })
                }
              />
            </div>
          )}

          {/* Extended thinking toggle -------------------------------------
              Gated on caps.thinking — task007. No CLI flag today — this is
              store-only state, forwarded to the server but silently dropped
              at the runner boundary. */}
          {caps.thinking && (
            <label
              className="flex cursor-pointer items-center justify-between gap-3 rounded-md py-1"
              data-testid="chat-settings-thinking"
            >
              <span className="text-sm">Extended thinking</span>
              <input
                type="checkbox"
                checked={Boolean(current.thinking)}
                onChange={(e) =>
                  updateSettings(conversationId, { thinking: e.target.checked })
                }
                className="h-4 w-4 cursor-pointer rounded border-input text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </label>
          )}

          {/* Web search toggle --------------------------------------------
              Gated on caps.webSearch — task007. Same shape as Extended
              thinking — store-only, no CLI flag. */}
          {caps.webSearch && (
            <label
              className="flex cursor-pointer items-center justify-between gap-3 rounded-md py-1"
              data-testid="chat-settings-web-search"
            >
              <span className="text-sm">Web search</span>
              <input
                type="checkbox"
                checked={Boolean(current.webSearch)}
                onChange={(e) =>
                  updateSettings(conversationId, { webSearch: e.target.checked })
                }
                className="h-4 w-4 cursor-pointer rounded border-input text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </label>
          )}

          {/* Temperature slider -------------------------------------------
              Gated on caps.temperature — task007. OpenAI-compatible
              providers take a 0-2 sampling temperature; the Claude CLI does
              not, so the slider is hidden for Claude Code and visible for
              OpenAI-compatible providers that set the flag true. Uses a
              native <input type="range"> to keep the popover lightweight;
              shadcn's Slider primitive would drag in more radix state than
              we need here. */}
          {caps.temperature && (
            <div
              className="space-y-1.5"
              data-testid="chat-settings-temperature"
            >
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">
                  Temperature
                </label>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {(current.temperature ?? 1).toFixed(1)}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={current.temperature ?? 1}
                onChange={(e) =>
                  updateSettings(conversationId, {
                    temperature: parseFloat(e.target.value),
                  })
                }
                className="w-full cursor-pointer"
              />
            </div>
          )}

          {/* System prompt (collapsible) ----------------------------------
              Gated on caps.systemPrompt — task007. Hidden by default so the
              popover stays short at a glance; the textarea is the loudest
              control visually and most users won't touch it. */}
          {caps.systemPrompt && (
            <SystemPromptSection
              value={current.systemPrompt ?? ''}
              onChange={(next) =>
                updateSettings(conversationId, { systemPrompt: next })
              }
            />
          )}

          {/* File attachments ---------------------------------------------
              Gated on caps.fileAttachments — task007. Paths only — file
              contents are NOT uploaded. */}
          {caps.fileAttachments && (
            <AttachmentControl
              paths={current.attachments ?? []}
              onChange={(next) =>
                updateSettings(conversationId, { attachments: next })
              }
            />
          )}

          {/* Project context selector (task006) ---------------------------
              Gated on caps.projectContext — task007. When a project is
              selected, the server passes its path as `cwd` to the Claude
              CLI so the model sees that project's CLAUDE.md, git state,
              and file tree. */}
          {caps.projectContext && (
            <ProjectSelector
              value={current.projectPath}
              onChange={(next) =>
                updateSettings(conversationId, { projectPath: next })
              }
            />
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents (task005 + M11 task007)
//
// Extracted inline (same file) rather than living in their own modules
// because each one is a thin presentational wrapper around a primitive and
// only ever used by this popover. If a second consumer shows up, split
// them out — until then, fewer files is better than more.
// ---------------------------------------------------------------------------

/**
 * One row in the provider dropdown. Extracted as a component so we can call
 * the `useProviderModels` hook per-provider and flag providers whose model
 * endpoint returns empty/error as "(unavailable)". The hook's React Query
 * cache means repeated opens of the popover don't re-hit the endpoint for
 * every provider — hits go against the same 60s cache as the model dropdown.
 *
 * Why we need this at all: a provider with no reachable models (Ollama
 * stopped, misconfigured baseUrl) can still be *selected*, but the user
 * won't be able to pick a model afterwards. Calling it out in the list up
 * front prevents the confusing "I picked a provider but the model dropdown
 * is empty" loop.
 */
function ProviderMenuItem({
  provider,
  isActive,
  onSelect,
}: {
  provider: ProviderConfig;
  isActive: boolean;
  onSelect: () => void;
}) {
  // Peek at the cached model list; we don't want to block the item's render
  // on a network round-trip. If the cache is warm (previous popover open or
  // Settings page pre-warm) we show the "(unavailable)" hint; if not, the
  // hint stays off until the user opens the popover once — acceptable
  // tradeoff vs. firing N fetches every open.
  const queryClient = useQueryClient();
  const cached = queryClient.getQueryData<ProviderModel[]>([
    '/api/providers',
    provider.id,
    'models',
  ]);
  const isUnavailable = Array.isArray(cached) && cached.length === 0;

  return (
    <DropdownMenuItem
      data-testid={`chat-settings-provider-item-${provider.id}`}
      onSelect={onSelect}
    >
      <span className="flex-1 truncate">
        {provider.name}
        {isUnavailable && (
          <span className="ml-1 text-xs text-muted-foreground">
            (unavailable)
          </span>
        )}
      </span>
      {isActive && <Check className="ml-2 h-3.5 w-3.5" />}
    </DropdownMenuItem>
  );
}

/**
 * Three-button segmented selector for reasoning effort. Low / Medium / High
 * match the CLI's `--effort` values exactly; xhigh and max are intentionally
 * omitted from the UI (they're rarely useful for chat and the row already
 * fills the popover width).
 */
function EffortSegmented({
  value,
  onChange,
}: {
  value: string;
  onChange: (level: string) => void;
}) {
  const LEVELS: ReadonlyArray<{ id: string; label: string }> = [
    { id: 'low', label: 'Low' },
    { id: 'medium', label: 'Medium' },
    { id: 'high', label: 'High' },
  ];
  return (
    <div
      className="grid grid-cols-3 gap-1 rounded-md border border-input bg-background p-0.5"
      role="radiogroup"
      aria-label="Reasoning effort"
    >
      {LEVELS.map((lvl) => {
        const active = value === lvl.id;
        return (
          <button
            key={lvl.id}
            type="button"
            role="radio"
            aria-checked={active}
            data-testid={`chat-settings-effort-${lvl.id}`}
            onClick={() => onChange(lvl.id)}
            className={
              'rounded-sm px-2 py-1 text-xs font-medium transition-colors ' +
              (active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground')
            }
          >
            {lvl.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Collapsible "System prompt" section. Hidden by default — the header
 * toggles visibility of the textarea. We keep the open/closed state local
 * to this component because it's pure UX chrome; the textarea's *value*
 * lives in the settings store and survives remount.
 */
function SystemPromptSection({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-testid="chat-settings-system-prompt-toggle"
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-md px-1 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <span>System prompt</span>
        {open ? (
          <ChevronDown className="h-3 w-3 opacity-60" />
        ) : (
          <ChevronRight className="h-3 w-3 opacity-60" />
        )}
      </button>
      {open && (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          data-testid="chat-settings-system-prompt"
          placeholder="Custom instructions for this conversation..."
          rows={3}
          className="w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      )}
    </div>
  );
}

/**
 * Project context selector. "General" (no cwd) is always first; the rest of
 * the list comes from `GET /api/projects` — the same scanner-discovered
 * endpoint that powers the Library project page. We reuse it deliberately
 * instead of adding a new endpoint: the composer's definition of "a
 * project the user might want to chat about" is identical to the scanner's
 * definition of a project entity.
 *
 * React Query handles caching — other consumers (`useProjects` in
 * `hooks/use-projects.ts`) share the same cache key, so opening the popover
 * a second time hits the cache rather than the network.
 */
interface ProjectListItem {
  id: string;
  name: string;
  path: string;
}

function ProjectSelector({
  value,
  onChange,
}: {
  /** Currently selected project path; undefined means "General". */
  value: string | undefined;
  /** Called with the new path, or undefined to clear back to "General". */
  onChange: (next: string | undefined) => void;
}) {
  // Shared cache key with `useProjects()` so we don't duplicate the fetch.
  const { data } = useQuery<ProjectListItem[]>({
    queryKey: ['/api/projects'],
  });
  const projects = Array.isArray(data) ? data : [];

  // Resolve the label for the current selection. Falling back to the raw
  // path (rather than a misleading default) mirrors displayNameFor() in the
  // provider selector — an unrecognized path still renders truthfully.
  const currentLabel = (() => {
    if (!value) return 'General';
    const match = projects.find((p) => p.path === value);
    return match ? match.name : value;
  })();

  return (
    <div
      className="space-y-1.5"
      data-testid="chat-settings-project"
    >
      <label className="text-xs font-medium text-muted-foreground">
        Project context
      </label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-between"
            aria-label={`Project context: ${currentLabel}`}
          >
            <span className="truncate">{currentLabel}</span>
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[14rem] max-h-[40vh] overflow-y-auto">
          {/* "General" — no cwd. Always first so it's the obvious default. */}
          <DropdownMenuItem
            data-testid="chat-settings-project-item-general"
            onSelect={() => onChange(undefined)}
          >
            <span className="flex-1">General</span>
            {!value && <Check className="ml-2 h-3.5 w-3.5" />}
          </DropdownMenuItem>
          {projects.map((p) => {
            const isActive = p.path === value;
            return (
              <DropdownMenuItem
                key={p.id}
                data-testid={`chat-settings-project-item-${p.id}`}
                onSelect={() => onChange(p.path)}
              >
                <span className="flex-1 truncate" title={p.path}>
                  {p.name}
                </span>
                {isActive && <Check className="ml-2 h-3.5 w-3.5" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * File attachment control. An "Attach file" button triggers a hidden
 * <input type="file" multiple>; the list of selected paths renders below
 * with per-item X buttons. We use `file.name` as the path because browser
 * security prevents us from seeing the full host path; for pass-through
 * to the CLI (a future enhancement) this will need the picker to be
 * backed by a server-side file browser.
 */
function AttachmentControl({
  paths,
  onChange,
}: {
  paths: string[];
  onChange: (next: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const added: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files.item(i);
      if (f && !paths.includes(f.name)) added.push(f.name);
    }
    if (added.length > 0) onChange([...paths, ...added]);
    // Reset the native input so re-selecting the same file triggers change.
    if (inputRef.current) inputRef.current.value = '';
  };

  const removeAt = (idx: number) => {
    const next = paths.filter((_, i) => i !== idx);
    onChange(next);
  };

  return (
    <div className="space-y-1.5" data-testid="chat-settings-attachments">
      <label className="text-xs font-medium text-muted-foreground">
        Attachments
      </label>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full justify-start"
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip className="mr-2 h-3.5 w-3.5" />
        Attach file
      </Button>
      <input
        ref={inputRef}
        type="file"
        multiple
        onChange={handleFiles}
        className="hidden"
        data-testid="chat-settings-attachments-input"
      />
      {paths.length > 0 && (
        <ul className="space-y-1">
          {paths.map((p, idx) => (
            <li
              key={`${p}-${idx}`}
              className="flex items-center justify-between gap-2 rounded-md bg-muted px-2 py-1 text-xs"
            >
              <span className="truncate" title={p}>
                {p}
              </span>
              <button
                type="button"
                onClick={() => removeAt(idx)}
                aria-label={`Remove ${p}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

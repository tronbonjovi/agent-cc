// client/src/components/chat/settings-popover.tsx
//
// Composer settings popover — chat-composer-controls task004 (shell) +
// task005 (controls) + task006 (project selector) + task007 (capability
// gating & temperature slider).
//
// The + button in the composer opens this popover. It's the container for
// per-conversation settings. Ownership layers:
//
//   1. The Popover shell (shadcn Popover / PopoverTrigger / PopoverContent).
//   2. The + button, which lives inside PopoverTrigger and carries the
//      `data-testid="chat-composer-plus"` mount that task002 set up.
//   3. The provider selector — first control in the popover. Enumerates
//      BUILTIN_PROVIDERS from the registry module so the capability system
//      and the model dropdown stay in lock-step.
//   4. Capability-gated controls — each control renders only if the active
//      provider's capability flag for it is true. Switching providers
//      updates `caps` through the store selector and the controls show/hide
//      automatically. See `builtin-providers.ts` for the capability source
//      of truth.
//   5. Provider-change cascade — when the user picks a different provider,
//      if the current model isn't in that provider's catalog we reset to
//      the provider's default. Atomic `updateSettings({ providerId, model })`
//      avoids a half-configured override leaking into a POST.

import { useRef, useState, type ChangeEvent } from 'react';
import { Plus, ChevronDown, ChevronRight, Check, Paperclip, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
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
import {
  BUILTIN_PROVIDERS,
  defaultModelFor,
  isModelInCatalog,
} from '@/stores/builtin-providers';
import type { ProviderConfig } from '../../../../shared/types';

/** Resolve a provider id to its human-readable name. */
function displayNameFor(providerId: string): string {
  const entry = BUILTIN_PROVIDERS.find((p) => p.id === providerId);
  // Fall through to the raw id for unknown values — matches the pattern in
  // model-dropdown.tsx, where unfamiliar ids render as-is rather than a
  // misleading default.
  return entry ? entry.name : providerId;
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
  const getCapabilities = useChatSettingsStore((s) => s.getCapabilities);
  const current = getSettings(conversationId);
  const currentProviderId = current.providerId;
  const currentDisplay = displayNameFor(currentProviderId);
  // Capability flags drive per-control visibility below. Reading through
  // the store selector (not directly from BUILTIN_PROVIDERS) means a future
  // "custom provider" that the user added via M11's CRUD flows will light
  // up automatically — the store already knows how to resolve it.
  const caps = getCapabilities(conversationId);

  const handleProviderSelect = (provider: ProviderConfig) => {
    // Provider-change cascade: if the current model is still valid for the
    // new provider's catalog, keep it. Otherwise reset to the new
    // provider's default. When the new provider has no catalog at all,
    // defaultModelFor returns undefined — in that case we clear to an
    // empty string so the composer visibly shows "no model" rather than
    // silently re-using an incompatible id.
    const keepModel = isModelInCatalog(provider.id, current.model);
    const nextModel = keepModel
      ? current.model
      : (defaultModelFor(provider.id) ?? '');
    // Atomic merge: providerId + model in one write so the override never
    // lands in a half-configured state. If we split this into two writes,
    // a fast re-render between them could fire a POST with the old
    // provider + new model (or vice versa).
    updateSettings(conversationId, {
      providerId: provider.id,
      model: nextModel,
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
                {BUILTIN_PROVIDERS.map((provider) => {
                  const isActive = provider.id === currentProviderId;
                  return (
                    <DropdownMenuItem
                      key={provider.id}
                      data-testid={`chat-settings-provider-item-${provider.id}`}
                      onSelect={() => handleProviderSelect(provider)}
                    >
                      <span className="flex-1">{provider.name}</span>
                      {isActive && <Check className="ml-2 h-3.5 w-3.5" />}
                    </DropdownMenuItem>
                  );
                })}
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

// Back-compat re-export: task004 exposed `availableProviders` as a
// source-text anchor. task007 moved the catalog into builtin-providers.ts;
// we re-export the same list under the old name so any consumer / test
// still resolves a valid reference.
export const availableProviders = BUILTIN_PROVIDERS;

// ---------------------------------------------------------------------------
// Subcomponents (task005)
//
// Extracted inline (same file) rather than living in their own modules
// because each one is a thin presentational wrapper around a primitive and
// only ever used by this popover. If a second consumer shows up, split
// them out — until then, fewer files is better than more.
// ---------------------------------------------------------------------------

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

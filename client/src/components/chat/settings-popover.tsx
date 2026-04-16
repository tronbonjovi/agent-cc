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
            task005 controls — effort / thinking / web search / system prompt
            / attachments. Each control writes its field through
            updateSettings so state is per-conversation and the composer's
            POST body picks them up on submit (see chat-panel.tsx).
          */}

          {/* Effort selector ----------------------------------------------
              Claude CLI (`--effort <level>`) accepts low / medium / high /
              xhigh / max; we surface only the three most common. Rendered
              as a three-button segmented control so the visible-choices
              pattern reads faster than a dropdown at this scale. */}
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

          {/* Extended thinking toggle -------------------------------------
              No CLI flag today — this is store-only state, forwarded to the
              server but silently dropped at the runner boundary. The toggle
              still exists because we want the UX in place for the capability
              system (future milestone) to light up when provider plumbing
              lands. */}
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

          {/* Web search toggle --------------------------------------------
              Same shape as Extended thinking — store-only, no CLI flag. */}
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

          {/* System prompt (collapsible) ----------------------------------
              Hidden by default so the popover stays short at a glance; the
              textarea is the loudest control visually and most users won't
              touch it on most conversations. Click the header to expand. */}
          <SystemPromptSection
            value={current.systemPrompt ?? ''}
            onChange={(next) =>
              updateSettings(conversationId, { systemPrompt: next })
            }
          />

          {/* File attachments ---------------------------------------------
              Paths only — file contents are NOT uploaded. Full context
              injection is deferred until we decide how to fit attachments
              inside the provider's token budget. Each selected file's path
              is stored on the conversation's override so subsequent prompts
              can decide what to do with them. */}
          <AttachmentControl
            paths={current.attachments ?? []}
            onChange={(next) =>
              updateSettings(conversationId, { attachments: next })
            }
          />

          {/* Project context selector (task006) ---------------------------
              When a project is selected, the server passes its path as
              `cwd` to the Claude CLI so the model sees that project's
              CLAUDE.md, git state, and file tree. "General" (the default)
              leaves `cwd` unset so the CLI uses the server process's cwd. */}
          <ProjectSelector
            value={current.projectPath}
            onChange={(next) =>
              updateSettings(conversationId, { projectPath: next })
            }
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Exported so source-text guardrail tests can inspect the catalog shape and
// future tests / a global defaults UI can enumerate providers without
// duplicating the list.
export const availableProviders = AVAILABLE_PROVIDERS;

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

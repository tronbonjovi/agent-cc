// client/src/components/chat/model-dropdown.tsx
//
// Composer model selector — chat-composer-controls task003.
//
// Shows the currently-selected model as a pill in the composer's left zone
// and lets the user switch models via a shadcn DropdownMenu. Selection is
// recorded on the per-conversation override in `useChatSettingsStore`; the
// next POST to `/api/chat/prompt` reads that value and forwards it to the
// CLI via `--model <id>`.
//
// Model list intentionally hard-codes real Claude Code model IDs rather
// than exposing preset labels like "Fast / Balanced / Smart" — per
// `feedback_no_model_abstraction`, the user strictly wants real names
// shown. The display name is what humans see in the menu; the id is what
// the CLI receives on the wire.
//
// When the user hasn't picked a model yet, `getSettings(id).model` falls
// through to the global default (`claude-sonnet-4-6` in the server-side
// `defaultChatDefaults`). If the resolved id isn't in our local list
// (e.g. the user set a custom id via a future settings UI), we show it
// raw so they're not misled into thinking nothing is selected.

import { ChevronDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { useChatSettingsStore } from '@/stores/chat-settings-store';

// ---------------------------------------------------------------------------
// Model catalog
//
// Kept as a plain `const` array so the list is trivially testable from
// the source-text guardrail tests and so adding a model is a one-line diff.
// Display names use the short "Claude Opus 4.6" form the user sees on
// claude.ai; ids are the wire-level strings accepted by `claude --model`.
// ---------------------------------------------------------------------------
interface ModelEntry {
  id: string;
  displayName: string;
}

const CLAUDE_CODE_MODELS: ReadonlyArray<ModelEntry> = [
  { id: 'claude-opus-4-6', displayName: 'Claude Opus 4.6' },
  { id: 'claude-sonnet-4-6', displayName: 'Claude Sonnet 4.6' },
  { id: 'claude-haiku-4-5-20251001', displayName: 'Claude Haiku 4.5' },
];

/** Resolve a model id to its human-readable display name. */
function displayNameFor(modelId: string): string {
  const entry = CLAUDE_CODE_MODELS.find((m) => m.id === modelId);
  // Fall through to the raw id for unknown values so the user sees
  // *something* real rather than a misleading default.
  return entry ? entry.displayName : modelId;
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
  // Subscribe to the whole store so model changes on the active tab trigger
  // a re-render of the trigger label. `getSettings` is a pure merge of
  // globalDefaults + overrides — cheap to call on every render.
  const getSettings = useChatSettingsStore((s) => s.getSettings);
  const updateSettings = useChatSettingsStore((s) => s.updateSettings);
  const currentModel = getSettings(conversationId).model;
  const currentDisplay = displayNameFor(currentModel);

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
        {CLAUDE_CODE_MODELS.map((m) => {
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
              <span className="flex-1">{m.displayName}</span>
              {isActive && <Check className="ml-2 h-3.5 w-3.5" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Exported so the source-text guardrails can poke at the catalog shape and
// future tests (or a global defaults UI) can enumerate the available models
// without duplicating the list.
export const claudeCodeModels = CLAUDE_CODE_MODELS;

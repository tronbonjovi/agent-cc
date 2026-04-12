// client/src/components/analytics/messages/FilterBar.tsx
//
// Messages tab — filter pill bar (messages-redesign task005).
//
// Renders six toggle pills + three mode preset buttons that drive the
// FilterState consumed by ConversationViewer. The pill grouping is
// intentionally lossy (Conversation = userText + assistantText, Tools =
// toolCalls + toolResults, System = systemEvents + skillInvocations) so
// the reader sees a small number of meaningful labels rather than seven
// type names. The two cross-cutting pills (Sidechains, Errors Only)
// bind to the optional `sidechains` / `errorsOnly` keys added to
// FilterState in task005.
//
// Design constraints (per project safety rules):
//   - solid Tailwind palette colors only — no gradients, no text gradients
//   - no bounce / scale animations on click
//   - presets are quick-set buttons, not toggles — clicking a preset
//     replaces the entire FilterState
//
// The pure helpers (applyPreset, togglePillGroup, isPillActive) are
// exported so tests can drive them without a DOM. Matches the convention
// used by ConversationViewer / SessionSidebar.

import { useCallback } from "react";
import {
  MessagesSquare,
  Brain,
  Wrench,
  Settings,
  Workflow,
  AlertOctagon,
} from "lucide-react";
import type { FilterState } from "./ConversationViewer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Stable identifier for one of the six logical filter pills. */
export type FilterPill =
  | "conversation"
  | "thinking"
  | "tools"
  | "system"
  | "sidechains"
  | "errorsOnly";

/** Stable identifier for one of the three quick-set mode presets. */
export type FilterPreset = "conversation" | "full" | "errors";

// ---------------------------------------------------------------------------
// Pure helpers — exported for tests
// ---------------------------------------------------------------------------

/**
 * Build a fresh FilterState for a quick-set preset. Each preset is a
 * full replacement (the user clicks one button, the state is rewritten).
 *
 * - `conversation`: user + assistant text only, sidechains visible.
 *   The default first-load mode for "I just want to read the conversation."
 * - `full`: every per-type toggle on, sidechains visible, errorsOnly off.
 *   Forensic view — see absolutely everything.
 * - `errors`: errorsOnly mode. The viewer hides every message that isn't
 *   an errored tool_result. We also flip toolResults on so the underlying
 *   per-type gate doesn't double-hide the very thing we're trying to see.
 */
export function applyPreset(preset: FilterPreset): FilterState {
  switch (preset) {
    case "conversation":
      return {
        userText: true,
        assistantText: true,
        thinking: false,
        toolCalls: false,
        toolResults: false,
        systemEvents: false,
        skillInvocations: false,
        sidechains: true,
        errorsOnly: false,
      };
    case "full":
      return {
        userText: true,
        assistantText: true,
        thinking: true,
        toolCalls: true,
        toolResults: true,
        systemEvents: true,
        skillInvocations: true,
        sidechains: true,
        errorsOnly: false,
      };
    case "errors":
      return {
        userText: true,
        assistantText: true,
        thinking: false,
        toolCalls: false,
        // toolResults must be ON or the per-type gate hides every error.
        toolResults: true,
        systemEvents: false,
        skillInvocations: false,
        sidechains: true,
        errorsOnly: true,
      };
  }
}

/**
 * Flip a single pill (which may map to one or more FilterState fields)
 * and return a new FilterState. Compound pills toggle their constituents
 * together — if any constituent is currently visible we turn the whole
 * group off, otherwise we turn the whole group on.
 *
 * Toggling never changes orthogonal fields, so flipping `tools` won't
 * touch `userText`, `errorsOnly`, etc.
 */
export function togglePillGroup(
  filters: FilterState,
  pill: FilterPill,
): FilterState {
  const next = { ...filters };
  switch (pill) {
    case "conversation": {
      const on = isPillActive(filters, "conversation");
      next.userText = !on;
      next.assistantText = !on;
      return next;
    }
    case "thinking": {
      next.thinking = !filters.thinking;
      return next;
    }
    case "tools": {
      const on = isPillActive(filters, "tools");
      next.toolCalls = !on;
      next.toolResults = !on;
      return next;
    }
    case "system": {
      const on = isPillActive(filters, "system");
      next.systemEvents = !on;
      next.skillInvocations = !on;
      return next;
    }
    case "sidechains": {
      // Default (`undefined`) is treated as ON so the legacy 7-key
      // FilterState literals stay backward compatible.
      const on = filters.sidechains !== false;
      next.sidechains = !on;
      return next;
    }
    case "errorsOnly": {
      next.errorsOnly = !filters.errorsOnly;
      return next;
    }
  }
}

/**
 * True if a pill should render in its active style.
 *
 * Compound pills are considered ACTIVE when ANY constituent field is
 * visible — this matches the reader's mental model ("I can see at least
 * one tool message, so the Tools pill is on"). Single-key pills mirror
 * their key directly. The cross-cutting pills (sidechains/errorsOnly)
 * read their dedicated optional flag.
 */
export function isPillActive(filters: FilterState, pill: FilterPill): boolean {
  switch (pill) {
    case "conversation":
      return filters.userText || filters.assistantText;
    case "thinking":
      return filters.thinking;
    case "tools":
      return filters.toolCalls || filters.toolResults;
    case "system":
      return filters.systemEvents || filters.skillInvocations;
    case "sidechains":
      return filters.sidechains !== false;
    case "errorsOnly":
      return filters.errorsOnly === true;
  }
}

// ---------------------------------------------------------------------------
// Pill metadata table — colors and labels live here so the JSX stays small
// and the test guardrails can match against the same source of truth.
// ---------------------------------------------------------------------------

interface PillMeta {
  id: FilterPill;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  /** Solid Tailwind color used for the active pill background + text. */
  activeBg: string;
  /** Hover affordance for the inactive pill — subtle, no scale, no bounce. */
  inactiveHover: string;
  /** Title attribute for accessibility / hover tooltip. */
  title: string;
}

const PILLS: ReadonlyArray<PillMeta> = [
  {
    id: "conversation",
    label: "Conversation",
    Icon: MessagesSquare,
    activeBg: "bg-blue-500 text-white border-blue-500",
    inactiveHover: "hover:bg-blue-500/10 hover:text-blue-400 hover:border-blue-500/40",
    title: "User and assistant text",
  },
  {
    id: "thinking",
    label: "Thinking",
    Icon: Brain,
    activeBg: "bg-purple-500 text-white border-purple-500",
    inactiveHover: "hover:bg-purple-500/10 hover:text-purple-400 hover:border-purple-500/40",
    title: "Assistant reasoning blocks",
  },
  {
    id: "tools",
    label: "Tools",
    Icon: Wrench,
    activeBg: "bg-emerald-500 text-white border-emerald-500",
    inactiveHover: "hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/40",
    title: "Tool calls and tool results",
  },
  {
    id: "system",
    label: "System",
    Icon: Settings,
    activeBg: "bg-amber-500 text-white border-amber-500",
    inactiveHover: "hover:bg-amber-500/10 hover:text-amber-400 hover:border-amber-500/40",
    title: "System events and slash command invocations",
  },
  {
    id: "sidechains",
    label: "Sidechains",
    Icon: Workflow,
    activeBg: "bg-cyan-500 text-white border-cyan-500",
    inactiveHover: "hover:bg-cyan-500/10 hover:text-cyan-400 hover:border-cyan-500/40",
    title: "Subagent runs",
  },
  {
    id: "errorsOnly",
    label: "Errors Only",
    Icon: AlertOctagon,
    activeBg: "bg-red-500 text-white border-red-500",
    inactiveHover: "hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/40",
    title: "Show only tool results that errored",
  },
];

const PRESETS: ReadonlyArray<{ id: FilterPreset; label: string; title: string }> = [
  {
    id: "conversation",
    label: "Conversation",
    title: "Show user + assistant text only (default)",
  },
  {
    id: "full",
    label: "Full",
    title: "Show every message type (forensic view)",
  },
  {
    id: "errors",
    label: "Errors",
    title: "Show only errored tool results (debugging view)",
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface FilterBarProps {
  filters: FilterState;
  onFiltersChange: (next: FilterState) => void;
}

/**
 * Filter pill bar for the Messages tab. Stateless — owns no React state of
 * its own; the parent (MessagesTab) holds the FilterState and re-renders
 * us when it changes.
 */
export function FilterBar({ filters, onFiltersChange }: FilterBarProps) {
  const togglePill = useCallback(
    (pill: FilterPill) => {
      onFiltersChange(togglePillGroup(filters, pill));
    },
    [filters, onFiltersChange],
  );

  const setPreset = useCallback(
    (preset: FilterPreset) => {
      onFiltersChange(applyPreset(preset));
    },
    [onFiltersChange],
  );

  return (
    <div
      className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border/40 bg-background"
      data-testid="messages-filter-bar"
      role="toolbar"
      aria-label="Message filter bar"
    >
      {/* Pill row — six toggleable filters */}
      <div className="flex flex-wrap items-center gap-1.5">
        {PILLS.map((pill) => {
          const active = isPillActive(filters, pill.id);
          return (
            <button
              key={pill.id}
              type="button"
              onClick={() => togglePill(pill.id)}
              data-pill={pill.id}
              data-active={active}
              aria-pressed={active}
              title={pill.title}
              className={[
                "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full",
                "text-[11px] font-medium border transition-colors",
                active
                  ? pill.activeBg
                  : `border-border/50 text-muted-foreground bg-background ${pill.inactiveHover}`,
              ].join(" ")}
            >
              <pill.Icon className="h-3 w-3" />
              {pill.label}
            </button>
          );
        })}
      </div>

      {/* Vertical divider between pills and presets */}
      <div className="h-5 w-px bg-border/40 mx-1" aria-hidden="true" />

      {/* Preset row — three quick-set buttons */}
      <div
        className="flex items-center gap-1"
        role="group"
        aria-label="Filter presets"
      >
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mr-1">
          Mode
        </span>
        {PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => setPreset(preset.id)}
            data-preset={preset.id}
            title={preset.title}
            className={[
              "inline-flex items-center h-7 px-2.5 rounded-md",
              "text-[11px] font-medium border border-border/40 bg-background",
              "text-muted-foreground hover:text-foreground hover:bg-muted/40",
              "transition-colors",
            ].join(" ")}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}

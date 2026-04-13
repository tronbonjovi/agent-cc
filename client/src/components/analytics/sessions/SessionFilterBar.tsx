// client/src/components/analytics/sessions/SessionFilterBar.tsx
//
// Filter pill bar for the Sessions tab detail panel. Mirrors the Messages
// tab FilterBar pattern (see messages/FilterBar.tsx) but operates at the
// section level: each pill toggles whether a section renders, and presets
// are quick combinations of pills. Presets visually activate the pills
// they contain — picking `deep-dive` lights up every pill, and the user
// can then click an individual pill to toggle it off without leaving the
// preset visually selected (the pills retain whatever combination the
// user lands on).
//
// The pure helpers (applySessionPreset, toggleSessionPill, isSessionPillActive)
// are exported so tests can drive them without a DOM. Matches the
// convention used by messages/FilterBar.tsx.

import { useCallback } from "react";
import {
  LayoutDashboard,
  Wrench,
  Hash,
  Link2,
  AlertOctagon,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SessionFilterPill =
  | "overview"
  | "tools"
  | "tokens"
  | "linkedTask"
  | "errorsOnly";

export type SessionFilterPreset = "default" | "deep-dive" | "errors";

export interface SessionFilterBarState {
  overview: boolean;
  tools: boolean;
  tokens: boolean;
  linkedTask: boolean;
  /** Cross-cutting modifier — when on, the Tools section filters to errors. */
  errorsOnly: boolean;
}

// ---------------------------------------------------------------------------
// Pure helpers — exported for tests
// ---------------------------------------------------------------------------

export function applySessionPreset(preset: SessionFilterPreset): SessionFilterBarState {
  switch (preset) {
    case "default":
      return { overview: true, tools: true, tokens: true, linkedTask: true, errorsOnly: false };
    case "deep-dive":
      return { overview: true, tools: true, tokens: true, linkedTask: true, errorsOnly: false };
    case "errors":
      return { overview: true, tools: true, tokens: false, linkedTask: false, errorsOnly: true };
  }
}

export function toggleSessionPill(
  state: SessionFilterBarState,
  pill: SessionFilterPill,
): SessionFilterBarState {
  return { ...state, [pill]: !state[pill] };
}

export function isSessionPillActive(
  state: SessionFilterBarState,
  pill: SessionFilterPill,
): boolean {
  return state[pill];
}

// ---------------------------------------------------------------------------
// Pill metadata
// ---------------------------------------------------------------------------

interface PillMeta {
  id: SessionFilterPill;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  activeBg: string;
  inactiveHover: string;
  title: string;
}

const PILLS: ReadonlyArray<PillMeta> = [
  {
    id: "overview", label: "Overview", Icon: LayoutDashboard,
    activeBg: "bg-blue-500 text-white border-blue-500",
    inactiveHover: "hover:bg-blue-500/10 hover:text-blue-400 hover:border-blue-500/40",
    title: "Session metric grid + models + subagents",
  },
  {
    id: "tools", label: "Tools", Icon: Wrench,
    activeBg: "bg-emerald-500 text-white border-emerald-500",
    inactiveHover: "hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/40",
    title: "Tool execution timeline grouped by subagent",
  },
  {
    id: "tokens", label: "Tokens", Icon: Hash,
    activeBg: "bg-amber-500 text-white border-amber-500",
    inactiveHover: "hover:bg-amber-500/10 hover:text-amber-400 hover:border-amber-500/40",
    title: "Per-turn token growth table",
  },
  {
    id: "linkedTask", label: "Linked Task", Icon: Link2,
    activeBg: "bg-violet-500 text-white border-violet-500",
    inactiveHover: "hover:bg-violet-500/10 hover:text-violet-400 hover:border-violet-500/40",
    title: "Workflow task linkage (when present)",
  },
  {
    id: "errorsOnly", label: "Errors Only", Icon: AlertOctagon,
    activeBg: "bg-red-500 text-white border-red-500",
    inactiveHover: "hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/40",
    title: "Filter Tools section to errored tool results only",
  },
];

const PRESETS: ReadonlyArray<{ id: SessionFilterPreset; label: string; title: string }> = [
  { id: "default",   label: "Default",   title: "Overview + Tools + Tokens + Linked Task" },
  { id: "deep-dive", label: "Deep-dive", title: "Show every section" },
  { id: "errors",    label: "Errors",    title: "Overview + Tools, errored results only" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface SessionFilterBarProps {
  state: SessionFilterBarState;
  onChange: (next: SessionFilterBarState) => void;
}

export function SessionFilterBar({ state, onChange }: SessionFilterBarProps) {
  const togglePill = useCallback(
    (pill: SessionFilterPill) => {
      onChange(toggleSessionPill(state, pill));
    },
    [state, onChange],
  );

  const setPreset = useCallback(
    (preset: SessionFilterPreset) => {
      onChange(applySessionPreset(preset));
    },
    [onChange],
  );

  return (
    <div
      className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border/40 bg-background"
      data-testid="session-filter-bar"
      role="toolbar"
      aria-label="Session detail filter bar"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {PILLS.map((pill) => {
          const active = isSessionPillActive(state, pill.id);
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

      <div className="h-5 w-px bg-border/40 mx-1" aria-hidden="true" />

      <div className="flex items-center gap-1" role="group" aria-label="Filter presets">
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

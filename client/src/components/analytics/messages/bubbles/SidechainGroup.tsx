// client/src/components/analytics/messages/bubbles/SidechainGroup.tsx
//
// Wrapper that groups a run of timeline messages belonging to a single
// subagent into one collapsible block. The grouping *decision* — i.e.
// deciding which messages belong to which subagent — happens upstream in
// task004's ConversationViewer, which scans the timeline and calls
// SidechainGroup with a pre-built `children` array. This component is
// strictly presentational: header + collapsible body + recursive render.
//
// Label priority:
//   1. If `subagentContext` is present (tree enrichment succeeded):
//        "<agentType> — <description> (N messages)"
//      — gives the reader a real name for the subagent instead of a
//        generic placeholder.
//   2. If `subagentContext` is null (no tree, or message not under a
//      subagent-root): fall back to "Sidechain (N messages)".
//
// Color:
//   - Comes from `subagent-colors.ts`'s palette, hashed by `agentId` so
//     the same subagent gets the same color everywhere (this component,
//     ToolTimeline, SessionOverview, TokenBreakdown, ...). When there
//     is no agentId, we use a neutral muted stripe.
//   - The palette entries include both a background tint and a border
//     token; combined with `border-l-2` we get a left-edge stripe in
//     the subagent's color plus a faint body tint. That's the visual
//     cue that says "this is a grouped subagent run, not a normal
//     assistant reply".
//
// Children rendering:
//   - Recursively calls `renderMessage` from `./dispatcher` on each
//     child, tracking `previousModel` across assistant turns so the
//     model-change badge only fires on actual switches within the
//     group.
//   - Imports directly from `./dispatcher` (not the barrel) so the
//     barrel's re-export of SidechainGroup doesn't form an import cycle.

import { Fragment, useState } from "react";
import { ChevronRight, Users } from "lucide-react";
import type { TimelineMessage, TimelineSubagentContext } from "@shared/session-types";
import {
  colorClassForOwner,
  type ToolOwner,
} from "../../sessions/subagent-colors";
import { renderMessage } from "./dispatcher";

export interface SidechainGroupProps {
  /**
   * Enriched subagent context for this group. Null when the tree was
   * unavailable (or the group was formed by `isSidechain` heuristic
   * alone) — the fallback label handles that case.
   */
  subagentContext: TimelineSubagentContext | null;
  /** Messages that belong to this subagent run, in timeline order. */
  children: TimelineMessage[];
}

/**
 * A subagent's grouped timeline messages, rendered as a collapsible
 * wrapper with a header labeling the subagent and a body that recursively
 * dispatches each child message.
 */
export function SidechainGroup({ subagentContext, children }: SidechainGroupProps) {
  // Default expanded so the subagent's work is visible on first read; the
  // user can collapse if they want to skim the parent conversation.
  const [expanded, setExpanded] = useState(true);

  const count = children.length;

  // Build header label. agentType + description when available, else
  // generic sidechain label. Both branches tell the reader how many
  // messages are inside so a collapsed group still carries information.
  const header = subagentContext
    ? `${subagentContext.agentType}${
        subagentContext.description ? ` — ${subagentContext.description}` : ""
      } (${count} messages)`
    : `Sidechain (${count} messages)`;

  // Resolve color via the shared subagent palette. Guard on a truthy
  // `agentId` — an empty-string agentId is type-legal but would make
  // `colorClassForOwner` return "", which would fall through to the
  // neutral stripe while the header still shows the rich agentType +
  // description label (label/color mismatch). Falling back to
  // `session-root` in that case keeps the visual consistent with the
  // "no context" fallback path.
  const owner: ToolOwner = subagentContext?.agentId
    ? { kind: "subagent-root", agentId: subagentContext.agentId }
    : { kind: "session-root", agentId: null };
  const paletteClass = colorClassForOwner(owner);
  // Fallback stripe when we didn't get a palette class (no agentId).
  const stripeClass = paletteClass || "bg-muted/10 border-muted-foreground/30";

  // Track previousModel across assistant turns within the group so that
  // AssistantBlock's model-change badge fires only on actual switches.
  let previousModel: string | undefined;

  return (
    <div
      data-message-type="sidechain_group"
      data-agent-id={subagentContext?.agentId ?? ""}
      className={`pl-3 py-2 my-1 border-l-2 rounded-r ${stripeClass}`}
    >
      {/* Header row — click to toggle expansion. */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left text-xs text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={expanded}
      >
        <ChevronRight
          className={`h-3 w-3 shrink-0 transition-transform ${
            expanded ? "rotate-90" : ""
          }`}
          aria-hidden="true"
        />
        <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate font-medium">{header}</span>
      </button>

      {/* Body — recursively render each child. previousModel threads
          across assistant_text turns so the model badge is accurate
          within the group. */}
      {expanded && (
        <div className="mt-2 ml-4 flex flex-col gap-2">
          {children.map((msg, idx) => {
            const node = renderMessage(msg, { previousModel });
            if (msg.type === "assistant_text") {
              previousModel = msg.model;
            }
            // Key by uuid when present; SystemEvent / SkillInvocation
            // variants have no uuid, so fall back to the index.
            const key =
              "uuid" in msg && typeof msg.uuid === "string"
                ? msg.uuid
                : `sidechain-${idx}`;
            return <Fragment key={key}>{node}</Fragment>;
          })}
        </div>
      )}
    </div>
  );
}

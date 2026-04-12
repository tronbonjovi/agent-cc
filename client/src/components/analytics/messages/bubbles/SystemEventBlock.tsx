// client/src/components/analytics/messages/bubbles/SystemEventBlock.tsx
//
// Inline annotation for system-level events inside the Messages tab timeline.
// These are things like permission changes, hook summaries, turn-duration
// markers, and bridge/queue lifecycle — stuff the user should notice is
// *happening* but doesn't want to read as a full conversation bubble.
//
// Visual design: muted gray, smaller font, icon + one-line summary. Sits
// inline between real bubbles, never takes more than a single line. No
// local state, no expand — if a system event is complex enough to need
// those, it belongs in a dedicated renderer, not here.

import {
  Activity,
  AlertCircle,
  Clock,
  Info,
  Link2,
  ShieldCheck,
  Zap,
} from "lucide-react";
import type { SystemEventMessage } from "@shared/session-types";

/**
 * Maps a SystemEventMessage subtype to the lucide icon that best represents
 * it. The subtype string comes directly from the JSONL parser (e.g.
 * `turn_duration`, `stop_hook_summary`, `permission-change`, `bridge`,
 * `queue-enqueue`). Unknown subtypes fall back to a neutral Info icon so a
 * newly-introduced parser event never renders as a blank row.
 */
function iconForSubtype(subtype: string) {
  const s = subtype.toLowerCase();
  if (s.includes("turn") || s.includes("duration")) return Clock;
  if (s.includes("hook")) return Zap;
  if (s.includes("permission")) return ShieldCheck;
  if (s.includes("bridge")) return Link2;
  if (s.includes("queue") || s.includes("tools-changed")) return Activity;
  if (s.includes("error") || s.includes("prompt")) return AlertCircle;
  return Info;
}

export interface SystemEventBlockProps {
  message: SystemEventMessage;
}

/**
 * Inline single-line annotation. Callers arrange it in a list; this component
 * does not own its own spacing or dividers — those belong to the parent
 * timeline layout.
 */
export function SystemEventBlock({ message }: SystemEventBlockProps) {
  const Icon = iconForSubtype(message.subtype);
  return (
    <div
      className="flex items-center gap-2 px-3 py-1 text-xs text-muted-foreground"
      data-message-type="system_event"
      data-subtype={message.subtype}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{message.summary}</span>
    </div>
  );
}

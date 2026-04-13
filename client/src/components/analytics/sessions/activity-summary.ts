// client/src/components/analytics/sessions/activity-summary.ts
//
// Pure helper that derives the Activity row shown in SessionOverview after
// LifecycleEvents was deleted. Three salvaged facts: active duration,
// model switches between adjacent assistant turns, and the first errored
// tool call. Each is computed from data SessionOverview already has —
// no new endpoints, no new state.

import type { ParsedSession } from "@shared/session-types";

export interface ModelSwitch {
  fromModel: string;
  toModel: string;
  at: string;
}

export interface ActivitySummary {
  /** "8m" / "1h 30m" / null when timestamps absent. */
  durationLabel: string | null;
  /** Empty array when the session never switched models. */
  modelSwitches: ModelSwitch[];
  /** ISO timestamp of the first errored tool call, or null. */
  firstErrorTs: string | null;
}

export function buildActivitySummary(parsed: ParsedSession): ActivitySummary {
  const durationLabel = computeDurationLabel(
    parsed.meta?.firstTs ?? null,
    parsed.meta?.lastTs ?? null,
  );
  const modelSwitches = computeModelSwitches(parsed.assistantMessages);
  const firstErrorTs = computeFirstErrorTs(parsed.toolTimeline);
  return { durationLabel, modelSwitches, firstErrorTs };
}

function computeDurationLabel(
  firstTs: string | null,
  lastTs: string | null,
): string | null {
  if (!firstTs || !lastTs) return null;
  const start = new Date(firstTs).getTime();
  const end = new Date(lastTs).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const totalMinutes = Math.floor((end - start) / 60_000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}

function computeModelSwitches(
  assistantMessages: ParsedSession["assistantMessages"],
): ModelSwitch[] {
  const switches: ModelSwitch[] = [];
  for (let i = 1; i < assistantMessages.length; i++) {
    const prev = assistantMessages[i - 1];
    const cur = assistantMessages[i];
    if (prev.model && cur.model && prev.model !== cur.model) {
      switches.push({
        fromModel: prev.model,
        toModel: cur.model,
        at: cur.timestamp ?? "",
      });
    }
  }
  return switches;
}

function computeFirstErrorTs(
  toolTimeline: ParsedSession["toolTimeline"],
): string | null {
  for (const t of toolTimeline) {
    if (t.isError) return t.timestamp;
  }
  return null;
}

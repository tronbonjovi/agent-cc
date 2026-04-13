import { useState, useEffect } from "react";
import { useSessionDetail, useTogglePin, useDeleteSession, useSessionNames } from "@/hooks/use-sessions";
import { SessionOverview } from "./SessionOverview";
import { SessionToolTimeline } from "./SessionToolTimeline";
import { TokenBreakdown } from "./TokenBreakdown";
import { LinkedTask } from "./LinkedTask";
import { SessionFilterBar, applySessionPreset, type SessionFilterBarState } from "./SessionFilterBar";
// FileImpact / HealthDetails / LifecycleEvents are no longer rendered here;
// task009 deletes the orphaned files. Imports removed to satisfy noUnusedLocals.
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pin, Trash2, GitBranch, Clock, FolderOpen } from "lucide-react";
import { sessionHealthBadgeVariant, type SessionHealthScore } from "@/lib/session-health";
import type { ParsedSession } from "@shared/session-types";
import type { LinkSignal } from "@shared/board-types";

interface SessionDetailProps {
  sessionId: string;
  /** Parsed session data (optional — overview degrades gracefully without it) */
  parsed?: ParsedSession | null;
  /** Enrichment data passed from the session list */
  healthScore?: SessionHealthScore;
  healthReasons?: string[];
  durationMinutes?: number | null;
  toolErrors?: number;
  retries?: number;
  maxTokensStops?: number;
  totalToolCalls?: number;
  /** Linked task info */
  linkedTaskId?: string;
  linkedTaskTitle?: string;
  linkedMilestone?: string;
  isManualLink?: boolean;
  linkScore?: number;
  linkSignals?: LinkSignal[];
  onDelete?: () => void;
}

export function SessionDetail({
  sessionId, parsed, healthScore, healthReasons,
  durationMinutes,
  linkedTaskId, linkedTaskTitle, linkedMilestone, isManualLink, linkScore, linkSignals,
  onDelete,
}: SessionDetailProps) {
  const { data: session, isLoading } = useSessionDetail(sessionId, { includeTree: true });
  const { data: sessionNames } = useSessionNames();
  const togglePin = useTogglePin();
  const deleteSession = useDeleteSession();
  const [filterState, setFilterState] = useState<SessionFilterBarState>(
    () => applySessionPreset("default"),
  );
  const [localPinned, setLocalPinned] = useState<boolean | null>(null);
  const isPinned = localPinned ?? session?.isPinned ?? false;

  useEffect(() => { setLocalPinned(null); }, [sessionId]);

  if (isLoading || !session) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        {isLoading ? "Loading session..." : "Session not found"}
      </div>
    );
  }

  // Prefer prop, fall back to API response
  const resolvedParsed = parsed ?? session.parsed ?? null;

  const displayName = sessionNames?.[session.id] || session.firstMessage || session.slug || session.id.slice(0, 8);

  // Time range
  const startTs = session.firstTs;
  const endTs = session.lastTs;
  const timeRange = startTs && endTs
    ? `${new Date(startTs).toLocaleString()} → ${new Date(endTs).toLocaleString()}`
    : startTs ? new Date(startTs).toLocaleString() : "-";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/40 space-y-2 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-medium leading-tight">{displayName}</h3>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              {session.projectKey && (
                <span className="flex items-center gap-1">
                  <FolderOpen className="h-3 w-3" />
                  {session.projectKey.split("/").pop()}
                </span>
              )}
              {session.gitBranch && (
                <span className="flex items-center gap-1">
                  <GitBranch className="h-3 w-3" />
                  {session.gitBranch}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost" size="sm"
              onClick={() => {
                setLocalPinned(prev => !(prev ?? session.isPinned ?? false));
                togglePin.mutate(session.id);
              }}
              className={isPinned ? "text-amber-500" : ""}
            >
              <Pin className={`h-3.5 w-3.5 ${isPinned ? "fill-current" : ""}`} />
            </Button>
            <Button
              variant="ghost" size="sm"
              onClick={() => {
                deleteSession.mutate(session.id);
                onDelete?.();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Time range and health */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>{timeRange}</span>
          {session.isActive && (
            <Badge variant="default" className="text-[10px] px-1 py-0 h-4">active</Badge>
          )}
        </div>

        {healthScore && (
          <div className="flex items-center gap-1">
            <Badge variant={sessionHealthBadgeVariant(healthScore)}
              className="text-[10px]">
              {healthScore}
            </Badge>
            {healthReasons?.slice(0, 3).map((r, i) => (
              <Badge key={i} variant="outline" className="text-[10px] px-1 py-0">{r}</Badge>
            ))}
          </div>
        )}
      </div>

      {/* Filter bar */}
      <SessionFilterBar state={filterState} onChange={setFilterState} />

      {/* Sections — driven by filter pill state */}
      <div className="flex-1 overflow-y-auto">
        {filterState.overview && (
          <section data-section="overview" className="border-b border-border/20">
            <SessionOverview
              parsed={resolvedParsed}
              healthScore={healthScore}
              healthReasons={healthReasons}
              durationMinutes={durationMinutes}
              tree={session.tree}
            />
          </section>
        )}

        {filterState.linkedTask && linkedTaskId && (
          <section data-section="linked-task" className="border-b border-border/20">
            <LinkedTask
              taskId={linkedTaskId}
              taskTitle={linkedTaskTitle}
              milestone={linkedMilestone}
              isManualLink={isManualLink}
              linkScore={linkScore}
              linkSignals={linkSignals}
            />
          </section>
        )}

        {filterState.tools && (
          <section data-section="tools" className="border-b border-border/20">
            <SessionToolTimeline
              sessionId={sessionId}
              errorsOnly={filterState.errorsOnly}
            />
          </section>
        )}

        {filterState.tokens && (
          <section data-section="tokens" className="border-b border-border/20">
            {resolvedParsed ? (
              <TokenBreakdown
                assistantMessages={resolvedParsed.assistantMessages}
                userMessages={resolvedParsed.userMessages}
                tree={session.tree}
              />
            ) : (
              <div className="p-4 text-sm text-muted-foreground">Parsed session data not available</div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

import { useState } from "react";
import { useSessionDetail, useTogglePin, useDeleteSession, useSessionNames } from "@/hooks/use-sessions";
import { SessionOverview } from "./SessionOverview";
import { ToolTimeline } from "./ToolTimeline";
import { TokenBreakdown } from "./TokenBreakdown";
import { FileImpact } from "./FileImpact";
import { HealthDetails } from "./HealthDetails";
import { LifecycleEvents } from "./LifecycleEvents";
import { LinkedTask } from "./LinkedTask";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pin, Trash2, ChevronDown, ChevronRight, GitBranch, Clock, FolderOpen } from "lucide-react";
import type { ParsedSession } from "@shared/session-types";
import type { LinkSignal } from "@shared/board-types";

interface SessionDetailProps {
  sessionId: string;
  /** Parsed session data (optional — overview degrades gracefully without it) */
  parsed?: ParsedSession | null;
  /** Enrichment data passed from the session list */
  healthScore?: "good" | "fair" | "poor" | null;
  healthReasons?: string[];
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
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
  costUsd, inputTokens, outputTokens,
  cacheReadTokens, cacheCreationTokens,
  durationMinutes, toolErrors, retries, maxTokensStops, totalToolCalls,
  linkedTaskId, linkedTaskTitle, linkedMilestone, isManualLink, linkScore, linkSignals,
  onDelete,
}: SessionDetailProps) {
  const { data: session, isLoading } = useSessionDetail(sessionId);
  const { data: sessionNames } = useSessionNames();
  const togglePin = useTogglePin();
  const deleteSession = useDeleteSession();
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["overview"]));

  const toggleSection = (name: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  if (isLoading || !session) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        {isLoading ? "Loading session..." : "Session not found"}
      </div>
    );
  }

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
              onClick={() => togglePin.mutate(session.id)}
              className={session.isPinned ? "text-amber-500" : ""}
            >
              <Pin className="h-3.5 w-3.5" />
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
            <Badge variant={healthScore === "good" ? "default" : healthScore === "fair" ? "secondary" : "destructive"}
              className="text-[10px]">
              {healthScore}
            </Badge>
            {healthReasons?.slice(0, 3).map((r, i) => (
              <Badge key={i} variant="outline" className="text-[10px] px-1 py-0">{r}</Badge>
            ))}
          </div>
        )}
      </div>

      {/* Collapsible sections */}
      <div className="flex-1 overflow-y-auto">
        {/* Overview section */}
        <SectionHeader
          title="Overview"
          isOpen={openSections.has("overview")}
          onToggle={() => toggleSection("overview")}
        />
        {openSections.has("overview") && (
          <SessionOverview
            parsed={parsed ?? null}
            costUsd={costUsd}
            inputTokens={inputTokens}
            outputTokens={outputTokens}
            cacheReadTokens={cacheReadTokens}
            cacheCreationTokens={cacheCreationTokens}
            healthScore={healthScore}
            healthReasons={healthReasons}
            durationMinutes={durationMinutes}
          />
        )}

        {/* Linked Task */}
        <SectionHeader
          title="Linked Task"
          isOpen={openSections.has("linked-task")}
          onToggle={() => toggleSection("linked-task")}
        />
        {openSections.has("linked-task") && (
          <LinkedTask
            taskId={linkedTaskId}
            taskTitle={linkedTaskTitle}
            milestone={linkedMilestone}
            isManualLink={isManualLink}
            linkScore={linkScore}
            linkSignals={linkSignals}
          />
        )}

        {/* Tool Timeline */}
        <SectionHeader
          title="Tool Timeline"
          isOpen={openSections.has("tools")}
          onToggle={() => toggleSection("tools")}
        />
        {openSections.has("tools") && parsed && (
          <ToolTimeline tools={parsed.toolTimeline} sessionStartTs={parsed.meta.firstTs} />
        )}
        {openSections.has("tools") && !parsed && (
          <div className="p-4 text-sm text-muted-foreground">Parsed session data not available</div>
        )}

        {/* Token Breakdown */}
        <SectionHeader
          title="Token Breakdown"
          isOpen={openSections.has("tokens")}
          onToggle={() => toggleSection("tokens")}
        />
        {openSections.has("tokens") && parsed && (
          <TokenBreakdown assistantMessages={parsed.assistantMessages} userMessages={parsed.userMessages} />
        )}
        {openSections.has("tokens") && !parsed && (
          <div className="p-4 text-sm text-muted-foreground">Parsed session data not available</div>
        )}

        {/* File Impact */}
        <SectionHeader
          title="File Impact"
          isOpen={openSections.has("files")}
          onToggle={() => toggleSection("files")}
        />
        {openSections.has("files") && parsed && (
          <FileImpact tools={parsed.toolTimeline} />
        )}
        {openSections.has("files") && !parsed && (
          <div className="p-4 text-sm text-muted-foreground">Parsed session data not available</div>
        )}

        {/* Health Details */}
        <SectionHeader
          title="Health Details"
          isOpen={openSections.has("health")}
          onToggle={() => toggleSection("health")}
        />
        {openSections.has("health") && (
          <HealthDetails
            healthScore={healthScore ?? null}
            healthReasons={healthReasons ?? []}
            totalToolCalls={totalToolCalls ?? 0}
            toolErrors={toolErrors ?? 0}
            retries={retries ?? 0}
            maxTokensStops={maxTokensStops ?? 0}
          />
        )}

        {/* Lifecycle Events */}
        <SectionHeader
          title="Lifecycle Events"
          isOpen={openSections.has("lifecycle")}
          onToggle={() => toggleSection("lifecycle")}
        />
        {openSections.has("lifecycle") && parsed && (
          <LifecycleEvents events={parsed.lifecycle} sessionStartTs={parsed.meta.firstTs} />
        )}
        {openSections.has("lifecycle") && !parsed && (
          <div className="p-4 text-sm text-muted-foreground">Parsed session data not available</div>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ title, isOpen, onToggle }: { title: string; isOpen: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-2 w-full px-4 py-2 text-sm font-medium border-b border-border/20 hover:bg-muted/30 transition-colors"
    >
      {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      {title}
    </button>
  );
}

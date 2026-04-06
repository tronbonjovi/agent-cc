import { useRef } from "react";
import { useLiveData } from "@/hooks/use-agents";
import { useAppSettings } from "@/hooks/use-settings";
import { getSessionDisplayName } from "@/lib/session-display-name";
import { useSessionNames } from "@/hooks/use-sessions";
import type { ActiveSession, SessionHealthThresholds } from "@shared/types";

type ThresholdLevel = "green" | "yellow" | "red";

function getLevel(value: number, thresholds: { yellow: number; red: number }): ThresholdLevel {
  if (value >= thresholds.red) return "red";
  if (value >= thresholds.yellow) return "yellow";
  return "green";
}

function worstLevel(levels: ThresholdLevel[]): ThresholdLevel {
  if (levels.includes("red")) return "red";
  if (levels.includes("yellow")) return "yellow";
  return "green";
}

const levelColors: Record<ThresholdLevel, string> = {
  green: "text-green-400",
  yellow: "text-amber-400",
  red: "text-red-400",
};

const dotColors: Record<ThresholdLevel, string> = {
  green: "bg-green-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
};

const barColors: Record<ThresholdLevel, string> = {
  green: "bg-green-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
};

const badgeColors: Record<ThresholdLevel, string> = {
  green: "bg-green-500/15 text-green-400",
  yellow: "bg-amber-500/15 text-amber-400",
  red: "bg-red-500/15 text-red-400",
};

interface PrevLevels {
  context: ThresholdLevel;
  cost: ThresholdLevel;
  messages: ThresholdLevel;
}

function SessionRow({
  session,
  thresholds,
  prevLevelsRef,
  sessionNames,
}: {
  session: ActiveSession;
  thresholds: SessionHealthThresholds;
  prevLevelsRef: React.MutableRefObject<Record<string, PrevLevels>>;
  sessionNames?: Record<string, string>;
}) {
  const contextPct = session.contextUsage?.percentage ?? 0;
  const cost = session.costEstimate ?? 0;
  const messages = session.messageCount ?? 0;

  const contextLevel = getLevel(contextPct, thresholds.context);
  const costLevel = getLevel(cost, thresholds.cost);
  const messagesLevel = getLevel(messages, thresholds.messages);
  const overall = worstLevel([contextLevel, costLevel, messagesLevel]);

  // Detect threshold crossings for pulse animation
  const prev = prevLevelsRef.current[session.sessionId];
  const crossings = {
    context: prev ? prev.context !== contextLevel && contextLevel !== "green" : false,
    cost: prev ? prev.cost !== costLevel && costLevel !== "green" : false,
    messages: prev ? prev.messages !== messagesLevel && messagesLevel !== "green" : false,
  };
  prevLevelsRef.current[session.sessionId] = {
    context: contextLevel,
    cost: costLevel,
    messages: messagesLevel,
  };

  const pulseClass = "animate-pulse";
  const sessionName = getSessionDisplayName(session.sessionId, {
    customNames: sessionNames,
    slug: session.slug,
    firstMessage: session.firstMessage,
  });

  return (
    <div className="bg-muted/20 rounded-md px-3 py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColors[overall]}`} />
          <span className="text-sm text-foreground truncate">{sessionName}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-xs font-mono ${levelColors[costLevel]} ${crossings.cost ? pulseClass : ""}`}>
            ${cost.toFixed(2)}
          </span>
          <span className={`text-xs font-mono ${levelColors[messagesLevel]} ${crossings.messages ? pulseClass : ""}`}>
            {messages} msgs
          </span>
          {session.status && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${badgeColors[overall]}`}>
              {session.status}
            </span>
          )}
        </div>
      </div>
      <div className="ml-[18px]">
        <div className="bg-muted/30 rounded-sm h-1 overflow-hidden">
          <div
            className={`h-full rounded-sm transition-all duration-500 ${barColors[contextLevel]}`}
            style={{ width: `${Math.min(contextPct, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export function SessionHealthPanel() {
  const { data: settings } = useAppSettings();
  const { data: liveData } = useLiveData();
  const { data: sessionNames } = useSessionNames();
  const prevLevelsRef = useRef<Record<string, PrevLevels>>({});

  const activeSessions = liveData?.activeSessions ?? [];
  if (activeSessions.length === 0) return null;

  const thresholds = settings?.healthThresholds ?? {
    context: { yellow: 20, red: 50 },
    cost: { yellow: 3, red: 5 },
    messages: { yellow: 30, red: 60 },
  };

  return (
    <div className="space-y-1.5 mb-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
          Active Sessions
        </h3>
        <span className="text-xs text-muted-foreground">
          {activeSessions.length} session{activeSessions.length !== 1 ? "s" : ""}
        </span>
      </div>
      <div className="space-y-1">
        {activeSessions.map((session) => (
          <SessionRow
            key={session.sessionId}
            session={session}
            thresholds={thresholds}
            prevLevelsRef={prevLevelsRef}
            sessionNames={sessionNames}
          />
        ))}
      </div>
    </div>
  );
}

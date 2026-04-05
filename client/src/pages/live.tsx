import { useLiveData } from "@/hooks/use-agents";
import { Redirect } from "wouter";

/**
 * /live route — redirects to dashboard (live data merged there).
 * Preserves /live?compact=true as a minimal overlay for embedded use.
 */
export default function Live() {
  const { data } = useLiveData();
  const isCompact = new URLSearchParams(window.location.search).get("compact") === "true";

  if (!isCompact) {
    return <Redirect to="/" />;
  }

  const activeSessions = data?.activeSessions || [];
  const totalCost = activeSessions.reduce((sum, s) => sum + (s.costEstimate ?? 0), 0);

  return (
    <div className="p-3 space-y-2 max-w-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{activeSessions.length} session{activeSessions.length !== 1 ? "s" : ""}</span>
        <span className="text-lg font-mono font-bold text-green-400">${totalCost.toFixed(2)}</span>
      </div>
      {activeSessions.map(s => (
        <div key={s.sessionId} className="flex items-center gap-2 text-xs">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.status === "thinking" ? "bg-green-500 animate-pulse" : s.status === "waiting" ? "bg-amber-500" : "bg-muted"}`} />
          <span className="truncate flex-1 text-muted-foreground">{s.firstMessage?.slice(0, 40) || s.slug || s.sessionId.slice(0, 8)}</span>
          <span className="font-mono text-green-400 flex-shrink-0">${(s.costEstimate ?? 0).toFixed(2)}</span>
        </div>
      ))}
      <div className="text-[10px] text-muted-foreground/40 text-center">auto-refreshes every 3s</div>
    </div>
  );
}

import { Badge } from "@/components/ui/badge";

interface HealthDetailsProps {
  healthScore: "good" | "fair" | "poor" | null;
  healthReasons: string[];
  totalToolCalls: number;
  toolErrors: number;
  retries: number;
  maxTokensStops: number;
}

export function HealthDetails({
  healthScore, healthReasons, totalToolCalls, toolErrors, retries, maxTokensStops,
}: HealthDetailsProps) {
  if (!healthScore || healthScore === "good") {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Session health is good — no issues detected.
      </div>
    );
  }

  const errorRate = totalToolCalls > 0 ? ((toolErrors / totalToolCalls) * 100).toFixed(1) : "0";

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Badge variant={healthScore === "fair" ? "secondary" : "destructive"}>
          {healthScore}
        </Badge>
      </div>

      {healthReasons.length > 0 && (
        <div className="space-y-2">
          {healthReasons.map((reason, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <span className="text-amber-500 shrink-0">!</span>
              <span>{reason}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 text-sm">
        {toolErrors > 0 && (
          <div>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">Error Rate</span>
            <span>{toolErrors}/{totalToolCalls} calls ({errorRate}%)</span>
          </div>
        )}
        {retries > 0 && (
          <div>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">Retries</span>
            <span>{retries}</span>
          </div>
        )}
        {maxTokensStops > 0 && (
          <div>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide block">Max Token Stops</span>
            <span>{maxTokensStops}</span>
          </div>
        )}
      </div>
    </div>
  );
}

import { useWorkflowConfig, useUpdateWorkflow, useRunWorkflows } from "@/hooks/use-sessions";
import { Button } from "@/components/ui/button";
import { Settings, Play, Loader2 } from "lucide-react";

export function WorkflowConfigPanel() {
  const { data: config } = useWorkflowConfig();
  const updateWorkflow = useUpdateWorkflow();
  const runWorkflows = useRunWorkflows();

  if (!config) return null;

  const toggle = (key: keyof typeof config) => {
    updateWorkflow.mutate({ [key]: !config[key] });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium flex items-center gap-2">
          <Settings className="h-4 w-4 text-gray-400" /> Auto-Workflows
        </h2>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => runWorkflows.mutate()} disabled={runWorkflows.isPending}>
          {runWorkflows.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Run Now
        </Button>
      </div>
      <div className="rounded-xl border bg-card p-4 space-y-3">
        {([
          { key: "autoSummarize" as const, label: "Auto-summarize new sessions", desc: "Summarize completed sessions automatically" },
          { key: "autoArchiveStale" as const, label: "Flag stale sessions", desc: "Identify sessions older than 30 days with <5 messages" },
        ]).map(item => (
          <div key={item.key} className="flex items-center justify-between">
            <div>
              <p className="text-sm">{item.label}</p>
              <p className="text-[11px] text-muted-foreground">{item.desc}</p>
            </div>
            <button
              onClick={() => toggle(item.key)}
              className={`w-10 h-5 rounded-full transition-colors ${config[item.key] ? "bg-blue-500" : "bg-muted"}`}
            >
              <div className={`w-4 h-4 rounded-full bg-white transition-transform ${config[item.key] ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>
        ))}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm">Daily cost alert</p>
            <p className="text-[11px] text-muted-foreground">Notify when daily spend exceeds threshold</p>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">$</span>
            <input
              type="number"
              value={config.costAlertThreshold || ""}
              onChange={e => updateWorkflow.mutate({ costAlertThreshold: e.target.value ? Number(e.target.value) : null })}
              placeholder="off"
              className="w-16 text-xs font-mono px-2 py-1 rounded border border-border bg-background"
            />
          </div>
        </div>
      </div>
      {runWorkflows.data && (
        <div className="text-xs text-muted-foreground space-y-0.5">
          {(runWorkflows.data as { ran: string[]; errors: string[] }).ran.map((r: string, i: number) => <p key={i} className="text-green-400">- {r}</p>)}
          {(runWorkflows.data as { ran: string[]; errors: string[] }).errors.map((e: string, i: number) => <p key={i} className="text-red-400">- {e}</p>)}
        </div>
      )}
    </div>
  );
}

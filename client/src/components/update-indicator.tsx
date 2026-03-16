import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  useUpdateStatus,
  useCheckForUpdate,
  useApplyUpdate,
  useUpdatePrefs,
  useRestartServer,
} from "@/hooks/use-update";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ArrowUpCircle,
  Check,
  Loader2,
  AlertCircle,
  RefreshCw,
  RotateCcw,
  Download,
  BellOff,
  Settings,
  Power,
  Zap,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export function UpdateIndicator({ collapsed }: { collapsed: boolean }) {
  const { data: status } = useUpdateStatus();
  const checkMutation = useCheckForUpdate();
  const applyMutation = useApplyUpdate();
  const restartMutation = useRestartServer();
  const prefsMutation = useUpdatePrefs();
  const [expanded, setExpanded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);

  const isRestarting = restartMutation.isPending;

  const prefs = status?.prefs ?? { enabled: true, autoUpdate: false, dismissedCommit: null };
  const isChecking = checkMutation.isPending;
  const isApplying = applyMutation.isPending;
  const applyResult = applyMutation.data;
  const hasError = checkMutation.isError || applyMutation.isError || !!status?.error;
  const isDone = applyResult?.success && applyResult.restartRequired;

  // Update is available AND not dismissed
  const rawHasUpdate = !!(status?.updateAvailable && status.commitsBehind > 0);
  const isDismissed = rawHasUpdate && prefs.dismissedCommit === status?.latestCommit;
  const hasUpdate = rawHasUpdate && !isDismissed;

  // Should we blink?
  const shouldBlink = hasUpdate && !isApplying && !isDone;

  // Updates disabled
  if (!prefs.enabled) {
    if (collapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="flex items-center justify-center px-3 py-1.5 w-full opacity-30"
              onClick={() => prefsMutation.mutate({ enabled: true })}
            >
              <Power className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            Updates disabled — click to enable
          </TooltipContent>
        </Tooltip>
      );
    }
    return (
      <div className="px-2 py-1.5">
        <button
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs hover:bg-sidebar-accent/50 border border-transparent opacity-50 hover:opacity-80 transition-all"
          onClick={() => prefsMutation.mutate({ enabled: true })}
        >
          <Power className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="flex-1 text-left text-muted-foreground">Updates disabled</span>
        </button>
      </div>
    );
  }

  // Collapsed sidebar
  if (collapsed) {
    const icon = isDone ? (
      <RotateCcw className="h-3.5 w-3.5 text-emerald-400" />
    ) : isApplying ? (
      <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin" />
    ) : isChecking ? (
      <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
    ) : hasError ? (
      <AlertCircle className="h-3.5 w-3.5 text-red-400" />
    ) : hasUpdate ? (
      <Download className="h-3.5 w-3.5 text-amber-400" />
    ) : (
      <ArrowUpCircle className="h-3.5 w-3.5 text-muted-foreground/50" />
    );

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="flex items-center justify-center px-3 py-1.5 hover:bg-sidebar-accent/50 transition-colors w-full"
            onClick={() => {
              if (!isApplying && !isDone) checkMutation.mutate();
            }}
          >
            <div className="relative">
              {icon}
              {shouldBlink && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              )}
            </div>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          {isDone
            ? "Restart required"
            : isApplying
            ? "Updating..."
            : hasUpdate
            ? `${status?.commitsBehind} updates available`
            : "Check for updates"}
        </TooltipContent>
      </Tooltip>
    );
  }

  // Expanded sidebar
  return (
    <div className="px-2 py-1.5">
      {/* Main row */}
      <button
        className={cn(
          "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs transition-all",
          shouldBlink
            ? "bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/30 shadow-[0_0_8px_rgba(245,158,11,0.15)]"
            : isDone
            ? "bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/20"
            : hasError
            ? "bg-red-500/10 hover:bg-red-500/15 border border-red-500/20"
            : "hover:bg-sidebar-accent/50 border border-transparent"
        )}
        onClick={() => setExpanded(!expanded)}
      >
        {/* Icon with blink indicator */}
        <div className="relative shrink-0">
          {isDone ? (
            <RotateCcw className="h-4 w-4 text-emerald-400" />
          ) : isApplying ? (
            <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
          ) : isChecking ? (
            <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />
          ) : hasError ? (
            <AlertCircle className="h-4 w-4 text-red-400" />
          ) : hasUpdate ? (
            <Download className={cn("h-4 w-4 text-amber-400", shouldBlink && "animate-bounce")} />
          ) : (
            <ArrowUpCircle className="h-4 w-4 text-muted-foreground/50" />
          )}
          {shouldBlink && (
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400" />
            </span>
          )}
        </div>

        {/* Label */}
        <span
          className={cn(
            "flex-1 text-left font-medium",
            shouldBlink
              ? "text-amber-300"
              : isDone
              ? "text-emerald-400"
              : hasError
              ? "text-red-400"
              : isApplying
              ? "text-blue-400"
              : "text-muted-foreground/70"
          )}
        >
          {isDone
            ? "Restart to apply"
            : isApplying
            ? "Updating..."
            : isChecking
            ? "Checking..."
            : hasError
            ? "Update error"
            : hasUpdate
            ? `${status!.commitsBehind} update${status!.commitsBehind !== 1 ? "s" : ""} available`
            : isDismissed
            ? "Update ignored"
            : "Updates"}
        </span>

        {/* Version + chevron */}
        <div className="flex items-center gap-1">
          {status?.currentVersion && (
            <span className="text-[10px] font-mono text-muted-foreground/50">
              v{status.currentVersion}
            </span>
          )}
          {expanded ? (
            <ChevronUp className="h-3 w-3 text-muted-foreground/40" />
          ) : (
            <ChevronDown className="h-3 w-3 text-muted-foreground/40" />
          )}
        </div>
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="mt-1.5 mx-0.5 px-2.5 py-2.5 rounded-lg bg-sidebar-accent/30 space-y-2.5">
          {/* Status messages */}
          {status && !status.hasGitRemote && (
            <div className="text-[11px] text-muted-foreground leading-relaxed">
              No git remote configured.
            </div>
          )}

          {!status?.lastCheckedAt && !isChecking && status?.hasGitRemote !== false && (
            <div className="text-[11px] text-muted-foreground">
              Not checked yet.
            </div>
          )}

          {status?.lastCheckedAt && !rawHasUpdate && !isDone && !hasError && (
            <div className="flex items-center gap-2 text-[11px] text-emerald-400">
              <Check className="h-3.5 w-3.5 shrink-0" />
              Up to date
              <span className="text-muted-foreground/50 ml-auto font-mono text-[10px]">
                {status.currentCommit}
              </span>
            </div>
          )}

          {rawHasUpdate && !isDone && (
            <div className="space-y-1">
              <div className="text-[11px]">
                <strong className={isDismissed ? "text-muted-foreground" : "text-amber-300"}>
                  {status!.commitsBehind}
                </strong>
                <span className="text-muted-foreground">
                  {" "}commit{status!.commitsBehind !== 1 ? "s" : ""} behind
                  {isDismissed && " (ignored)"}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground/50">
                <span>{status!.currentCommit}</span>
                <span>→</span>
                <span>{status!.latestCommit}</span>
              </div>
            </div>
          )}

          {/* Apply progress */}
          {applyResult && (
            <div className="space-y-1">
              {applyResult.steps.map((step) => (
                <div key={step.name} className="flex items-center gap-2 text-[11px]">
                  {step.status === "success" ? (
                    <Check className="h-3 w-3 text-emerald-400 shrink-0" />
                  ) : step.status === "failed" ? (
                    <AlertCircle className="h-3 w-3 text-red-400 shrink-0" />
                  ) : (
                    <div className="h-3 w-3 rounded-full border border-muted-foreground/30 shrink-0" />
                  )}
                  <span className={cn(
                    step.status === "failed" && "text-red-400",
                    step.status === "skipped" && "text-muted-foreground/50"
                  )}>
                    {step.name}
                  </span>
                </div>
              ))}
              {applyResult.steps.some((s) => s.status === "failed") && (
                <div className="text-[10px] text-red-400 font-mono leading-tight max-h-16 overflow-auto mt-1">
                  {applyResult.steps.find((s) => s.status === "failed")?.output}
                </div>
              )}
            </div>
          )}

          {isDone && !showRestartConfirm && (
            <Button
              size="sm"
              className="w-full gap-1.5 text-xs h-7 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => setShowRestartConfirm(true)}
              disabled={isRestarting}
            >
              <RotateCcw className={`h-3 w-3 ${isRestarting ? "animate-spin" : ""}`} />
              {isRestarting ? "Restarting..." : "Restart Now"}
            </Button>
          )}
          {isDone && showRestartConfirm && !isRestarting && (
            <div className="space-y-2 border border-yellow-500/30 rounded-md p-2 bg-yellow-500/5">
              <p className="text-[10px] text-yellow-400">
                The server will briefly go offline. The page will auto-reload when it's back.
              </p>
              <p className="text-[10px] text-muted-foreground">
                If it doesn't come back, restart manually:
              </p>
              <code className="text-[9px] text-muted-foreground/70 block bg-muted/30 rounded px-1.5 py-1 font-mono">
                npm run dev
              </code>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  className="flex-1 gap-1 text-[10px] h-6 bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => restartMutation.mutate()}
                >
                  <RotateCcw className="h-2.5 w-2.5" />
                  Confirm Restart
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-[10px] h-6 px-2"
                  onClick={() => setShowRestartConfirm(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {isRestarting && (
            <div className="text-[10px] text-muted-foreground animate-pulse">
              Waiting for server to come back...
            </div>
          )}

          {status?.error && !applyResult && (
            <div className="text-[10px] text-red-400 font-mono leading-tight">
              {status.error}
            </div>
          )}

          {status?.lastCheckedAt && (
            <div className="text-[10px] text-muted-foreground/40">
              Checked {formatTimeAgo(status.lastCheckedAt)}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            {!isDone && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] flex-1"
                disabled={isChecking || isApplying}
                onClick={(e) => {
                  e.stopPropagation();
                  checkMutation.mutate();
                }}
              >
                {isChecking ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                ) : (
                  <RefreshCw className="h-3 w-3 mr-1.5" />
                )}
                Check
              </Button>
            )}
            {rawHasUpdate && !isDone && !isDismissed && (
              <Button
                size="sm"
                className="h-7 text-[11px] flex-1 bg-amber-600 hover:bg-amber-500 text-white"
                disabled={isApplying}
                onClick={(e) => {
                  e.stopPropagation();
                  applyMutation.mutate();
                }}
              >
                {isApplying ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                ) : (
                  <Download className="h-3 w-3 mr-1.5" />
                )}
                Update Now
              </Button>
            )}
            {isDismissed && !isDone && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px] flex-1"
                onClick={(e) => {
                  e.stopPropagation();
                  prefsMutation.mutate({ dismissedCommit: null });
                }}
              >
                <ArrowUpCircle className="h-3 w-3 mr-1.5" />
                Review Update
              </Button>
            )}
            {(isDone || applyResult?.error) && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] flex-1"
                onClick={(e) => {
                  e.stopPropagation();
                  applyMutation.reset();
                  checkMutation.mutate();
                }}
              >
                <RefreshCw className="h-3 w-3 mr-1.5" />
                Check Again
              </Button>
            )}
          </div>

          {/* Ignore button — only when update is active and not dismissed */}
          {hasUpdate && !isDone && !isApplying && (
            <button
              className="w-full text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors flex items-center justify-center gap-1 py-0.5"
              onClick={(e) => {
                e.stopPropagation();
                prefsMutation.mutate({ dismissedCommit: status!.latestCommit });
              }}
            >
              <BellOff className="h-3 w-3" />
              Ignore this update
            </button>
          )}

          {/* Settings toggle */}
          <button
            className="w-full text-[10px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors flex items-center justify-center gap-1 pt-1 border-t border-border/30"
            onClick={(e) => {
              e.stopPropagation();
              setShowSettings(!showSettings);
            }}
          >
            <Settings className="h-3 w-3" />
            Settings
          </button>

          {/* Settings panel */}
          {showSettings && (
            <div className="space-y-2 pt-1">
              <label className="flex items-center gap-2 text-[11px] cursor-pointer group">
                <button
                  className={cn(
                    "w-8 h-4.5 rounded-full relative transition-colors",
                    prefs.autoUpdate
                      ? "bg-blue-500"
                      : "bg-muted-foreground/20"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    prefsMutation.mutate({ autoUpdate: !prefs.autoUpdate });
                  }}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-all",
                      prefs.autoUpdate ? "left-[calc(100%-1rem)]" : "left-0.5"
                    )}
                  />
                </button>
                <Zap className="h-3 w-3 text-muted-foreground/60" />
                <span className="text-muted-foreground group-hover:text-muted-foreground/80">
                  Auto-update
                </span>
              </label>

              <button
                className="flex items-center gap-2 text-[11px] text-red-400/60 hover:text-red-400 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  prefsMutation.mutate({ enabled: false });
                  setExpanded(false);
                }}
              >
                <Power className="h-3 w-3" />
                Disable update checks
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

import { useState, useEffect } from "react";
import { useAppSettings, useUpdateSettings, useResetSettings } from "@/hooks/use-settings";
import { useRuntimeConfig, useConfigSettings } from "@/hooks/use-config";
import { useRescan } from "@/hooks/use-entities";
import { PageContainer } from "@/components/page-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import {
  Settings as SettingsIcon,
  RefreshCw,
  RotateCcw,
  Plus,
  X,
  FolderOpen,
  Server,
  Wand2,
  Puzzle,
  FileJson,
  Cpu,
  HardDrive,
  Clock,
  Database,
  Shield,
  Copy,
  Check,
  Rocket,
} from "lucide-react";
import { HealthThresholdsSettings } from "@/components/settings-health-thresholds";
import { WorkflowConfigPanel } from "@/components/settings/workflow-config-panel";
import { ProviderManager } from "@/components/settings/provider-manager";
import { useProviderModels } from "@/hooks/use-provider-models";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ChatGlobalDefaults, ProviderConfig } from "@shared/types";

// ---- Shared utilities ----

function formatUptime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

function colorizeJson(json: string): React.ReactNode[] {
  return json.split("\n").map((line, lineIdx) => {
    const colored = line
      .replace(/("(?:\\.|[^"\\])*")\s*:/g, "<key>$1</key>:")
      .replace(/:\s*("(?:\\.|[^"\\])*")/g, ': <str>$1</str>')
      .replace(/:\s*(\d+(?:\.\d+)?)/g, ": <num>$1</num>")
      .replace(/:\s*(true|false|null)/g, ": <bool>$1</bool>");

    const segments: React.ReactNode[] = [];
    let remaining = colored;
    let segIdx = 0;

    while (remaining.length > 0) {
      const tagMatch = remaining.match(
        /^([\s\S]*?)<(key|str|num|bool)>([\s\S]*?)<\/\2>([\s\S]*)/
      );
      if (tagMatch) {
        if (tagMatch[1])
          segments.push(
            <span key={`${lineIdx}-${segIdx++}`}>{tagMatch[1]}</span>
          );
        const tag = tagMatch[2];
        const content = tagMatch[3];
        const colorClass =
          tag === "key"
            ? "text-cyan-400"
            : tag === "str"
              ? "text-green-400"
              : tag === "num"
                ? "text-blue-400"
                : "text-purple-400";
        segments.push(
          <span key={`${lineIdx}-${segIdx++}`} className={colorClass}>
            {content}
          </span>
        );
        remaining = tagMatch[4];
      } else {
        segments.push(
          <span key={`${lineIdx}-${segIdx++}`}>{remaining}</span>
        );
        break;
      }
    }

    return <div key={lineIdx}>{segments}</div>;
  });
}

// ---- PathList sub-component ----

function PathList({
  label,
  icon: Icon,
  paths,
  onAdd,
  onRemove,
}: {
  label: string;
  icon: React.ElementType;
  paths: string[];
  onAdd: (path: string) => void;
  onRemove: (index: number) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newPath, setNewPath] = useState("");

  const handleAdd = () => {
    const trimmed = newPath.trim();
    if (trimmed && !paths.includes(trimmed)) {
      onAdd(trimmed);
      setNewPath("");
      setAdding(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          {label}
        </label>
        {!adding && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setAdding(true)}
          >
            <Plus className="h-3 w-3 mr-1" />
            Add
          </Button>
        )}
      </div>
      {paths.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {paths.map((p, i) => (
            <Badge
              key={i}
              variant="secondary"
              className="text-xs font-mono gap-1 pr-1"
            >
              {p}
              <button
                onClick={() => onRemove(i)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive transition-colors"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      {paths.length === 0 && !adding && (
        <p className="text-xs text-muted-foreground">None configured</p>
      )}
      {adding && (
        <div className="flex items-center gap-2">
          <Input
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            placeholder="Enter absolute path..."
            className="text-sm font-mono"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
              if (e.key === "Escape") {
                setAdding(false);
                setNewPath("");
              }
            }}
          />
          <Button size="sm" onClick={handleAdd} disabled={!newPath.trim()}>
            Add
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setAdding(false);
              setNewPath("");
            }}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

// ---- Tab: General ----

function GeneralTab() {
  const { data: settings, isLoading } = useAppSettings();
  const { data: runtime } = useRuntimeConfig();
  const updateSettings = useUpdateSettings();

  const [appName, setAppName] = useState("");
  const [nameChanged, setNameChanged] = useState(false);

  useEffect(() => {
    if (settings) setAppName(settings.appName);
  }, [settings]);

  const handleSaveName = () => {
    updateSettings.mutate({ appName: appName.trim() });
    setNameChanged(false);
  };

  if (isLoading || !settings) {
    return <div className="text-muted-foreground text-sm">Loading...</div>;
  }

  const runtimeCards = runtime
    ? [
        { icon: Cpu, color: "emerald", label: "Node.js", value: runtime.nodeVersion },
        { icon: HardDrive, color: "blue", label: "Platform", value: `${runtime.platform} (${runtime.arch})` },
        { icon: Clock, color: "amber", label: "Uptime", value: formatUptime(runtime.uptime) },
        { icon: Database, color: "purple", label: "Memory (RSS)", value: `${Math.round((runtime.memoryUsage?.rss || 0) / 1048576)} MB` },
        { icon: FolderOpen, color: "teal", label: "Home Directory", value: runtime.homeDir, mono: true, small: true },
        { icon: SettingsIcon, color: "indigo", label: "Claude Directory", value: runtime.claudeDir, mono: true, small: true },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Onboarding */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-500/10 p-2">
                <Rocket className="h-4 w-4 text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium">Onboarding Wizard</p>
                <p className="text-xs text-muted-foreground">Re-run the setup walkthrough</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => updateSettings.mutate({ onboarded: false })}
              disabled={updateSettings.isPending}
            >
              <Rocket className="h-3.5 w-3.5" />
              Run Onboarding
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* App Name */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Appearance
          </h2>
          <div className="space-y-2">
            <label className="text-sm font-medium">App Name</label>
            <div className="flex items-center gap-2">
              <Input
                value={appName}
                onChange={(e) => {
                  setAppName(e.target.value);
                  setNameChanged(e.target.value !== settings.appName);
                }}
                maxLength={50}
                className="w-full sm:max-w-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && nameChanged) handleSaveName();
                }}
              />
              {nameChanged && (
                <Button
                  size="sm"
                  onClick={handleSaveName}
                  disabled={!appName.trim() || updateSettings.isPending}
                >
                  Save
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Displayed in the sidebar and browser tab
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Health Thresholds */}
      <HealthThresholdsSettings />

      {/* Runtime Info */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Runtime
        </h2>
        {runtimeCards.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {runtimeCards.map((item, i) => (
              <Card
                key={item.label}
                className="card-hover animate-fade-in-up"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`rounded-lg bg-${item.color}-500/10 p-2`}>
                      <item.icon
                        className={`h-4 w-4 text-${item.color}-400`}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted-foreground">
                        {item.label}
                      </p>
                      <p
                        className={`font-mono font-semibold truncate ${item.small ? "text-xs" : "text-sm"}`}
                      >
                        {item.value}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-muted-foreground text-sm">Loading...</div>
        )}
      </div>
    </div>
  );
}

// ---- Tab: Scan Paths ----

function ScanPathsTab() {
  const { data: settings, isLoading } = useAppSettings();
  const updateSettings = useUpdateSettings();
  const rescan = useRescan();

  const [homeDir, setHomeDir] = useState("");
  const [claudeDir, setClaudeDir] = useState("");
  const [dirsChanged, setDirsChanged] = useState(false);

  useEffect(() => {
    if (settings) {
      setHomeDir(settings.scanPaths.homeDir || "");
      setClaudeDir(settings.scanPaths.claudeDir || "");
    }
  }, [settings]);

  const handleSaveDirs = () => {
    updateSettings.mutate(
      {
        scanPaths: {
          ...settings!.scanPaths,
          homeDir: homeDir.trim() || null,
          claudeDir: claudeDir.trim() || null,
        },
      },
      { onSuccess: () => rescan.mutate() }
    );
    setDirsChanged(false);
  };

  const handlePathListChange = (
    field:
      | "extraMcpFiles"
      | "extraProjectDirs"
      | "extraSkillDirs"
      | "extraPluginDirs",
    newPaths: string[]
  ) => {
    updateSettings.mutate(
      { scanPaths: { ...settings!.scanPaths, [field]: newPaths } },
      { onSuccess: () => rescan.mutate() }
    );
  };

  if (isLoading || !settings) {
    return <div className="text-muted-foreground text-sm">Loading...</div>;
  }

  return (
    <Card>
      <CardContent className="p-5 space-y-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Directory Overrides
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Home Directory Override
            </label>
            <Input
              value={homeDir}
              onChange={(e) => {
                setHomeDir(e.target.value);
                setDirsChanged(true);
              }}
              placeholder="Default: OS home directory"
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Claude Directory Override
            </label>
            <Input
              value={claudeDir}
              onChange={(e) => {
                setClaudeDir(e.target.value);
                setDirsChanged(true);
              }}
              placeholder="Default: ~/.claude"
              className="font-mono text-sm"
            />
          </div>
        </div>
        {dirsChanged && (
          <Button
            size="sm"
            onClick={handleSaveDirs}
            disabled={updateSettings.isPending}
          >
            Save & Rescan
          </Button>
        )}

        <div className="h-px bg-border" />

        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Extra Scan Paths
        </h2>

        <PathList
          label="Extra MCP Config Files"
          icon={Server}
          paths={settings.scanPaths.extraMcpFiles}
          onAdd={(p) =>
            handlePathListChange("extraMcpFiles", [
              ...settings.scanPaths.extraMcpFiles,
              p,
            ])
          }
          onRemove={(i) =>
            handlePathListChange(
              "extraMcpFiles",
              settings.scanPaths.extraMcpFiles.filter((_, idx) => idx !== i)
            )
          }
        />

        <PathList
          label="Extra Project Directories"
          icon={FolderOpen}
          paths={settings.scanPaths.extraProjectDirs}
          onAdd={(p) =>
            handlePathListChange("extraProjectDirs", [
              ...settings.scanPaths.extraProjectDirs,
              p,
            ])
          }
          onRemove={(i) =>
            handlePathListChange(
              "extraProjectDirs",
              settings.scanPaths.extraProjectDirs.filter((_, idx) => idx !== i)
            )
          }
        />

        <PathList
          label="Extra Skill Directories"
          icon={Wand2}
          paths={settings.scanPaths.extraSkillDirs}
          onAdd={(p) =>
            handlePathListChange("extraSkillDirs", [
              ...settings.scanPaths.extraSkillDirs,
              p,
            ])
          }
          onRemove={(i) =>
            handlePathListChange(
              "extraSkillDirs",
              settings.scanPaths.extraSkillDirs.filter((_, idx) => idx !== i)
            )
          }
        />

        <PathList
          label="Extra Plugin Directories"
          icon={Puzzle}
          paths={settings.scanPaths.extraPluginDirs}
          onAdd={(p) =>
            handlePathListChange("extraPluginDirs", [
              ...settings.scanPaths.extraPluginDirs,
              p,
            ])
          }
          onRemove={(i) =>
            handlePathListChange(
              "extraPluginDirs",
              settings.scanPaths.extraPluginDirs.filter((_, idx) => idx !== i)
            )
          }
        />
      </CardContent>
    </Card>
  );
}

// ---- Tab: Config Files ----

function ConfigFilesTab() {
  const { data: configs } = useConfigSettings();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (content: unknown, id: string) => {
    navigator.clipboard.writeText(JSON.stringify(content, null, 2));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  if (!configs || configs.length === 0) {
    return (
      <EmptyState
        icon={FileJson}
        title="No configuration files found"
        description="Config files (settings.json, .mcp.json) will appear here once scanned"
      />
    );
  }

  return (
    <div className="space-y-4">
      {configs.map((config, i) => {
        const data = config.data;
        const content = (data.content as Record<string, unknown>) || {};
        const permissions = content.permissions as
          | { allow?: unknown[] }
          | undefined;
        const permCount = permissions?.allow?.length || 0;
        const hasHooks = !!content.hooks;
        const jsonStr = JSON.stringify(data.content, null, 2);

        return (
          <Card
            key={config.id}
            className="animate-fade-in-up"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileJson className="h-4 w-4" />
                  {config.name}
                </CardTitle>
                <div className="flex gap-2 items-center">
                  <Badge variant="secondary" className="text-xs">
                    {data.configType}
                  </Badge>
                  {permCount > 0 && (
                    <Badge
                      variant="outline"
                      className="text-[10px] border-green-500/30 text-green-400 gap-1"
                    >
                      <Shield className="h-2.5 w-2.5" />
                      {permCount} permissions
                    </Badge>
                  )}
                  {hasHooks && (
                    <Badge
                      variant="outline"
                      className="text-[10px] border-amber-500/30 text-amber-400"
                    >
                      hooks
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleCopy(data.content, config.id)}
                    aria-label="Copy JSON"
                  >
                    {copiedId === config.id ? (
                      <Check className="h-3 w-3 text-green-400" />
                    ) : (
                      <Copy className="h-3 w-3 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="bg-muted/50 border border-border/50 p-4 rounded-lg text-[11px] overflow-x-auto max-h-96 font-mono leading-relaxed">
                {colorizeJson(jsonStr)}
              </pre>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ---- Tab: Chat (providers + defaults) ----
//
// Two stacked sections: the ProviderManager (providers CRUD + OAuth) and a
// Global Chat Defaults form that writes `/api/settings/chat-defaults`. The
// defaults form reuses `useProviderModels` for its model dropdown so the
// user can only pick models the currently-selected provider actually
// exposes — keeping the server-side routing layer honest at form time
// rather than at send time.

function ChatDefaultsPanel() {
  const qc = useQueryClient();
  const { data: providers } = useQuery<ProviderConfig[]>({
    queryKey: ["/api/providers"],
  });
  const { data: defaults, isLoading } = useQuery<ChatGlobalDefaults>({
    queryKey: ["/api/settings/chat-defaults"],
    staleTime: 60_000,
  });

  const [providerId, setProviderId] = useState("");
  const [model, setModel] = useState("");
  const [effort, setEffort] = useState("medium");
  const [temperature, setTemperature] = useState<string>("1");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (defaults) {
      setProviderId(defaults.providerId);
      setModel(defaults.model);
      setEffort(defaults.effort ?? "medium");
      setTemperature(
        defaults.temperature !== undefined
          ? String(defaults.temperature)
          : "1",
      );
      setDirty(false);
    }
  }, [defaults]);

  // Models for the currently-selected default provider. We reuse the hook
  // the composer uses so cache hits are shared across the app — opening
  // settings doesn't double-fetch what the composer just loaded.
  const { models } = useProviderModels(providerId);

  const save = useMutation({
    mutationFn: async (payload: ChatGlobalDefaults) => {
      const res = await fetch("/api/settings/chat-defaults", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed: ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/settings/chat-defaults"] });
      setDirty(false);
      toast.success("Chat defaults saved");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSave = () => {
    if (!providerId || !model) {
      toast.error("Provider and model are required");
      return;
    }
    const tempNum = parseFloat(temperature);
    const payload: ChatGlobalDefaults = {
      providerId,
      model,
      effort: effort || undefined,
    };
    if (!Number.isNaN(tempNum)) payload.temperature = tempNum;
    save.mutate(payload);
  };

  if (isLoading) {
    return <div className="text-muted-foreground text-sm">Loading...</div>;
  }

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Global Chat Defaults
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Starting values for every new conversation. Tabs can override
            these per-conversation via the composer popover.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Default Provider */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Default Provider</label>
            <select
              value={providerId}
              onChange={(e) => {
                setProviderId(e.target.value);
                setDirty(true);
              }}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {(providers ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Default Model */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Default Model</label>
            <select
              value={model}
              onChange={(e) => {
                setModel(e.target.value);
                setDirty(true);
              }}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              {/* Show the stored model even if discovery hasn't returned it
                  — avoids wiping the field while the probe is in flight. */}
              {model && !models.some((m) => m.id === model) && (
                <option value={model}>{model}</option>
              )}
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* Default Effort */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Default Effort</label>
            <select
              value={effort}
              onChange={(e) => {
                setEffort(e.target.value);
                setDirty(true);
              }}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </div>

          {/* Default Temperature */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Default Temperature
            </label>
            <Input
              type="number"
              min="0"
              max="2"
              step="0.1"
              value={temperature}
              onChange={(e) => {
                setTemperature(e.target.value);
                setDirty(true);
              }}
              className="font-mono text-sm"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!dirty || save.isPending}
          >
            Save
          </Button>
          {dirty && (
            <span className="text-xs text-muted-foreground">
              Unsaved changes
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ChatTab() {
  return (
    <div className="space-y-6">
      <ProviderManager />
      <ChatDefaultsPanel />
    </div>
  );
}

// ---- Main Settings Page ----

export default function Settings() {
  const rescan = useRescan();
  const resetSettings = useResetSettings();
  const { data: configs } = useConfigSettings();

  const handleReset = () => {
    resetSettings.mutate(undefined, {
      onSuccess: () => rescan.mutate(),
    });
  };

  return (
    <PageContainer
      title="Settings"
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            disabled={resetSettings.isPending}
            className="gap-1.5 text-muted-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset Defaults
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => rescan.mutate()}
            disabled={rescan.isPending}
            className="gap-1.5"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${rescan.isPending ? "animate-spin" : ""}`}
            />
            Rescan
          </Button>
        </div>
      }
    >
      <Tabs defaultValue="general">
        <div className="overflow-x-auto whitespace-nowrap scrollbar-thin">
          <TabsList>
            <TabsTrigger value="general" className="whitespace-nowrap">General</TabsTrigger>
            <TabsTrigger value="scan-paths" className="whitespace-nowrap">Scan Paths</TabsTrigger>
            <TabsTrigger value="chat" className="whitespace-nowrap">Chat</TabsTrigger>
            <TabsTrigger value="workflows" className="whitespace-nowrap">Workflows</TabsTrigger>
            <TabsTrigger value="config-files" className="whitespace-nowrap">
              Config Files ({configs?.length || 0})
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="general" className="mt-4">
          <GeneralTab />
        </TabsContent>

        <TabsContent value="scan-paths" className="mt-4">
          <ScanPathsTab />
        </TabsContent>

        <TabsContent value="chat" className="mt-4">
          <ChatTab />
        </TabsContent>

        <TabsContent value="workflows" className="mt-4">
          <WorkflowConfigPanel />
        </TabsContent>

        <TabsContent value="config-files" className="mt-4">
          <ConfigFilesTab />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}

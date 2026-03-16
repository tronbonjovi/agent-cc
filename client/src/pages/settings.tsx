import { useState, useEffect } from "react";
import { useAppSettings, useUpdateSettings, useResetSettings } from "@/hooks/use-settings";
import { useRescan } from "@/hooks/use-entities";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Settings as SettingsIcon, RefreshCw, RotateCcw, Plus, X, FolderOpen, Server, Wand2, Puzzle } from "lucide-react";

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
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAdding(true)}>
            <Plus className="h-3 w-3 mr-1" />
            Add
          </Button>
        )}
      </div>
      {paths.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {paths.map((p, i) => (
            <Badge key={i} variant="secondary" className="text-xs font-mono gap-1 pr-1">
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
              if (e.key === "Escape") { setAdding(false); setNewPath(""); }
            }}
          />
          <Button size="sm" onClick={handleAdd} disabled={!newPath.trim()}>Add</Button>
          <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setNewPath(""); }}>Cancel</Button>
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const { data: settings, isLoading } = useAppSettings();
  const updateSettings = useUpdateSettings();
  const resetSettings = useResetSettings();
  const rescan = useRescan();

  const [appName, setAppName] = useState("");
  const [homeDir, setHomeDir] = useState("");
  const [claudeDir, setClaudeDir] = useState("");
  const [nameChanged, setNameChanged] = useState(false);
  const [dirsChanged, setDirsChanged] = useState(false);

  useEffect(() => {
    if (settings) {
      setAppName(settings.appName);
      setHomeDir(settings.scanPaths.homeDir || "");
      setClaudeDir(settings.scanPaths.claudeDir || "");
    }
  }, [settings]);

  const handleSaveName = () => {
    updateSettings.mutate({ appName: appName.trim() });
    setNameChanged(false);
  };

  const handleSaveDirs = () => {
    updateSettings.mutate({
      scanPaths: {
        ...settings!.scanPaths,
        homeDir: homeDir.trim() || null,
        claudeDir: claudeDir.trim() || null,
      },
    }, {
      onSuccess: () => rescan.mutate(),
    });
    setDirsChanged(false);
  };

  const handlePathListChange = (
    field: "extraMcpFiles" | "extraProjectDirs" | "extraSkillDirs" | "extraPluginDirs",
    newPaths: string[]
  ) => {
    updateSettings.mutate({
      scanPaths: { ...settings!.scanPaths, [field]: newPaths },
    }, {
      onSuccess: () => rescan.mutate(),
    });
  };

  const handleReset = () => {
    resetSettings.mutate(undefined, {
      onSuccess: () => rescan.mutate(),
    });
  };

  if (isLoading || !settings) {
    return (
      <div className="p-6">
        <div className="text-muted-foreground">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <SettingsIcon className="h-6 w-6" />
            Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Customize app name and configure where the scanner looks for entities
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => rescan.mutate()}
          disabled={rescan.isPending}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${rescan.isPending ? "animate-spin" : ""}`} />
          Rescan Now
        </Button>
      </div>

      {/* General */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">General</h2>
          <div className="space-y-2">
            <label className="text-sm font-medium">App Name</label>
            <div className="flex items-center gap-2">
              <Input
                value={appName}
                onChange={(e) => { setAppName(e.target.value); setNameChanged(e.target.value !== settings.appName); }}
                maxLength={50}
                className="max-w-xs"
                onKeyDown={(e) => { if (e.key === "Enter" && nameChanged) handleSaveName(); }}
              />
              {nameChanged && (
                <Button size="sm" onClick={handleSaveName} disabled={!appName.trim() || updateSettings.isPending}>
                  Save
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Displayed in the sidebar and browser tab</p>
          </div>
        </CardContent>
      </Card>

      {/* Scan Paths */}
      <Card>
        <CardContent className="p-5 space-y-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Scan Paths</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Home Directory Override</label>
              <Input
                value={homeDir}
                onChange={(e) => { setHomeDir(e.target.value); setDirsChanged(true); }}
                placeholder="Default: OS home directory"
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Claude Directory Override</label>
              <Input
                value={claudeDir}
                onChange={(e) => { setClaudeDir(e.target.value); setDirsChanged(true); }}
                placeholder="Default: ~/.claude"
                className="font-mono text-sm"
              />
            </div>
          </div>
          {dirsChanged && (
            <Button size="sm" onClick={handleSaveDirs} disabled={updateSettings.isPending}>
              Save & Rescan
            </Button>
          )}

          <div className="h-px bg-border" />

          <PathList
            label="Extra MCP Config Files"
            icon={Server}
            paths={settings.scanPaths.extraMcpFiles}
            onAdd={(p) => handlePathListChange("extraMcpFiles", [...settings.scanPaths.extraMcpFiles, p])}
            onRemove={(i) => handlePathListChange("extraMcpFiles", settings.scanPaths.extraMcpFiles.filter((_, idx) => idx !== i))}
          />

          <PathList
            label="Extra Project Directories"
            icon={FolderOpen}
            paths={settings.scanPaths.extraProjectDirs}
            onAdd={(p) => handlePathListChange("extraProjectDirs", [...settings.scanPaths.extraProjectDirs, p])}
            onRemove={(i) => handlePathListChange("extraProjectDirs", settings.scanPaths.extraProjectDirs.filter((_, idx) => idx !== i))}
          />

          <PathList
            label="Extra Skill Directories"
            icon={Wand2}
            paths={settings.scanPaths.extraSkillDirs}
            onAdd={(p) => handlePathListChange("extraSkillDirs", [...settings.scanPaths.extraSkillDirs, p])}
            onRemove={(i) => handlePathListChange("extraSkillDirs", settings.scanPaths.extraSkillDirs.filter((_, idx) => idx !== i))}
          />

          <PathList
            label="Extra Plugin Directories"
            icon={Puzzle}
            paths={settings.scanPaths.extraPluginDirs}
            onAdd={(p) => handlePathListChange("extraPluginDirs", [...settings.scanPaths.extraPluginDirs, p])}
            onRemove={(i) => handlePathListChange("extraPluginDirs", settings.scanPaths.extraPluginDirs.filter((_, idx) => idx !== i))}
          />
        </CardContent>
      </Card>

      {/* Reset */}
      <div className="flex justify-end">
        <Button variant="outline" onClick={handleReset} disabled={resetSettings.isPending} className="gap-2 text-muted-foreground">
          <RotateCcw className="h-3.5 w-3.5" />
          Reset to Defaults
        </Button>
      </div>
    </div>
  );
}

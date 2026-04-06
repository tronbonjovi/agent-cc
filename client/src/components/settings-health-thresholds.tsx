import { useState, useEffect } from "react";
import { useAppSettings, useUpdateSettings } from "@/hooks/use-settings";
import { Card, CardContent } from "@/components/ui/card";
import type { SessionHealthThresholds } from "@shared/types";

const defaultThresholds: SessionHealthThresholds = {
  context: { yellow: 20, red: 50 },
  cost: { yellow: 3, red: 5 },
  messages: { yellow: 30, red: 60 },
  dataSize: { yellow: 500, red: 2000 },
};

function ThresholdRow({
  label,
  unit,
  yellow,
  red,
  onYellowChange,
  onRedChange,
}: {
  label: string;
  unit: string;
  yellow: number;
  red: number;
  onYellowChange: (v: number) => void;
  onRedChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-4">
      <span className="text-sm text-muted-foreground w-24">{label}</span>
      <div className="flex items-center gap-2">
        <label className="text-xs text-amber-400">Yellow</label>
        <input
          type="number"
          className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm font-mono"
          value={yellow}
          min={0}
          onChange={(e) => onYellowChange(Number(e.target.value))}
        />
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-red-400">Red</label>
        <input
          type="number"
          className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm font-mono"
          value={red}
          min={0}
          onChange={(e) => onRedChange(Number(e.target.value))}
        />
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}

export function HealthThresholdsSettings() {
  const { data: settings } = useAppSettings();
  const updateSettings = useUpdateSettings();
  const [thresholds, setThresholds] = useState<SessionHealthThresholds>(defaultThresholds);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (settings?.healthThresholds) {
      setThresholds(settings.healthThresholds);
    }
  }, [settings?.healthThresholds]);

  function update(metric: keyof SessionHealthThresholds, level: "yellow" | "red", value: number) {
    setThresholds((prev) => ({
      ...prev,
      [metric]: { ...prev[metric], [level]: value },
    }));
    setDirty(true);
  }

  function save() {
    for (const key of ["context", "cost", "messages", "dataSize"] as const) {
      if (thresholds[key].yellow >= thresholds[key].red) {
        return;
      }
    }
    updateSettings.mutate({ healthThresholds: thresholds });
    setDirty(false);
  }

  function reset() {
    setThresholds(defaultThresholds);
    updateSettings.mutate({ healthThresholds: defaultThresholds });
    setDirty(false);
  }

  return (
    <Card className="rounded-xl border bg-card">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Session Health Thresholds</h3>
            <p className="text-xs text-muted-foreground">
              Configure when health indicators change from green → yellow → red
            </p>
          </div>
          <button
            onClick={reset}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Reset to defaults
          </button>
        </div>
        <div className="space-y-3">
          <ThresholdRow
            label="Context %"
            unit="%"
            yellow={thresholds.context.yellow}
            red={thresholds.context.red}
            onYellowChange={(v) => update("context", "yellow", v)}
            onRedChange={(v) => update("context", "red", v)}
          />
          <ThresholdRow
            label="Cost"
            unit="USD"
            yellow={thresholds.cost.yellow}
            red={thresholds.cost.red}
            onYellowChange={(v) => update("cost", "yellow", v)}
            onRedChange={(v) => update("cost", "red", v)}
          />
          <ThresholdRow
            label="Messages"
            unit="msgs"
            yellow={thresholds.messages.yellow}
            red={thresholds.messages.red}
            onYellowChange={(v) => update("messages", "yellow", v)}
            onRedChange={(v) => update("messages", "red", v)}
          />
          <ThresholdRow
            label="Data Size"
            unit="KB"
            yellow={thresholds.dataSize.yellow}
            red={thresholds.dataSize.red}
            onYellowChange={(v) => update("dataSize", "yellow", v)}
            onRedChange={(v) => update("dataSize", "red", v)}
          />
        </div>
        {dirty && (
          <button
            onClick={save}
            className="rounded-md bg-blue-500/10 border border-blue-500/30 px-3 py-1.5 text-sm text-blue-400 hover:bg-blue-500/20 transition-colors"
          >
            Save Thresholds
          </button>
        )}
      </CardContent>
    </Card>
  );
}

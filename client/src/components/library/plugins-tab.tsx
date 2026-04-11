import { useState } from "react";
import { useEntities, useRescan } from "@/hooks/use-entities";
import { useLibraryItems, useInstallItem, useUninstallItem, useRemoveItem } from "@/hooks/use-library";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Puzzle, Store, ShieldAlert, ShieldCheck, Server, ShoppingBag, RefreshCw, Settings } from "lucide-react";
import { EntityCard } from "@/components/library/entity-card";
import type { EntityCardStatus } from "@/components/library/entity-card";
import type { PluginEntity } from "@shared/types";

type SubTab = "installed" | "library" | "discover";

const CATEGORY_LABELS: Record<string, string> = {
  "dev-tools": "Developer Tools",
  integration: "Integrations",
  ai: "AI & ML",
  browser: "Browser",
  productivity: "Productivity",
  "code-quality": "Code Quality",
  lsp: "Language Servers (LSP)",
};

export default function PluginsTab() {
  const { data: plugins, isLoading } = useEntities<PluginEntity>("plugin");
  const rescan = useRescan();
  const [, setLocation] = useLocation();
  const [subTab, setSubTab] = useState<SubTab>("installed");

  const marketplaces = (plugins || []).filter((p) => p.tags.includes("marketplace"));
  const blocked = (plugins || []).filter((p) => !p.tags.includes("marketplace") && p.data.blocked);
  const active = (plugins || []).filter((p) => !p.tags.includes("marketplace") && !p.data.blocked);

  // Three-tier: active = installed, blocked = still installed but degraded
  const installed = [...active, ...blocked];
  const { data: libraryItems } = useLibraryItems<PluginEntity>("plugins");
  const installItem = useInstallItem();
  const uninstallItem = useUninstallItem();
  const removeItem = useRemoveItem();

  const handleRemove = (type: string, name: string) => {
    if (window.confirm(`Remove "${name}" from your library? This cannot be undone.`)) {
      removeItem.mutate({ type, id: name });
    }
  };

  const buildTags = (plugin: PluginEntity): string[] => {
    const tags: string[] = [];
    if (plugin.data.category) tags.push(CATEGORY_LABELS[plugin.data.category] || plugin.data.category);
    if (plugin.data.hasMCP) tags.push("MCP");
    if (plugin.data.blocked) tags.push("blocked");
    if (plugin.data.marketplace) tags.push(`@${plugin.data.marketplace}`);
    return tags;
  };

  const getStatus = (plugin: PluginEntity): EntityCardStatus => {
    return "installed";
  };

  const getHealth = (plugin: PluginEntity) => {
    if (plugin.data.blocked) return "error" as const;
    if (plugin.health === "warning") return "degraded" as const;
    if (plugin.health === "error") return "error" as const;
    return "healthy" as const;
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Plugins extend Claude Code with skills, commands, hooks, and MCP servers
      </p>

      {/* Summary bar */}
      {!isLoading && (active.length > 0 || blocked.length > 0) && (
        <div className="flex items-center gap-2">
          <Badge className="bg-green-500/10 text-green-400 border-green-500/20 gap-1">
            <ShieldCheck className="h-3 w-3" />
            {active.length} active
          </Badge>
          {blocked.length > 0 && (
            <Badge className="bg-red-500/10 text-red-400 border-red-500/20 gap-1">
              <ShieldAlert className="h-3 w-3" />
              {blocked.length} blocked
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">
            across {marketplaces.length} marketplace{marketplaces.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {(["installed", "library", "discover"] as const).map(t => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              subTab === t
                ? "border-blue-500 text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "installed" ? "Installed" : t === "library" ? "Library" : "Discover"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">Loading plugins...</div>
      ) : (
        <>
          {subTab === "installed" && (
            <>
              {installed.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-card">
                  {installed.map((plugin) => (
                    <EntityCard
                      key={plugin.id}
                      icon={
                        plugin.data.blocked
                          ? <ShieldAlert className="h-4 w-4 text-red-400" />
                          : <Puzzle className="h-4 w-4 text-entity-plugin" />
                      }
                      name={plugin.name}
                      description={plugin.description ?? undefined}
                      status={getStatus(plugin)}
                      health={getHealth(plugin)}
                      tags={buildTags(plugin)}
                      actions={[
                        {
                          label: "Uninstall",
                          onClick: () => uninstallItem.mutate({ type: "plugins", id: plugin.name }),
                          variant: "ghost" as const,
                        },
                      ]}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <Puzzle className="h-10 w-10 text-muted-foreground/30" />
                  <div className="text-center space-y-1">
                    <p className="text-muted-foreground font-medium">No installed plugins</p>
                    <p className="text-xs text-muted-foreground/70">
                      Scanner looks in ~/.claude/plugins/ for marketplaces and blocklist
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => rescan.mutate()} disabled={rescan.isPending} className="gap-1.5">
                      <RefreshCw className={`h-3.5 w-3.5 ${rescan.isPending ? "animate-spin" : ""}`} />
                      Rescan
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setLocation("/settings")} className="gap-1.5">
                      <Settings className="h-3.5 w-3.5" />
                      Configure Paths
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          {subTab === "library" && (
            (libraryItems && libraryItems.length > 0) ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-card">
                {libraryItems.map((item) => (
                  <EntityCard
                    key={item.id}
                    icon={<Puzzle className="h-4 w-4 text-entity-plugin" />}
                    name={item.name}
                    description={item.description ?? undefined}
                    status="saved"
                    tags={["library"]}
                    actions={[
                      {
                        label: "Install",
                        onClick: () => installItem.mutate({ type: "plugins", id: item.name }),
                        variant: "default" as const,
                      },
                      {
                        label: "Remove",
                        onClick: () => handleRemove("plugins", item.name),
                        variant: "destructive" as const,
                      },
                    ]}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground/60">No items in your library — uninstall plugins or save from Discover</p>
            )
          )}

          {subTab === "discover" && (
            <div className="space-y-4">
              {marketplaces.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground/60 uppercase tracking-wider font-medium flex items-center gap-1.5 mb-2">
                    <Store className="h-3 w-3" /> Installed Marketplaces
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-card">
                    {marketplaces.map((mkt) => (
                      <EntityCard
                        key={mkt.id}
                        icon={<Store className="h-4 w-4 text-entity-plugin" />}
                        name={mkt.name}
                        description={mkt.description ?? undefined}
                        status="installed"
                        health={mkt.health === "ok" ? "healthy" : mkt.health === "warning" ? "degraded" : mkt.health === "error" ? "error" : undefined}
                        tags={["marketplace"]}
                      />
                    ))}
                  </div>
                </div>
              )}
              <div className="rounded-lg border border-dashed border-muted-foreground/20 p-6 text-center">
                <ShoppingBag className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Search coming soon</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Discover and install community plugins</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

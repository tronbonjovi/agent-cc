import { useEntities, useRescan } from "@/hooks/use-entities";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Puzzle, Store, ShieldAlert, ShieldCheck, Server, Package, ShoppingBag, RefreshCw, Settings } from "lucide-react";
import { EntityCard } from "@/components/library/entity-card";
import type { EntityCardStatus } from "@/components/library/entity-card";
import type { PluginEntity } from "@shared/types";

const CATEGORY_LABELS: Record<string, string> = {
  "dev-tools": "Developer Tools",
  integration: "Integrations",
  ai: "AI & ML",
  browser: "Browser",
  productivity: "Productivity",
  "code-quality": "Code Quality",
  lsp: "Language Servers (LSP)",
};

/** Section heading for three-tier layout */
function TierHeading({ icon: Icon, label, count }: { icon: React.ComponentType<{ className?: string }>; label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <h2 className="text-sm font-semibold">{label}</h2>
      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{count}</Badge>
    </div>
  );
}

export default function PluginsTab() {
  const { data: plugins, isLoading } = useEntities<PluginEntity>("plugin");
  const rescan = useRescan();
  const [, setLocation] = useLocation();

  const marketplaces = (plugins || []).filter((p) => p.tags.includes("marketplace"));
  const blocked = (plugins || []).filter((p) => !p.tags.includes("marketplace") && p.data.blocked);
  const active = (plugins || []).filter((p) => !p.tags.includes("marketplace") && !p.data.blocked);

  // Three-tier: active = installed, blocked = still installed but degraded
  // No API distinction for saved-but-inactive plugins
  const installed = [...active, ...blocked];
  const saved: PluginEntity[] = [];

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

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">Loading plugins...</div>
      ) : (
        <div className="space-y-8">
          {/* --- Installed --- */}
          <section>
            <TierHeading icon={Puzzle} label="Installed" count={installed.length} />

            {/* Marketplaces within installed section */}
            {marketplaces.length > 0 && (
              <div className="mb-4 space-y-2">
                <p className="text-xs text-muted-foreground/60 uppercase tracking-wider font-medium flex items-center gap-1.5 mb-2">
                  <Store className="h-3 w-3" /> Marketplaces
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
          </section>

          {/* --- Saved --- */}
          <section>
            <TierHeading icon={Package} label="Saved" count={saved.length} />
            {saved.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-card">
                {saved.map((plugin) => (
                  <EntityCard
                    key={plugin.id}
                    icon={<Puzzle className="h-4 w-4 text-entity-plugin" />}
                    name={plugin.name}
                    description={plugin.description ?? undefined}
                    status="saved"
                    tags={buildTags(plugin)}
                    actions={[{ label: "Enable", onClick: () => {} }]}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground/60 pl-6">No saved plugins — all discovered plugins are currently active</p>
            )}
          </section>

          {/* --- Marketplace --- */}
          <section>
            <TierHeading icon={ShoppingBag} label="Marketplace" count={0} />
            <div className="rounded-lg border border-dashed border-muted-foreground/20 p-6 text-center">
              <ShoppingBag className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Marketplace coming soon</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Browse and install community plugins</p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

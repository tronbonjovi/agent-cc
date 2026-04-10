import { useEntities, useRescan } from "@/hooks/use-entities";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useLocation } from "wouter";
import { Search, Server, Copy, Check, ExternalLink, ChevronDown, ChevronRight, Package, ShoppingBag, RefreshCw, Settings } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { ListSkeleton } from "@/components/skeleton";
import { EntityCard } from "@/components/library/entity-card";
import type { EntityCardStatus, EntityCardHealth } from "@/components/library/entity-card";
import type { MCPEntity } from "@shared/types";

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

export default function McpsTab() {
  const { data: mcps, isLoading } = useEntities<MCPEntity>("mcp");
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const rescan = useRescan();
  const [, setLocation] = useLocation();

  const filtered = (mcps || []).filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.path.toLowerCase().includes(search.toLowerCase()) ||
      m.description?.toLowerCase().includes(search.toLowerCase())
  );

  // Three-tier: all configured MCPs are "installed"
  const installed = filtered;
  const saved: MCPEntity[] = [];

  const handleCopyCommand = (mcp: MCPEntity, e: React.MouseEvent) => {
    e.stopPropagation();
    const cmd = mcp.data.command ? `${mcp.data.command} ${(mcp.data.args || []).join(" ")}` : mcp.data.url || "";
    navigator.clipboard.writeText(cmd.trim());
    setCopiedId(mcp.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleOpenSource = async (sourcePath: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiRequest("POST", "/api/actions/open-file", { path: sourcePath });
    } catch {}
  };

  const mapHealth = (mcp: MCPEntity): EntityCardHealth | undefined => {
    if (mcp.health === "ok") return "healthy";
    if (mcp.health === "warning") return "degraded";
    if (mcp.health === "error") return "error";
    return undefined;
  };

  const buildTags = (mcp: MCPEntity): string[] => {
    const tags: string[] = [];
    tags.push(mcp.data.transport);
    if (mcp.data.category) tags.push(mcp.data.category);
    return tags;
  };

  const buildActions = (mcp: MCPEntity) => {
    const actions = [];
    actions.push({
      label: copiedId === mcp.id ? "Copied" : "Copy cmd",
      onClick: () => {
        const cmd = mcp.data.command ? `${mcp.data.command} ${(mcp.data.args || []).join(" ")}` : mcp.data.url || "";
        navigator.clipboard.writeText(cmd.trim());
        setCopiedId(mcp.id);
        setTimeout(() => setCopiedId(null), 1500);
      },
      variant: "ghost" as const,
    });
    actions.push({
      label: "Source",
      onClick: () => {
        apiRequest("POST", "/api/actions/open-file", { path: mcp.data.sourceFile }).catch(() => {});
      },
      variant: "ghost" as const,
    });
    return actions;
  };

  const renderMcpCard = (mcp: MCPEntity, status: EntityCardStatus) => {
    const isExpanded = expanded === mcp.id;
    return (
      <div key={mcp.id}>
        <EntityCard
          icon={<Server className="h-4 w-4 text-entity-mcp" />}
          name={mcp.name}
          description={mcp.description ?? undefined}
          status={status}
          health={mapHealth(mcp)}
          tags={buildTags(mcp)}
          actions={buildActions(mcp)}
          onClick={() => setExpanded(isExpanded ? null : mcp.id)}
        />
        {isExpanded && mcp.data.capabilities && mcp.data.capabilities.length > 0 && (
          <div className="mt-1 ml-2 p-3 bg-muted rounded-md border border-border/50">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Capabilities</span>
            <ul className="mt-1.5 space-y-1">
              {mcp.data.capabilities.map((cap: string, idx: number) => (
                <li key={idx} className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <span className="text-entity-mcp mt-0.5">-</span>
                  {cap}
                </li>
              ))}
            </ul>
            {mcp.data.website && (
              <a
                href={mcp.data.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 mt-2"
                onClick={(e) => e.stopPropagation()}
              >
                {mcp.data.website} <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {filtered.length} servers configured
        </p>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search MCPs..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : (
        <div className="space-y-8">
          {/* --- Installed --- */}
          <section>
            <TierHeading icon={Server} label="Installed" count={installed.length} />
            {installed.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-card">
                {installed.map((mcp) => renderMcpCard(mcp, "installed"))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <Server className="h-10 w-10 text-muted-foreground/30" />
                <div className="text-center space-y-1">
                  <p className="text-muted-foreground font-medium">No installed MCP servers</p>
                  <p className="text-xs text-muted-foreground/70">
                    Scanner looks in ~/.mcp.json, project .mcp.json files, and plugin directories
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
                {saved.map((mcp) => renderMcpCard(mcp, "saved"))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground/60 pl-6">No saved MCP servers — all configured servers are currently active</p>
            )}
          </section>

          {/* --- Marketplace --- */}
          <section>
            <TierHeading icon={ShoppingBag} label="Marketplace" count={0} />
            <div className="rounded-lg border border-dashed border-muted-foreground/20 p-6 text-center">
              <ShoppingBag className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Marketplace coming soon</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Browse community MCP servers at{" "}
                <a href="https://mcp.so" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
                  mcp.so
                </a>
              </p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

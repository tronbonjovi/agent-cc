import { useEntities, useRescan } from "@/hooks/use-entities";
import { useLibraryItems, useInstallItem, useUninstallItem, useRemoveItem } from "@/hooks/use-library";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useLocation } from "wouter";
import { Search, Wand2, Terminal, ChevronDown, ChevronRight, Copy, Check, Edit3, FolderOpen, RefreshCw, Settings, ShoppingBag } from "lucide-react";
import { ListSkeleton } from "@/components/skeleton";
import { EntityCard } from "@/components/library/entity-card";
import type { EntityCardStatus } from "@/components/library/entity-card";
import type { SkillEntity, MarkdownEntity } from "@shared/types";

type SubTab = "installed" | "library" | "discover";

function formatPreview(content: string): string {
  const lines = content.split("\n");
  const paragraphs: string[] = [];
  let current = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      if (current) {
        paragraphs.push(current.trim());
        current = "";
      }
    } else if (!trimmed.startsWith("#") && !trimmed.startsWith("---")) {
      current += (current ? " " : "") + trimmed;
    }
  }
  if (current) paragraphs.push(current.trim());
  return paragraphs.slice(0, 3).join("\n\n") || content.slice(0, 300);
}

export default function SkillsTab() {
  const { data: skills, isLoading } = useEntities<SkillEntity>("skill");
  const { data: markdowns } = useEntities<MarkdownEntity>("markdown");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<SubTab>("installed");
  const [, setLocation] = useLocation();
  const rescan = useRescan();

  const filtered = (skills || [])
    .filter(
      (s) =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.description?.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      const aInv = a.data.userInvocable ? 1 : 0;
      const bInv = b.data.userInvocable ? 1 : 0;
      if (bInv !== aInv) return bInv - aInv;
      return a.name.localeCompare(b.name);
    });

  // All discovered skills from the scanner are "installed" (active on disk)
  const installed = filtered;
  const { data: libraryItems } = useLibraryItems<SkillEntity>("skills");
  const installItem = useInstallItem();
  const uninstallItem = useUninstallItem();
  const removeItem = useRemoveItem();

  const invocableCount = filtered.filter((s) => s.data.userInvocable).length;

  const handleCopy = (name: string, id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(`/${name}`);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const findMarkdownId = (skillPath: string) => {
    if (!markdowns) return null;
    const normalizedSkillPath = skillPath.replace(/\\/g, "/");
    return markdowns.find((m) => m.path.replace(/\\/g, "/") === normalizedSkillPath)?.id ?? null;
  };

  const handleEdit = (skill: SkillEntity, e: React.MouseEvent) => {
    e.stopPropagation();
    const mdId = findMarkdownId(skill.path);
    if (mdId) {
      setLocation(`/markdown/${mdId}`);
    }
  };

  const buildTags = (skill: SkillEntity): string[] => {
    const tags: string[] = [];
    if (skill.data.userInvocable) tags.push("invocable");
    const projectName = (skill.data as Record<string, unknown>).projectName as string | undefined;
    if (projectName) tags.push(projectName);
    if (skill.data.args) tags.push("has args");
    return tags;
  };

  const buildActions = (skill: SkillEntity) => {
    const actions = [];
    actions.push({
      label: "Uninstall",
      onClick: () => uninstallItem.mutate({ type: "skills", id: skill.name }),
      variant: "ghost" as const,
    });
    const mdId = findMarkdownId(skill.path);
    if (mdId) {
      actions.push({
        label: "Edit",
        onClick: () => {
          const id = findMarkdownId(skill.path);
          if (id) setLocation(`/markdown/${id}`);
        },
        variant: "ghost" as const,
      });
    }
    actions.push({
      label: copiedId === skill.id ? "Copied" : "Copy",
      onClick: () => {
        navigator.clipboard.writeText(`/${skill.name}`);
        setCopiedId(skill.id);
        setTimeout(() => setCopiedId(null), 1500);
      },
      variant: "ghost" as const,
    });
    return actions;
  };

  const handleRemove = (type: string, name: string) => {
    if (window.confirm(`Remove "${name}" from your library? This cannot be undone.`)) {
      removeItem.mutate({ type, id: name });
    }
  };

  const buildLibraryActions = (item: SkillEntity) => {
    return [
      {
        label: "Install",
        onClick: () => installItem.mutate({ type: "skills", id: item.name }),
        variant: "default" as const,
      },
      {
        label: "Remove",
        onClick: () => handleRemove("skills", item.name),
        variant: "destructive" as const,
      },
    ];
  };

  const renderSkillCard = (skill: SkillEntity, status: EntityCardStatus) => {
    const isExpanded = expanded === skill.id;
    return (
      <div key={skill.id}>
        <EntityCard
          icon={<Wand2 className="h-4 w-4 text-entity-skill" />}
          name={`/${skill.name}`}
          description={skill.description ?? undefined}
          status={status}
          tags={buildTags(skill)}
          actions={buildActions(skill)}
          onClick={() => setExpanded(isExpanded ? null : skill.id)}
        />
        {isExpanded && skill.data.content && (
          <div className="mt-1 ml-2 p-3 bg-muted rounded-md text-[11px] overflow-x-auto max-h-64 whitespace-pre-wrap leading-relaxed border border-border/50">
            {formatPreview(skill.data.content)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {invocableCount} invocable, {filtered.length} total
        </p>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search skills..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

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
        <ListSkeleton rows={6} />
      ) : (
        <>
          {subTab === "installed" && (
            installed.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-card">
                {installed.map((skill) => renderSkillCard(skill, "installed"))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <Wand2 className="h-10 w-10 text-muted-foreground/30" />
                <div className="text-center space-y-1">
                  <p className="text-muted-foreground font-medium">No installed skills</p>
                  <p className="text-xs text-muted-foreground/70">
                    Scanner looks in ~/.claude/skills/ for SKILL.md files
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
            )
          )}

          {subTab === "library" && (
            (libraryItems && libraryItems.length > 0) ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-card">
                {libraryItems.map((item) => (
                  <EntityCard
                    key={item.id}
                    icon={<Wand2 className="h-4 w-4 text-entity-skill" />}
                    name={item.name}
                    description={item.description ?? undefined}
                    status="saved"
                    tags={["library"]}
                    actions={buildLibraryActions(item)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground/60">No items in your library — uninstall skills or save from Discover</p>
            )
          )}

          {subTab === "discover" && (
            <div className="rounded-lg border border-dashed border-muted-foreground/20 p-6 text-center">
              <ShoppingBag className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Search coming soon</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Discover and install community skills</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

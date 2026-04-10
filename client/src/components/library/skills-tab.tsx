import { useEntities, useRescan } from "@/hooks/use-entities";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useLocation } from "wouter";
import { Search, Wand2, Terminal, ChevronDown, ChevronRight, Copy, Check, Edit3, FolderOpen, RefreshCw, Settings, Package, ShoppingBag } from "lucide-react";
import { ListSkeleton } from "@/components/skeleton";
import { EntityCard } from "@/components/library/entity-card";
import type { EntityCardStatus } from "@/components/library/entity-card";
import type { SkillEntity, MarkdownEntity } from "@shared/types";

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

export default function SkillsTab() {
  const { data: skills, isLoading } = useEntities<SkillEntity>("skill");
  const { data: markdowns } = useEntities<MarkdownEntity>("markdown");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
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

  // Three-tier split: all discovered skills are "installed" (active on disk)
  // No API distinction for saved-but-inactive skills currently
  const installed = filtered;
  const saved: SkillEntity[] = [];

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

      {isLoading ? (
        <ListSkeleton rows={6} />
      ) : (
        <div className="space-y-8">
          {/* --- Installed --- */}
          <section>
            <TierHeading icon={Wand2} label="Installed" count={installed.length} />
            {installed.length > 0 ? (
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
            )}
          </section>

          {/* --- Saved --- */}
          <section>
            <TierHeading icon={Package} label="Saved" count={saved.length} />
            {saved.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-card">
                {saved.map((skill) => renderSkillCard(skill, "saved"))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground/60 pl-6">No saved skills — all discovered skills are currently active</p>
            )}
          </section>

          {/* --- Marketplace --- */}
          <section>
            <TierHeading icon={ShoppingBag} label="Marketplace" count={0} />
            <div className="rounded-lg border border-dashed border-muted-foreground/20 p-6 text-center">
              <ShoppingBag className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Marketplace coming soon</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Browse and install community skills</p>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

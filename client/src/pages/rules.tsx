import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PageSkeleton } from "@/components/skeleton";
import {
  FileText,
  Wand2,
  Server,
  Settings,
  GitBranch,
  Brain,
  Globe,
  ExternalLink,
} from "lucide-react";
import { useLocation } from "wouter";

interface ProjectRules {
  claudeMd: string | null;
  claudeMdId: string | null;
  projectSettings: object | null;
  globalSettings: object | null;
  skills: { name: string; markdownId: string }[];
  hooks: { project: object | null; global: object | null };
  mcpServers: { project: object | null; global: object | null };
  memoryFiles: { name: string; markdownId: string }[];
}

interface ProjectRulesEntry {
  id: string;
  name: string;
  path: string;
  rules: ProjectRules;
}

function SectionHeader({
  icon: Icon,
  label,
  color,
}: {
  icon: React.ElementType;
  label: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <Icon className={`h-4 w-4 ${color}`} />
      <span className="text-sm font-semibold">{label}</span>
    </div>
  );
}

function CodeBlock({ content }: { content: string }) {
  return (
    <pre className="bg-muted/50 border border-border/50 rounded-md p-3 text-[11px] font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap break-words">
      {content}
    </pre>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-xs text-muted-foreground/60 italic">{text}</p>;
}

function ClaudeMdSection({ content, markdownId, onNavigate }: { content: string | null; markdownId: string | null; onNavigate: (path: string) => void }) {
  return (
    <div className="border-l-[3px] border-l-blue-500/50 pl-3 space-y-2">
      <div className="flex items-center justify-between">
        <SectionHeader icon={FileText} label="CLAUDE.md" color="text-blue-400" />
        {markdownId && (
          <button
            onClick={() => onNavigate(`/markdown/${markdownId}`)}
            className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
          >
            <ExternalLink className="h-3 w-3" /> Open
          </button>
        )}
      </div>
      {content ? (
        <ScrollArea className="max-h-72">
          <pre
            className="bg-muted/50 border border-border/50 rounded-md p-3 text-[11px] font-mono leading-relaxed whitespace-pre-wrap break-words cursor-pointer hover:border-blue-500/30 transition-colors"
            onClick={() => markdownId && onNavigate(`/markdown/${markdownId}`)}
          >
            {content}
          </pre>
        </ScrollArea>
      ) : (
        <EmptyState text="No CLAUDE.md" />
      )}
    </div>
  );
}

function SkillsSection({ skills, onNavigate }: { skills: { name: string; markdownId: string }[]; onNavigate: (path: string) => void }) {
  return (
    <div className="border-l-[3px] border-l-orange-500/50 pl-3 space-y-2">
      <SectionHeader icon={Wand2} label="Skills" color="text-orange-400" />
      {skills.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {skills.map((skill) => (
            <Badge
              key={skill.name}
              variant="outline"
              className="text-[10px] border-orange-500/30 text-orange-400 cursor-pointer hover:bg-orange-500/10 transition-colors"
              onClick={() => onNavigate(`/markdown/${skill.markdownId}`)}
            >
              {skill.name}
              <ExternalLink className="h-2.5 w-2.5 ml-1 opacity-50" />
            </Badge>
          ))}
        </div>
      ) : (
        <EmptyState text="No project skills" />
      )}
    </div>
  );
}

function McpServersSection({ servers }: { servers: object | null }) {
  return (
    <div className="border-l-[3px] border-l-green-500/50 pl-3 space-y-2">
      <SectionHeader
        icon={Server}
        label="MCP Servers"
        color="text-green-400"
      />
      {servers ? (
        <div className="space-y-1">
          {Object.entries(servers).map(([name, config]) => (
            <div key={name} className="flex items-start gap-2 text-xs">
              <Server className="h-3 w-3 mt-0.5 text-green-400/60 flex-shrink-0" />
              <div>
                <span className="font-medium">{name}</span>
                {config &&
                  typeof config === "object" &&
                  "command" in config && (
                    <span className="text-muted-foreground ml-1.5 font-mono text-[10px]">
                      {String((config as any).command)}
                    </span>
                  )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState text="No project MCP servers" />
      )}
    </div>
  );
}

function ProjectSettingsSection({ settings }: { settings: object | null }) {
  return (
    <div className="border-l-[3px] border-l-purple-500/50 pl-3 space-y-2">
      <SectionHeader
        icon={Settings}
        label="Project Settings"
        color="text-purple-400"
      />
      {settings ? (
        <CodeBlock content={JSON.stringify(settings, null, 2)} />
      ) : (
        <EmptyState text="Using global settings only" />
      )}
    </div>
  );
}

function HooksSection({ hooks }: { hooks: object | null }) {
  return (
    <div className="border-l-[3px] border-l-teal-500/50 pl-3 space-y-2">
      <SectionHeader icon={GitBranch} label="Hooks" color="text-teal-400" />
      {hooks ? (
        <CodeBlock content={JSON.stringify(hooks, null, 2)} />
      ) : (
        <EmptyState text="No project hooks" />
      )}
    </div>
  );
}

function MemoryFilesSection({ files, onNavigate }: { files: { name: string; markdownId: string }[]; onNavigate: (path: string) => void }) {
  return (
    <div className="border-l-[3px] border-l-pink-500/50 pl-3 space-y-2">
      <SectionHeader
        icon={Brain}
        label="Memory Files"
        color="text-pink-400"
      />
      {files.length > 0 ? (
        <ul className="space-y-1">
          {files.map((file) => (
            <li
              key={file.name}
              className="text-xs font-mono text-muted-foreground flex items-center gap-1.5 cursor-pointer hover:text-pink-400 transition-colors"
              onClick={() => onNavigate(`/markdown/${file.markdownId}`)}
            >
              <FileText className="h-3 w-3 text-pink-400/60 flex-shrink-0" />
              {file.name}
              <ExternalLink className="h-2.5 w-2.5 opacity-40" />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState text="No memory files" />
      )}
    </div>
  );
}

function GlobalSection({ projects }: { projects: ProjectRulesEntry[] }) {
  // Aggregate global data from the first project that has it
  const globalSettings = projects.find((p) => p.rules.globalSettings)?.rules
    .globalSettings;
  const globalMcpServers = projects.find(
    (p) => p.rules.mcpServers.global
  )?.rules.mcpServers.global;
  const globalHooks = projects.find((p) => p.rules.hooks.global)?.rules.hooks
    .global;

  if (!globalSettings && !globalMcpServers && !globalHooks) return null;

  return (
    <Card className="border-l-[3px] border-l-slate-500/50">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-gradient-to-br from-slate-500/15 to-slate-400/10 p-1.5">
            <Globe className="h-4 w-4 text-slate-400" />
          </div>
          <CardTitle className="text-base">Global Settings</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {globalSettings && (
          <div className="border-l-[3px] border-l-purple-500/50 pl-3 space-y-2">
            <SectionHeader
              icon={Settings}
              label="Global Settings"
              color="text-purple-400"
            />
            <CodeBlock content={JSON.stringify(globalSettings, null, 2)} />
          </div>
        )}
        {globalMcpServers && (
          <div className="border-l-[3px] border-l-green-500/50 pl-3 space-y-2">
            <SectionHeader
              icon={Server}
              label="Global MCP Servers"
              color="text-green-400"
            />
            <div className="space-y-1">
              {Object.entries(globalMcpServers).map(([name, config]) => (
                <div key={name} className="flex items-start gap-2 text-xs">
                  <Server className="h-3 w-3 mt-0.5 text-green-400/60 flex-shrink-0" />
                  <div>
                    <span className="font-medium">{name}</span>
                    {config &&
                      typeof config === "object" &&
                      "command" in config && (
                        <span className="text-muted-foreground ml-1.5 font-mono text-[10px]">
                          {String((config as any).command)}
                        </span>
                      )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {globalHooks && (
          <div className="border-l-[3px] border-l-teal-500/50 pl-3 space-y-2">
            <SectionHeader
              icon={GitBranch}
              label="Global Hooks"
              color="text-teal-400"
            />
            <CodeBlock content={JSON.stringify(globalHooks, null, 2)} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProjectColumn({
  project,
  index,
  onNavigate,
}: {
  project: ProjectRulesEntry;
  index: number;
  onNavigate: (path: string) => void;
}) {
  return (
    <Card
      className="animate-fade-in-up min-w-0"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-gradient-to-br from-blue-500/15 to-purple-500/10 p-1.5">
            <FileText className="h-4 w-4 text-blue-400" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base truncate">
              {project.name}
            </CardTitle>
            <p className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">
              {project.path}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-[calc(100vh-14rem)]">
          <div className="space-y-5 pr-3">
            <ClaudeMdSection content={project.rules.claudeMd} markdownId={project.rules.claudeMdId} onNavigate={onNavigate} />
            <SkillsSection skills={project.rules.skills} onNavigate={onNavigate} />
            <McpServersSection servers={project.rules.mcpServers.project} />
            <ProjectSettingsSection settings={project.rules.projectSettings} />
            <HooksSection hooks={project.rules.hooks.project} />
            <MemoryFilesSection files={project.rules.memoryFiles} onNavigate={onNavigate} />
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export default function Rules() {
  const [, setLocation] = useLocation();
  const { data: projects, isLoading } = useQuery<ProjectRulesEntry[]>({
    queryKey: ["/api/projects/rules"],
  });

  if (isLoading) {
    return <PageSkeleton />;
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Project Rules</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Compare rules and configuration across projects
        </p>
      </div>

      {projects && projects.length > 0 && (
        <GlobalSection projects={projects} />
      )}

      {projects && projects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map((project, i) => (
            <ProjectColumn key={project.id} project={project} index={i} onNavigate={setLocation} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 space-y-4">
          <FileText className="h-12 w-12 text-muted-foreground/30" />
          <div className="text-center space-y-1">
            <p className="text-muted-foreground font-medium">
              No projects found
            </p>
            <p className="text-xs text-muted-foreground/70">
              Projects with rules will appear here once scanned
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

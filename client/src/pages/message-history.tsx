import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ListSkeleton } from "@/components/skeleton";
import {
  Search,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Clock,
  FolderOpen,
  User,
  Bot,
  Wrench,
  Loader2,
} from "lucide-react";
import type { SessionData, SessionStats } from "@shared/types";

interface SessionMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  model?: string;
  tokenCount?: number;
  hasToolUse?: boolean;
  toolNames?: string[];
}

interface MessagesResponse {
  sessionId: string;
  totalMessages: number;
  messages: SessionMessage[];
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "-";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(dateStr).toLocaleDateString();
}

function formatTime(timestamp: string): string {
  if (!timestamp) return "";
  try {
    return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

function lastPathSegment(fullPath: string): string {
  if (!fullPath || fullPath === "(no project)") return fullPath || "";
  const normalized = fullPath.replace(/\\/g, "/").replace(/\/$/, "");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || fullPath;
}

function shortModel(model: string | undefined): string {
  if (!model) return "";
  if (model.includes("opus")) return "Opus";
  if (model.includes("sonnet")) return "Sonnet";
  if (model.includes("haiku")) return "Haiku";
  return model.slice(0, 12);
}

export default function MessageHistory() {
  const [search, setSearch] = useState("");
  const [expandedSession, setExpandedSession] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ sessions: SessionData[]; stats: SessionStats }>({
    queryKey: [`/api/sessions?sort=lastTs&order=desc&hideEmpty=true`],
    staleTime: 60000,
  });

  const sessions = data?.sessions || [];

  // Filter sessions by search
  const filteredSessions = search
    ? sessions.filter((s) => {
        const q = search.toLowerCase();
        return (
          (s.firstMessage && s.firstMessage.toLowerCase().includes(q)) ||
          (s.slug && s.slug.toLowerCase().includes(q)) ||
          (s.projectKey && s.projectKey.toLowerCase().includes(q))
        );
      })
    : sessions;

  return (
    <div className="p-6 space-y-6 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gradient">Message History</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Chronological timeline of all messages across {sessions.length} session{sessions.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="relative w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search sessions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Session List */}
      {isLoading ? (
        <ListSkeleton rows={6} />
      ) : filteredSessions.length === 0 ? (
        <div className="text-muted-foreground text-center py-12">
          {search ? "No sessions match your search" : "No sessions with messages found"}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredSessions.map((session, i) => (
            <SessionRow
              key={session.id}
              session={session}
              index={i}
              isExpanded={expandedSession === session.id}
              onToggle={() =>
                setExpandedSession(expandedSession === session.id ? null : session.id)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SessionRow({
  session,
  index,
  isExpanded,
  onToggle,
}: {
  session: SessionData;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const project = lastPathSegment(session.projectKey);

  return (
    <Card
      className={`card-hover animate-fade-in-up cursor-pointer ${isExpanded ? "ring-1 ring-blue-500/30" : ""}`}
      style={{ animationDelay: `${Math.min(index, 20) * 30}ms` }}
    >
      <CardContent className="p-0">
        {/* Session header — always visible */}
        <div
          className="flex items-center gap-3 p-4 hover:bg-accent/20 transition-colors"
          onClick={onToggle}
        >
          {/* Expand icon */}
          <div className="flex-shrink-0 text-muted-foreground/50">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium line-clamp-1">
              {session.firstMessage || session.slug || "(untitled)"}
            </p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-[11px] text-muted-foreground font-mono whitespace-nowrap flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {relativeTime(session.lastTs)}
              </span>
              {project && (
                <>
                  <span className="text-muted-foreground/30 text-[11px]">/</span>
                  <span className="text-[11px] text-muted-foreground/60 flex items-center gap-1">
                    <FolderOpen className="h-3 w-3" />
                    {project}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Right side stats */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MessageSquare className="h-3.5 w-3.5" />
              <span className="font-mono tabular-nums">{session.messageCount}</span>
            </div>
            <span className="text-[11px] text-muted-foreground/50 font-mono">
              {formatDate(session.lastTs)}
            </span>
          </div>
        </div>

        {/* Expanded messages — lazy loaded */}
        {isExpanded && (
          <ExpandedMessages sessionId={session.id} />
        )}
      </CardContent>
    </Card>
  );
}

function ExpandedMessages({ sessionId }: { sessionId: string }) {
  const { data, isLoading } = useQuery<MessagesResponse>({
    queryKey: [`/api/sessions/${sessionId}/messages`],
    staleTime: 120000,
  });

  if (isLoading) {
    return (
      <div className="px-4 pb-4 pt-2 border-t border-border/30">
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading messages...
        </div>
      </div>
    );
  }

  if (!data || data.messages.length === 0) {
    return (
      <div className="px-4 pb-4 pt-2 border-t border-border/30">
        <p className="text-sm text-muted-foreground py-4 text-center">No messages found</p>
      </div>
    );
  }

  return (
    <div className="px-4 pb-4 pt-2 border-t border-border/30">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
          Conversation ({data.totalMessages} messages)
        </span>
      </div>
      <div className="space-y-1.5 max-h-[500px] overflow-auto">
        {data.messages.map((msg, idx) => (
          <MessageRow key={idx} message={msg} />
        ))}
      </div>
    </div>
  );
}

function MessageRow({ message }: { message: SessionMessage }) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex items-start gap-2.5 text-xs rounded-md px-3 py-2 transition-colors hover:bg-accent/20 ${
        isUser
          ? "border-l-2 border-l-blue-500/50"
          : "border-l-2 border-l-green-500/50"
      }`}
    >
      {/* Role icon */}
      <div className="flex-shrink-0 mt-0.5">
        {isUser ? (
          <User className="h-3.5 w-3.5 text-blue-400" />
        ) : (
          <Bot className="h-3.5 w-3.5 text-green-400" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-relaxed line-clamp-3 ${
          isUser ? "text-foreground" : "text-muted-foreground"
        }`}>
          {message.content || "(no content)"}
        </p>

        {/* Tool badges */}
        {message.hasToolUse && message.toolNames && message.toolNames.length > 0 && (
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            <Wrench className="h-3 w-3 text-muted-foreground/50" />
            {message.toolNames.map((tool, i) => (
              <Badge
                key={i}
                variant="outline"
                className="text-[9px] px-1 py-0 text-muted-foreground/70 border-muted-foreground/20"
              >
                {tool}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Right metadata */}
      <div className="flex-shrink-0 text-right space-y-0.5">
        <span className="text-[10px] text-muted-foreground/50 font-mono tabular-nums block">
          {formatTime(message.timestamp)}
        </span>
        {message.model && (
          <Badge variant="outline" className="text-[9px] px-1 py-0">
            {shortModel(message.model)}
          </Badge>
        )}
      </div>
    </div>
  );
}

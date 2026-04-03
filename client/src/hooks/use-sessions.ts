import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { toast } from "sonner";
import type {
  SessionData, SessionStats, SessionSummary, DeepSearchResult,
  CostAnalytics, FileHeatmapResult, HealthAnalytics, StaleAnalytics,
  SessionCostData, CommitLink, ContextLoaderResult,
  ProjectDashboardResult, SessionDiffsResult, PromptTemplate, WeeklyDigest, WorkflowConfig,
  SessionNote, FileTimelineResult, NLQueryResult,
  ContinuationBrief, Decision, BashKnowledgeBase, BashSearchResult,
  NerveCenterData, DelegationResult,
} from "@shared/types";

export function useSessions(params?: { q?: string; sort?: string; order?: string; hideEmpty?: boolean; activeOnly?: boolean; project?: string }) {
  const p = new URLSearchParams();
  if (params?.q) p.set("q", params.q);
  if (params?.sort) p.set("sort", params.sort);
  if (params?.order) p.set("order", params.order);
  if (params?.hideEmpty) p.set("hideEmpty", "true");
  if (params?.activeOnly) p.set("activeOnly", "true");
  if (params?.project) p.set("project", params.project);
  const qs = p.toString();
  return useQuery<{ sessions: SessionData[]; stats: SessionStats }>({
    queryKey: [`/api/sessions${qs ? `?${qs}` : ""}`],
  });
}

export function useSessionDetail(id: string | undefined) {
  return useQuery<SessionData & { records: { type: string; role?: string; timestamp: string; contentPreview: string }[] }>({
    queryKey: [`/api/sessions/${id}`],
    enabled: !!id,
  });
}

export function useDeleteSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/sessions/${id}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/sessions") });
      toast.success("Session deleted");
    },
    onError: (err: Error) => { toast.error(`Failed to delete session: ${err.message}`); },
  });
}

export function useBulkDeleteSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("DELETE", "/api/sessions", { ids });
      return res.json();
    },
    onSuccess: (_data, ids) => {
      qc.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/sessions") });
      toast.success(`${ids.length} sessions deleted`);
    },
    onError: (err: Error) => { toast.error(`Failed to delete sessions: ${err.message}`); },
  });
}

export function useOpenSession() {
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/sessions/${id}/open`);
      return res.json();
    },
    onSuccess: () => { toast.success("Session opened in terminal"); },
    onError: (err: Error) => { toast.error(`Failed to open session: ${err.message}`); },
  });
}

export function useDeleteAllSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sessions/delete-all");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/sessions") });
      toast.success("All sessions deleted");
    },
    onError: (err: Error) => { toast.error(`Failed to delete all sessions: ${err.message}`); },
  });
}

export function useUndoDeleteSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sessions/undo");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/sessions") });
      toast.success("Delete undone — sessions restored");
    },
    onError: (err: Error) => { toast.error(`Failed to undo delete: ${err.message}`); },
  });
}

export function useDeepSearch(params: { q?: string; field?: string; dateFrom?: string; dateTo?: string; project?: string; limit?: number }) {
  const p = new URLSearchParams();
  if (params.q) p.set("q", params.q);
  if (params.field) p.set("field", params.field);
  if (params.dateFrom) p.set("dateFrom", params.dateFrom);
  if (params.dateTo) p.set("dateTo", params.dateTo);
  if (params.project) p.set("project", params.project);
  if (params.limit) p.set("limit", String(params.limit));
  const qs = p.toString();
  return useQuery<DeepSearchResult>({
    queryKey: [`/api/sessions/search${qs ? `?${qs}` : ""}`],
    enabled: (params.q?.length ?? 0) >= 2,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSummarizeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/sessions/${id}/summarize`);
      return res.json() as Promise<SessionSummary>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/sessions") });
      toast.success("Session summarized");
    },
    onError: (err: Error) => { toast.error(`Failed to summarize session: ${err.message}`); },
  });
}

export function useSummarizeBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sessions/summarize-batch");
      return res.json() as Promise<{ summarized: string[]; failed: string[]; skipped: string[] }>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/sessions") });
      toast.success(`${data.summarized.length} done, ${data.skipped.length} skipped`);
    },
    onError: (err: Error) => { toast.error(`Batch summarize failed: ${err.message}`); },
  });
}

export function useSessionSummary(id: string | undefined) {
  return useQuery<SessionSummary>({
    queryKey: [`/api/sessions/${id}/summary`],
    enabled: !!id,
    retry: false,
  });
}

// Analytics hooks
export function useCostAnalytics() {
  return useQuery<CostAnalytics>({
    queryKey: ["/api/sessions/analytics/costs"],
    staleTime: 5 * 60 * 1000,
  });
}

export function useFileHeatmap() {
  return useQuery<FileHeatmapResult>({
    queryKey: ["/api/sessions/analytics/files"],
    staleTime: 5 * 60 * 1000,
  });
}

export function useHealthAnalytics() {
  return useQuery<HealthAnalytics>({
    queryKey: ["/api/sessions/analytics/health"],
    staleTime: 5 * 60 * 1000,
  });
}

export function useStaleAnalytics() {
  return useQuery<StaleAnalytics>({
    queryKey: ["/api/sessions/analytics/stale"],
    staleTime: 5 * 60 * 1000,
  });
}

export function useSessionCost(id: string | undefined) {
  return useQuery<SessionCostData>({
    queryKey: [`/api/sessions/${id}/costs`],
    enabled: !!id,
    retry: false,
  });
}

export function useSessionCommits(id: string | undefined) {
  return useQuery<{ sessionId: string; commits: CommitLink[] }>({
    queryKey: [`/api/sessions/${id}/commits`],
    enabled: !!id,
    retry: false,
  });
}

export function useContextLoader() {
  return useMutation({
    mutationFn: async (project: string) => {
      const res = await apiRequest("POST", "/api/sessions/context-loader", { project });
      return res.json() as Promise<ContextLoaderResult>;
    },
    onSuccess: () => { toast.success("Context loaded"); },
    onError: (err: Error) => { toast.error(`Failed to load context: ${err.message}`); },
  });
}

export function useProjectDashboards() {
  return useQuery<ProjectDashboardResult>({
    queryKey: ["/api/sessions/analytics/projects"],
    staleTime: 5 * 60 * 1000,
  });
}

export function useSessionDiffs(id: string | undefined) {
  return useQuery<SessionDiffsResult>({
    queryKey: [`/api/sessions/${id}/diffs`],
    enabled: !!id,
    retry: false,
  });
}

export function usePromptTemplates() {
  return useQuery<PromptTemplate[]>({
    queryKey: ["/api/sessions/prompts"],
  });
}

export function useCreatePrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name: string; description?: string; prompt: string; project?: string; tags?: string[] }) => {
      const res = await apiRequest("POST", "/api/sessions/prompts", data);
      return res.json() as Promise<PromptTemplate>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/sessions/prompts"] });
      toast.success("Prompt created");
    },
    onError: (err: Error) => { toast.error(`Failed to create prompt: ${err.message}`); },
  });
}

export function useDeletePrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/sessions/prompts/${id}`);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/sessions/prompts"] });
      toast.success("Prompt deleted");
    },
    onError: (err: Error) => { toast.error(`Failed to delete prompt: ${err.message}`); },
  });
}

export function useWeeklyDigest() {
  return useQuery<WeeklyDigest>({
    queryKey: ["/api/sessions/analytics/digest"],
    staleTime: 5 * 60 * 1000,
  });
}

export function useWorkflowConfig() {
  return useQuery<WorkflowConfig>({
    queryKey: ["/api/sessions/workflows"],
  });
}

export function useUpdateWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<WorkflowConfig>) => {
      const res = await apiRequest("PATCH", "/api/sessions/workflows", patch);
      return res.json() as Promise<WorkflowConfig>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/sessions/workflows"] });
      toast.success("Workflow updated");
    },
    onError: (err: Error) => { toast.error(`Failed to update workflow: ${err.message}`); },
  });
}

export function useRunWorkflows() {
  return useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sessions/workflows/run");
      return res.json();
    },
    onSuccess: () => { toast.success("Workflows executed"); },
    onError: (err: Error) => { toast.error(`Failed to run workflows: ${err.message}`); },
  });
}

export function useTogglePin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/sessions/pin/${id}`);
      return res.json() as Promise<{ sessionId: string; isPinned: boolean }>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/sessions") });
      toast.success(data.isPinned ? "Session pinned" : "Session unpinned");
    },
    onError: (err: Error) => { toast.error(`Failed to toggle pin: ${err.message}`); },
  });
}

export function useSessionNote(id: string | undefined) {
  return useQuery<SessionNote>({
    queryKey: [`/api/sessions/${id}/note`],
    enabled: !!id,
    retry: false,
  });
}

export function useSaveNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, text }: { id: string; text: string }) => {
      const res = await apiRequest("PUT", `/api/sessions/${id}/note`, { text });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith("/api/sessions") });
      toast.success("Note saved");
    },
    onError: (err: Error) => { toast.error(`Failed to save note: ${err.message}`); },
  });
}

export function useFileTimeline(filePath: string | undefined) {
  const p = new URLSearchParams();
  if (filePath) p.set("path", filePath);
  return useQuery<FileTimelineResult>({
    queryKey: [`/api/sessions/file-timeline?${p.toString()}`],
    enabled: !!filePath,
    retry: false,
  });
}

export function useNLQuery() {
  return useMutation({
    mutationFn: async (question: string) => {
      const res = await apiRequest("POST", "/api/sessions/nl-query", { question });
      return res.json() as Promise<NLQueryResult>;
    },
    onError: (err: Error) => { toast.error(`Query failed: ${err.message}`); },
  });
}

export function useContinuations() {
  return useQuery<ContinuationBrief>({
    queryKey: ["/api/sessions/continuations"],
    staleTime: 60 * 1000,
  });
}

export function useDecisions(query?: string) {
  const qs = query ? `?q=${encodeURIComponent(query)}` : "";
  return useQuery<Decision[]>({
    queryKey: [`/api/sessions/decisions${qs}`],
    staleTime: 30 * 1000,
  });
}

export function useExtractDecisions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/sessions/decisions/extract/${id}`);
      return res.json() as Promise<{ decisions: Decision[]; count: number }>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/sessions/decisions"] });
      toast.success(`${data.count} decisions extracted`);
    },
    onError: (err: Error) => { toast.error(`Failed to extract decisions: ${err.message}`); },
  });
}

export function useBashKnowledge() {
  return useQuery<BashKnowledgeBase>({
    queryKey: ["/api/sessions/analytics/bash"],
    staleTime: 5 * 60 * 1000,
  });
}

export function useBashSearch(query: string) {
  return useQuery<BashSearchResult>({
    queryKey: [`/api/sessions/analytics/bash/search?q=${encodeURIComponent(query)}`],
    enabled: query.length >= 2,
  });
}

export function useNerveCenter() {
  return useQuery<NerveCenterData>({
    queryKey: ["/api/sessions/nerve-center"],
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });
}

export function useDelegate() {
  return useMutation({
    mutationFn: async (params: { sessionId: string; target: string; task?: string }) => {
      const res = await apiRequest("POST", "/api/sessions/delegate", params);
      return res.json() as Promise<DelegationResult>;
    },
    onSuccess: (data) => { toast.success(`Delegated to ${data.target}`); },
    onError: (err: Error) => { toast.error(`Delegation failed: ${err.message}`); },
  });
}

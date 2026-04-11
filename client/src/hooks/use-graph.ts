import { useQuery } from "@tanstack/react-query";
import type { ForceGraphData } from "@shared/types";

export function useForceGraph(scope: "system" | "sessions", projectKey?: string) {
  const params = new URLSearchParams({ scope });
  if (projectKey) params.set("project", projectKey);

  return useQuery<ForceGraphData>({
    queryKey: [`/api/graph?${params.toString()}`],
    staleTime: 30_000,
  });
}

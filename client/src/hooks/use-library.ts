import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, invalidateDataQueries } from "@/lib/queryClient";
import { toast } from "sonner";
import type { Entity } from "@shared/types";

/** Fetch library (uninstalled) items for a given type by filtering entities */
export function useLibraryItems<T extends Entity = Entity>(type: "skills" | "agents" | "plugins") {
  // Library items come from the entity scanner with libraryStatus === "uninstalled"
  // Skills and agents use entity type "skill", plugins use "plugin"
  const entityType = type === "plugins" ? "plugin" : "skill";
  return useQuery<T[]>({
    queryKey: [`/api/entities?type=${entityType}`],
    select: (data: T[]) =>
      data.filter((item) => {
        const d = item.data as Record<string, unknown>;
        if (d.libraryStatus !== "uninstalled") return false;
        // For agents vs skills, filter by entityKind
        if (type === "agents") return d.entityKind === "agent";
        if (type === "skills") return d.entityKind === "skill" || d.entityKind === undefined;
        return true;
      }),
  });
}

/** Install an item from library to active directory */
export function useInstallItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ type, id }: { type: string; id: string }) => {
      const res = await apiRequest("POST", `/api/library/${type}/${encodeURIComponent(id)}/install`);
      return res.json();
    },
    onSuccess: (data: { message?: string }) => {
      invalidateDataQueries(qc);
      toast.success(data.message || "Installed successfully");
    },
    onError: (err: Error) => {
      toast.error(`Install failed: ${err.message}`);
    },
  });
}

/** Uninstall an item from active directory to library */
export function useUninstallItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ type, id }: { type: string; id: string }) => {
      const res = await apiRequest("POST", `/api/library/${type}/${encodeURIComponent(id)}/uninstall`);
      return res.json();
    },
    onSuccess: (data: { message?: string }) => {
      invalidateDataQueries(qc);
      toast.success(data.message || "Uninstalled successfully");
    },
    onError: (err: Error) => {
      toast.error(`Uninstall failed: ${err.message}`);
    },
  });
}

/** Permanently remove an item from library */
export function useRemoveItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ type, id }: { type: string; id: string }) => {
      const res = await apiRequest("DELETE", `/api/library/${type}/${encodeURIComponent(id)}`);
      return res.json();
    },
    onSuccess: (data: { message?: string }) => {
      invalidateDataQueries(qc);
      toast.success(data.message || "Removed successfully");
    },
    onError: (err: Error) => {
      toast.error(`Remove failed: ${err.message}`);
    },
  });
}

/** Fetch discover sources for a given type */
export function useDiscoverSources(type: "skills" | "agents" | "plugins") {
  return useQuery<{ id: string; name: string; url: string; type: string; searchable: boolean; description: string }[]>({
    queryKey: [`/api/discover/${type}/sources`],
    staleTime: 300_000,
  });
}

/** Search for items to discover (GitHub search) */
export function useDiscoverSearch(type: "skills" | "agents" | "plugins", query: string) {
  return useQuery<{ name: string; description: string | null; url: string; stars: number; source: string }[]>({
    queryKey: [`/api/discover/${type}/search?q=${encodeURIComponent(query)}`],
    enabled: query.length >= 2,
    staleTime: 60_000,
  });
}

/** Save a discovered item to library */
export function useSaveToLibrary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ type, repoUrl, path, name }: { type: string; repoUrl: string; path?: string; name: string }) => {
      const res = await apiRequest("POST", `/api/library/${type}/save`, { repoUrl, path, name });
      return res.json();
    },
    onSuccess: (data: { message?: string }) => {
      invalidateDataQueries(qc);
      toast.success(data.message || "Saved to library");
    },
    onError: (err: Error) => {
      toast.error(`Save failed: ${err.message}`);
    },
  });
}

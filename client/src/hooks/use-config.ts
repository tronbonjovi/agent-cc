import { useQuery } from "@tanstack/react-query";
import type { Entity } from "@shared/types";

export function useRuntimeConfig() {
  return useQuery<any>({
    queryKey: ["/api/config/runtime"],
  });
}

export function useConfigSettings() {
  return useQuery<Entity[]>({
    queryKey: ["/api/config/settings"],
  });
}

import { useQuery } from "@tanstack/react-query";
import type { ConfigEntity, RuntimeInfo } from "@shared/types";

export function useRuntimeConfig() {
  return useQuery<RuntimeInfo>({
    queryKey: ["/api/config/runtime"],
  });
}

export function useConfigSettings() {
  return useQuery<ConfigEntity[]>({
    queryKey: ["/api/config/settings"],
  });
}

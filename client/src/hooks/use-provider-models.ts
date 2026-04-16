// client/src/hooks/use-provider-models.ts
//
// React Query hook that fetches the discovered model list for a provider
// from `GET /api/providers/:id/models`. The composer's model dropdown
// subscribes to this so its list reflects what each provider actually
// offers (Ollama tags, OpenAI's /v1/models, Claude's known set) instead of
// the hardcoded catalog M10 shipped with.
//
// `staleTime` matches the 60s TTL the server-side `discoverModels` cache
// applies — no point refetching sooner, the server would just hand back the
// same cached payload.
//
// Empty `providerId` short-circuits to a disabled query. This lets callers
// mount the hook unconditionally in components that gate on the id being
// non-empty, without triggering a `fetch('/api/providers//models')`.

import { useQuery } from '@tanstack/react-query';

/** A single model offered by a provider. Mirrors the server `ProviderModel`. */
export interface ProviderModel {
  id: string;
  name: string;
  provider: string;
}

export function useProviderModels(providerId: string) {
  const query = useQuery<ProviderModel[]>({
    queryKey: ['/api/providers', providerId, 'models'],
    enabled: providerId.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const res = await fetch(`/api/providers/${encodeURIComponent(providerId)}/models`);
      if (!res.ok) {
        // Propagate so React Query surfaces it as `error` — the dropdown
        // renders an "unavailable" state rather than silently showing empty.
        throw new Error(`Failed to fetch models: ${res.status} ${res.statusText}`);
      }
      return (await res.json()) as ProviderModel[];
    },
  });

  return {
    models: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

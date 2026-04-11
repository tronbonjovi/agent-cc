import { useEffect, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { invalidateDataQueries } from "@/lib/queryClient";

interface ScanEvent {
  type: "connected" | "scan-start" | "scan-complete";
  version?: number;
  totalEntities?: number;
  duration?: number;
  entityCounts?: Record<string, number>;
}

export function useLiveSync() {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<ScanEvent | null>(null);

  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      es = new EventSource("/api/scanner/events");

      es.addEventListener("connected", (e) => {
        setConnected(true);
        try {
          const data = JSON.parse(e.data);
          setLastEvent({ type: "connected", ...data });
        } catch {}
      });

      es.addEventListener("scan-start", (e) => {
        try {
          const data = JSON.parse(e.data);
          setLastEvent({ type: "scan-start", ...data });
        } catch {}
      });

      es.addEventListener("scan-complete", (e) => {
        try {
          const data = JSON.parse(e.data);
          setLastEvent({ type: "scan-complete", ...data });
        } catch {}
        // Invalidate entity/scanner queries so UI refreshes with new data
        invalidateDataQueries(qc);
      });

      es.onerror = () => {
        setConnected(false);
        es?.close();
        // Retry in 5s
        retryTimer = setTimeout(connect, 5000);
      };
    }

    connect();

    return () => {
      es?.close();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [qc]);

  return { connected, lastEvent };
}

// ---- Scanner status query ----

export interface ScannerStatusData {
  scanning: boolean;
  lastScanAt: string | null;
  entityCounts: Record<string, number>;
  totalEntities: number;
  totalRelationships: number;
  sessionCount?: number;
  agentCount?: number;
  scanVersion: number;
  lastScanDuration: number;
  parseCacheSize: number;
}

/**
 * useScannerStatus — fetches scanner metadata from /api/scanner/status.
 * Used by ScannerBrain to display last scan time, session count, cache health.
 * Polls every 15 seconds to keep the brain display current.
 */
export function useScannerStatus() {
  return useQuery<ScannerStatusData>({
    queryKey: ["scanner-status"],
    queryFn: async () => {
      const res = await fetch("/api/scanner/status");
      if (!res.ok) throw new Error(`Scanner status fetch failed: ${res.status}`);
      return res.json();
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}

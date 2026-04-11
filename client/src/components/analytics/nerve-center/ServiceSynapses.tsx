import { type ReactElement, useEffect, useMemo } from "react";
import type { ServiceStatus } from "@shared/types";
import type { PathwayState } from "./NervePathway";

// ---- Types ----

export interface ServiceSynapsesProps {
  /** Array of service status objects from the nerve-center API. */
  services: ServiceStatus[];
  /** Callback to report this organ's overall state to the parent topology. */
  onStateChange?: (state: PathwayState) => void;
}

// ---- Status dot color mapping ----

/** Maps individual service status to a dot color class (solid colors only). */
function statusDotClass(status: ServiceStatus["status"]): string {
  if (status === "up") return "bg-emerald-500";
  if (status === "down") return "bg-red-500";
  return "bg-zinc-400"; // unknown
}

// ---- Organ state computation ----

/**
 * Derives the overall organ state from the list of services.
 * - All up -> "active" (green/healthy)
 * - Some down -> "alert" (red)
 * - Mixed/degraded (all up but some slow, or unknown) -> "idle" (amber/neutral)
 * - Empty list -> "idle"
 */
function computeOrganState(services: ServiceStatus[]): PathwayState {
  if (services.length === 0) return "idle";
  if (services.some((s) => s.status === "down")) return "alert";
  if (services.every((s) => s.status === "up")) return "active";
  return "idle";
}

// ---- Component ----

/**
 * ServiceSynapses — compact organ module showing external service connections.
 *
 * Displays each configured service with a status dot (green=up, red=down,
 * gray=unknown) and response time in milliseconds. Reports overall organ
 * state to the parent topology via onStateChange callback.
 */
export function ServiceSynapses({
  services,
  onStateChange,
}: ServiceSynapsesProps): ReactElement {
  const organState = useMemo(() => computeOrganState(services), [services]);

  // Report state to parent whenever it changes
  useEffect(() => {
    onStateChange?.(organState);
  }, [organState, onStateChange]);

  // Border color reflects organ-level health
  const borderColor =
    organState === "active"
      ? "border-emerald-600/40"
      : organState === "alert"
        ? "border-red-600/40"
        : "border-zinc-600/40";

  return (
    <div
      className={`rounded-lg border ${borderColor} bg-zinc-900/80 p-3 text-xs`}
    >
      {/* Header */}
      <div className="mb-2 flex items-center gap-1.5 text-zinc-400 font-medium">
        <span className="text-[10px] uppercase tracking-wider">Synapses</span>
      </div>

      {/* Service list or empty state */}
      {!services || services.length === 0 ? (
        <div className="text-zinc-500 text-center py-2">
          No services configured
        </div>
      ) : (
        <div className="space-y-1">
          {services.map((svc) => (
            <div
              key={`${svc.name}:${svc.port}`}
              className="flex items-center gap-2"
            >
              {/* Status dot */}
              <span
                className={`inline-flex h-2 w-2 shrink-0 rounded-full ${statusDotClass(svc.status)}`}
                aria-label={`${svc.name} status: ${svc.status}`}
              />

              {/* Service name */}
              <span className="truncate text-zinc-300">{svc.name}</span>

              {/* Response time (only when up and we have timing) */}
              <span className="ml-auto shrink-0 tabular-nums text-zinc-500">
                {svc.status === "up" && svc.responseMs != null
                  ? `${svc.responseMs}ms`
                  : svc.status === "down"
                    ? "down"
                    : "--"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

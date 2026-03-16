import { cn } from "@/lib/utils";

const healthColors: Record<string, string> = {
  ok: "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]",
  warning: "bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.4)]",
  error: "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)] animate-pulse",
  unknown: "bg-gray-500",
};

export function HealthIndicator({ health, className }: { health: string; className?: string }) {
  return (
    <span
      className={cn("inline-block h-2 w-2 rounded-full", healthColors[health] || healthColors.unknown, className)}
      title={health}
    />
  );
}

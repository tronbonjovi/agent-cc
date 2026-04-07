import { useEffect, useRef } from "react";
import { getTerminalInstanceManager } from "@/lib/terminal-instance-manager";

interface TerminalInstanceProps {
  instanceId: string;
}

export function TerminalInstance({ instanceId }: TerminalInstanceProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const manager = getTerminalInstanceManager();
    manager.attach(instanceId, containerRef.current);

    return () => {
      manager.detach(instanceId);
    };
  }, [instanceId]);

  return <div ref={containerRef} className="h-full w-full" />;
}

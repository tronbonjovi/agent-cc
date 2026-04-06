// server/pipeline/events.ts

type SendFn = (data: string) => void;

export type PipelineEventType =
  | "milestone-started"
  | "milestone-paused"
  | "milestone-completed"
  | "milestone-stalled"
  | "task-stage-changed"
  | "task-progress"
  | "task-blocked"
  | "task-completed"
  | "budget-warning"
  | "budget-exceeded";

export class PipelineEventBus {
  private clients = new Set<SendFn>();

  /** Register a client. Returns a cleanup function. */
  addClient(send: SendFn): () => void {
    this.clients.add(send);
    return () => {
      this.clients.delete(send);
    };
  }

  /** Emit an event to all connected clients. */
  emit(event: PipelineEventType, data: Record<string, unknown>): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const send of Array.from(this.clients)) {
      try {
        send(payload);
      } catch {
        // Client may have disconnected — remove silently
        this.clients.delete(send);
      }
    }
  }

  /** Number of connected clients. */
  get clientCount(): number {
    return this.clients.size;
  }
}

/** Singleton event bus for the pipeline */
export const pipelineEvents = new PipelineEventBus();

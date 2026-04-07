// server/board/events.ts

type SendFn = (data: string) => void;

export type BoardEventType =
  | "task-moved"
  | "task-created"
  | "task-updated"
  | "task-deleted"
  | "task-flagged"
  | "task-unflagged"
  | "board-refresh";

export class BoardEventBus {
  private clients = new Set<SendFn>();

  addClient(send: SendFn): () => void {
    this.clients.add(send);
    return () => { this.clients.delete(send); };
  }

  emit(event: BoardEventType, data: Record<string, unknown>): void {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const send of Array.from(this.clients)) {
      try {
        send(payload);
      } catch {
        this.clients.delete(send);
      }
    }
  }

  get clientCount(): number {
    return this.clients.size;
  }
}

export const boardEvents = new BoardEventBus();

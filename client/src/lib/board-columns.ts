// client/src/lib/board-columns.ts

import type { BoardColumn } from "@shared/board-types";

export interface BoardColumnDef {
  id: BoardColumn;
  label: string;
  color: string;         // tailwind color class for column header accent
  description: string;
}

export const BOARD_COLUMNS: BoardColumnDef[] = [
  { id: "queue",       label: "Queue",       color: "bg-slate-400",  description: "Known work, not yet started" },
  { id: "in-progress", label: "In Progress", color: "bg-amber-400",  description: "Someone is actively working" },
  { id: "review",      label: "Review",      color: "bg-purple-400", description: "Work done, needs human eyes" },
  { id: "done",        label: "Done",        color: "bg-emerald-400",description: "Approved and complete" },
];

export function columnOrder(column: string): number {
  const idx = BOARD_COLUMNS.findIndex(c => c.id === column);
  return idx;
}

export function isValidColumn(column: string): column is BoardColumn {
  return BOARD_COLUMNS.some(c => c.id === column);
}

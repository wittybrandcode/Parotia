import type { CleanupOperation } from "./cleanup";

export type HistoryCommandType = "CLEANUP" | "RESTORE" | "BATCH_CLEANUP";

export interface HistoryCommand {
  id: string;
  type: HistoryCommandType;
  timestamp: number;
  operation: CleanupOperation;
}

export interface HistoryState {
  undo: HistoryCommand[];
  redo: HistoryCommand[];
}

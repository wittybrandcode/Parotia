/**
 * Domain events: "This happened." Events originate from the engine that owns
 * the operation — never from the UI. The UI sends commands; engines emit
 * events. Commands are runtime messages, not persistent data.
 */

export type DomainEventType =
  | "SESSION_CREATED"
  | "SESSION_READY"
  | "FREEZE_STARTED"
  | "FREEZE_COMPLETED"
  | "FREEZE_FAILED"
  | "EXTRACTION_STARTED"
  | "EXTRACTION_COMPLETED"
  | "EXTRACTION_FAILED"
  | "INSPECTION_STARTED"
  | "ELEMENT_SELECTED"
  | "INSPECTION_ENDED"
  | "CLEANUP_PROPOSED"
  | "ELEMENT_DELETED"
  | "ELEMENT_HIDDEN"
  | "ELEMENT_KEPT"
  | "CLEANUP_BATCH_APPLIED"
  | "UNDO_PERFORMED"
  | "REDO_PERFORMED"
  | "CLEANUP_RESET"
  | "PRESET_DETECTED"
  | "PRESET_VALIDATED"
  | "PRESET_APPLIED"
  | "PRESET_FAILED"
  | "CAPTURE_STARTED"
  | "CAPTURE_COMPLETED"
  | "CAPTURE_FAILED"
  | "CAPTURE_CANCELLED"
  | "EXPORT_STARTED"
  | "EXPORT_COMPLETED"
  | "EXPORT_FAILED";

export interface DomainEvent<T = unknown> {
  id: string;
  type: DomainEventType;
  timestamp: number;
  payload: T;
}

export interface EventBus {
  emit<T>(type: DomainEventType, payload: T): void;
  subscribe<T>(type: DomainEventType, listener: (event: DomainEvent<T>) => void): () => void;
}

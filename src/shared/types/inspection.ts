import type { ElementReference } from "./element";

export type InspectionMode = "IDLE" | "HOVER" | "SELECT";

export interface InspectionState {
  active: boolean;
  hovered?: ElementReference;
  selected?: ElementReference;
  mode: InspectionMode;
}

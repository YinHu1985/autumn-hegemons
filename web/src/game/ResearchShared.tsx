import type { Content } from "../definitions/types";
import type { WorldState } from "../simulation/state";

export interface ResearchPanelProps {
  content: Content;
  world: WorldState;
  nationId: string;
  onWorld: (world: WorldState) => void;
}

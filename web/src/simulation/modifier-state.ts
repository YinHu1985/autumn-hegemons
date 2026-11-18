import type { ModifierOperation } from "../definitions/modifier-values";

export interface ModifierContext {
  nationId: string;
  settlementId?: string;
}
export interface ModifierSource {
  kind:
    | "technology"
    | "idea"
    | "event"
    | "advisor"
    | "building"
    | "policy"
    | "system";
  id: string;
  name: string;
  instanceId?: string;
}
export interface ModifierTarget {
  kind: "nation" | "settlement";
  id: string;
}
export interface ModifierInstance {
  id: string;
  definitionId: string;
  source: ModifierSource;
  target: ModifierTarget;
  startedAt: number;
  expiresAt: number;
  showInAdministration?: boolean;
}
export interface ModifierState {
  instances: ModifierInstance[];
  nextId: number;
}
/** The same evaluated contribution is used by consumers and their explanations. */
export interface ModifierContribution {
  key: string;
  operation: ModifierOperation;
  value: number;
  source: ModifierSource;
  target?: ModifierTarget;
  modifierId?: string;
  modifierName?: string;
  expiresAt?: number;
}
export function createModifiers(): ModifierState {
  return { instances: [], nextId: 1 };
}

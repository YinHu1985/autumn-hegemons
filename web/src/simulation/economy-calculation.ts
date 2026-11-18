import type { StatResult } from "./modifier-query";
import type { ModifierContribution } from "./modifier-state";
import { modifierDefaultOperation } from "../definitions/modifiers";

export interface ResourceCalculation {
  base: number;
  steps: { label: string; factor: number; stat?: StatResult }[];
  value: number;
}

/** Keep the actual calculation with its result; the interface never reconstructs it. */
export function resourceCalculation(
  base: number,
  steps: ResourceCalculation["steps"],
): ResourceCalculation {
  return {
    base,
    steps,
    value: steps.reduce((value, step) => value * step.factor, base),
  };
}

export function buildingContributions(
  nationId: string,
  cityId: string,
  buildingId: string,
  name: string,
  terms: Record<string, number>,
  factor: number,
): ModifierContribution[] {
  return Object.entries(terms).map(([key, value]) => ({
    key,
    operation: modifierDefaultOperation(key),
    value: value * factor,
    source: { kind: "building", id: `${cityId}:${buildingId}`, name },
    target:
      key === "fortification"
        ? { kind: "settlement", id: cityId }
        : { kind: "nation", id: nationId },
  }));
}

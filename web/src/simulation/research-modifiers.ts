import type { Content } from "../definitions/types";
import type { WorldState } from "./state";
import { modifierDefaultOperation } from "../definitions/modifiers";
import { resolveStat } from "./modifier-query";

export function researchModifier(
  content: Content,
  world: WorldState,
  nationId: string,
  key: string,
): number {
  const base = modifierDefaultOperation(key) === "add_percent" ? 1 : 0;
  const result = resolveStat(content, world, { nationId }, key, base);
  // Preserve the exact additive sum for callers that display the legacy delta.
  if (base === 1 && result.flat === 0 && result.multiplier === 1)
    return result.percent;
  return result.value - base;
}

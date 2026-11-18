import type { CompletionEffect } from "../definitions/research";
import type { Content } from "../definitions/types";
import type { WorldState } from "./state";
import { applyEffects } from "./effects";
import type { ModifierSource } from "./modifier-state";

/** Executes authored one-time actions without treating them as passive modifiers. */
export function applyCompletionEffects(
  content: Content,
  world: WorldState,
  nationId: string,
  effects: readonly CompletionEffect[],
  source: ModifierSource = {
    kind: "system",
    id: "completion",
    name: "完成效果",
  },
): void {
  applyEffects(content, world, { nationId, source }, effects);
}

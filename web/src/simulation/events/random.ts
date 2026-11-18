import type { WorldState } from "../state";
import { eventRandom } from "./state";

/** Normalization prevents overflow without changing relative authored weights. */
export function pickWeighted<T>(
  world: WorldState,
  entries: readonly { value: T; weight: number }[],
): T | undefined {
  const positive = entries.filter(
    (entry) => entry.weight > 0 && Number.isFinite(entry.weight),
  );
  if (!positive.length) return undefined;
  if (positive.length === 1) return positive[0].value;
  const max = Math.max(...positive.map((entry) => entry.weight));
  let roll =
    eventRandom(world) *
    positive.reduce((sum, entry) => sum + entry.weight / max, 0);
  return (
    positive.find((entry) => (roll -= entry.weight / max) < 0) ??
    positive.at(-1)!
  ).value;
}

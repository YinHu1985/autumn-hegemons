import type { WorldState } from "./state";
import type { Battle } from "./military-state";

/** Independent FIFO queue for each defender, including battles awaiting a decision. */
export function defenseQueue(world: WorldState, nationId: string): Battle[] {
  return Object.values(world.military.battles)
    .filter(
      (battle) => battle.defenderId === nationId && battle.phase !== "resolved",
    )
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function battleQueuePosition(world: WorldState, battle: Battle) {
  if (battle.phase === "resolved") return 0;
  return (
    defenseQueue(world, battle.defenderId).findIndex(
      (item) => item.id === battle.id,
    ) + 1
  );
}

/** Player decisions stop the strategic clock, but never erase other nations' campaigns. */
export function hasPendingBattle(world: WorldState) {
  return Object.values(world.military.battles).some(
    (battle) =>
      battle.phase === "ready" &&
      [battle.attackerId, battle.defenderId].includes(world.playerNationId),
  );
}

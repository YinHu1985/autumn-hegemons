import type { Content } from "../definitions/types";
import type { WorldState } from "./state";
import type { Battle, TacticalUnit } from "./military-state";
import { resolveStat } from "./modifier-query";
import {
  battleArmies,
  finishBattle,
  defenseAdvantage,
} from "./military-battles";
import {
  applyCasualties,
  armyEfficiency,
  regimentPower,
} from "./military-strength";
import { maxActionPoints } from "./tactical-board";
export { BOARD_COLUMNS, tacticalRows, tacticalTerrain } from "./tactical-board";
export { tacticalActions, tacticalOrders } from "./tactical-actions";
export {
  tacticalMove,
  tacticalAttack,
  tacticalStrategy,
  tacticalHold,
} from "./tactical-combat";
export { tacticalEndTurn } from "./tactical-turns";
export {
  tacticalInitiative,
  tacticalTimeline,
  tacticalForecast,
  tacticalAdvanceClock,
  finishTacticalActivation,
} from "./tactical-timeline";
export { tacticalAutomationStep } from "./tactical-turns";
export { tacticalMovementPath } from "./tactical-board";
export { controllingStatus } from "./tactical-board";
export { hexDistance, hexNeighbors, hexLine } from "./tactical-grid";
export {
  tacticalVisibility,
  tacticalVisionRange,
  isTacticalUnitVisible,
} from "./tactical-visibility";
export type { TacticalVisibility } from "./tactical-visibility";

export function beginTactical(
  content: Content,
  world: WorldState,
  battle: Battle,
) {
  if (battle.phase !== "ready" || battle.tactical)
    throw new Error("尚未到决战时刻");
  if (world.military.activeBattleId) throw new Error("请先完成当前决战");
  const units: TacticalUnit[] = [];
  for (const side of ["attacker", "defender"] as const) {
    for (const army of battleArmies(world, battle, side))
      for (const unit of army.units) {
        const definition = content.units.find((d) => d.id === unit.typeId)!;
        const base =
          (unit.cadre * definition.attack + unit.levy * 0.35) *
          (0.25 + unit.morale / 133) *
          (0.55 + unit.training / 200);
        const general = army.generalId
          ? world.research.talents[army.generalId]
          : null;
        const attackMultiplier =
          (regimentPower(content, world, army.nationId, unit) /
            Math.max(1, base)) *
          armyEfficiency(content, world, army) *
          (general ? 1 + general.command / 180 : 0.8) *
          (side === "attacker"
            ? resolveStat(
                content,
                world,
                { nationId: army.nationId },
                "army.offense",
                1,
                { min: 0.1 },
              ).value
            : 1);
        units.push({
          ...unit,
          attackMultiplier,
          defenseMultiplier:
            side === "defender"
              ? defenseAdvantage(content, world, battle)
              : resolveStat(
                  content,
                  world,
                  { nationId: army.nationId },
                  "army.defense",
                  1,
                  { min: 0.1 },
                ).value,
          armyId: army.id,
          side,
          x: 0,
          y: 0,
          acted: false,
          actionPoints: maxActionPoints(content, unit),
          maxActionPoints: maxActionPoints(content, unit),
          strategyUsed: false,
          guarding: false,
          statuses: [],
          actionProgress: 0,
          activationCount: 0,
        });
      }
  }
  const levyType =
    content.units.find(
      (type) => type.cadre === 0 && type.category === "infantry",
    ) ?? content.units[0];
  if (levyType) {
    let remaining = battle.garrison;
    let index = 0;
    while (remaining > 0) {
      const men = Math.min(1000, remaining);
      const morale = 70;
      const training = 25;
      const base = men * 0.35 * (0.25 + morale / 133) * (0.55 + training / 200);
      units.push({
        id: `${battle.id}-garrison-${index++}`,
        typeId: levyType.id,
        cadre: 0,
        levy: men,
        morale,
        training,
        armyId: null,
        side: "defender",
        x: 0,
        y: 0,
        acted: false,
        actionPoints: maxActionPoints(content, { typeId: levyType.id }),
        maxActionPoints: maxActionPoints(content, { typeId: levyType.id }),
        strategyUsed: false,
        guarding: false,
        statuses: [],
        actionProgress: 0,
        activationCount: 0,
        attackMultiplier: (men * 0.5) / Math.max(1, base),
        defenseMultiplier: defenseAdvantage(content, world, battle),
      });
      remaining -= men;
    }
  }
  const rows = Math.max(
    8,
    Math.ceil(
      Math.max(
        units.filter((unit) => unit.side === "attacker").length,
        units.filter((unit) => unit.side === "defender").length,
      ) / 3,
    ),
  );
  for (const side of ["attacker", "defender"] as const)
    units
      .filter((unit) => unit.side === side)
      .forEach((unit, index) => {
        unit.x =
          side === "attacker"
            ? 1 + Math.floor(index / rows)
            : 10 - Math.floor(index / rows);
        unit.y = index % rows;
      });
  battle.tactical = {
    turn: 1,
    phase: "deployment",
    selectedId: null,
    units,
    log: ["调整己方阵列，准备完成后开战。"],
    observedLog: {
      attacker: ["调整己方阵列，准备完成后开战。"],
      defender: ["调整己方阵列，准备完成后开战。"],
    },
    winner: null,
    activeSide: "attacker",
    activeUnitId: null,
    clock: 0,
    activation: 0,
    lastAction: null,
  };
  world.military.activeBattleId = battle.id;
}
export function commitTactical(
  content: Content,
  world: WorldState,
  battle: Battle,
  retreatSide?: "attacker" | "defender",
) {
  const t = battle.tactical;
  if (
    !t ||
    battle.phase !== "ready" ||
    world.military.activeBattleId !== battle.id
  )
    throw new Error("战术快照不存在或已经结算");
  if (retreatSide) {
    t.winner = retreatSide === "attacker" ? "defender" : "attacker";
    for (const u of t.units.filter((u) => u.side === retreatSide))
      applyCasualties(u, (u.cadre + u.levy) * 0.12);
  }
  if (!t.winner) throw new Error("决战尚未结束");
  for (const unit of t.units) {
    const army = unit.armyId ? world.military.armies[unit.armyId] : null;
    const target = army?.units.find((u) => u.id === unit.id);
    if (target) {
      target.cadre = unit.cadre;
      target.levy = unit.levy;
      target.morale = unit.morale;
      target.training = Math.min(100, unit.training + 5);
    }
  }
  battle.garrison = t.units
    .filter((unit) => unit.armyId === null && unit.side === "defender")
    .reduce((sum, unit) => sum + unit.cadre + unit.levy, 0);
  t.phase = "finished";
  finishBattle(content, world, battle, t.winner, false);
}

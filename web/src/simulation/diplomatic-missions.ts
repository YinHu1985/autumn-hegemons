import type { Content } from "../definitions/types";
import { copyWorld, type WorldState } from "./state";
import { recordChronicle } from "./civic";
import { changeRelation, type DiplomaticMission } from "./diplomacy";

const hasLand = (world: WorldState, nationId: string) =>
  Object.values(world.settlements).some((city) => city.owner === nationId);

function releaseMission(world: WorldState, mission: DiplomaticMission): void {
  world.diplomacy.missions = world.diplomacy.missions.filter(
    (item) => item.id !== mission.id,
  );
  const envoy = world.research.talents[mission.envoyId];
  if (
    envoy?.role === "envoy" &&
    !world.diplomacy.missions.some((item) => item.envoyId === envoy.id)
  )
    envoy.busy = false;
}

export function startDiplomaticMission(
  content: Content,
  world: WorldState,
  nationId: string,
  targetNationId: string,
  actionId: string,
  envoyId: string,
): WorldState {
  const action = content.diplomacy.actions.find(
    (entry) => entry.id === actionId,
  );
  const nation = world.nations[nationId];
  if (!nation || !world.nations[targetNationId] || nationId === targetNationId)
    throw new Error("请选择另一个国家作为外交目标");
  if (!hasLand(world, nationId) || !hasLand(world, targetNationId))
    throw new Error("灭亡国家不能执行外交任务");
  if (!action) throw new Error("外交行动不存在");
  const envoy = world.research.talents[envoyId];
  if (
    !envoy ||
    envoy.nationId !== nationId ||
    envoy.role !== "envoy" ||
    envoy.recruitedMonth === null
  )
    throw new Error("请先在人才馆任命本国使者");
  if (
    envoy.busy ||
    world.diplomacy.missions.some((mission) => mission.envoyId === envoyId)
  )
    throw new Error("此使者正在执行任务");
  if (
    world.diplomacy.missions.some(
      (mission) =>
        mission.nationId === nationId &&
        mission.targetNationId === targetNationId,
    )
  )
    throw new Error("对该国已有外交任务，请待任务完成或撤回");
  if (nation.treasury < action.cost) throw new Error("国库粮食不足以派出使者");
  const next = copyWorld(world);
  next.nations[nationId].treasury -= action.cost;
  next.research.talents[envoyId].busy = true;
  next.diplomacy.missions.push({
    id: `diplomacy-${next.diplomacy.nextId++}`,
    nationId,
    targetNationId,
    envoyId,
    actionId,
    totalDays: action.days,
    remainingDays: action.days,
  });
  return next;
}

/** Recall is immediate, with no relation effect and no refund of an already sent gift. */
export function cancelDiplomaticMission(
  world: WorldState,
  nationId: string,
  missionId: string,
): WorldState {
  const mission = world.diplomacy.missions.find(
    (entry) => entry.id === missionId,
  );
  if (!mission || mission.nationId !== nationId)
    throw new Error("只能撤回本国正在执行的外交任务");
  const next = copyWorld(world);
  releaseMission(next, mission);
  recordChronicle(next, nationId, "已撤回外交使者，任务未产生关系变化。");
  return next;
}

/** Called before a talent retires or dies so monthly saves never retain dangling envoys. */
export function cancelDiplomacyTasksForTalent(
  world: WorldState,
  talentId: string,
): void {
  if (!world.diplomacy?.missions) return;
  for (const mission of [...world.diplomacy.missions]) {
    if (mission.envoyId !== talentId) continue;
    releaseMission(world, mission);
    recordChronicle(world, mission.nationId, "外交使者退场，出使任务中止。");
  }
}

export function tickDiplomacyDay(content: Content, world: WorldState): void {
  for (const mission of [...world.diplomacy.missions]) {
    const envoy = world.research.talents[mission.envoyId];
    const action = content.diplomacy.actions.find(
      (entry) => entry.id === mission.actionId,
    );
    if (
      !envoy ||
      envoy.nationId !== mission.nationId ||
      envoy.role !== "envoy" ||
      envoy.recruitedMonth === null ||
      !hasLand(world, mission.nationId) ||
      !hasLand(world, mission.targetNationId) ||
      !action
    ) {
      releaseMission(world, mission);
      recordChronicle(
        world,
        mission.nationId,
        "外交任务中止：使者或目标国家已不可用。",
      );
      continue;
    }
    mission.remainingDays -= 1;
    if (mission.remainingDays > 0) continue;
    const value = changeRelation(
      content,
      world,
      mission.nationId,
      mission.targetNationId,
      action.relationChange,
    );
    releaseMission(world, mission);
    const nationName = (id: string) =>
      content.scenario.nations.find((nation) => nation.id === id)?.name ?? id;
    recordChronicle(
      world,
      mission.nationId,
      `${envoy.name}向${nationName(mission.targetNationId)}国${action.name}完成，两国关系变为 ${value > 0 ? "+" : ""}${value}。`,
    );
    recordChronicle(
      world,
      mission.targetNationId,
      `${nationName(mission.nationId)}国使者${action.name}，两国关系变为 ${value > 0 ? "+" : ""}${value}。`,
    );
  }
}

/** Called once at the year boundary; drift approaches the centre without overshooting. */
export function tickDiplomacyYear(content: Content, world: WorldState): void {
  const { center, yearlyDrift } = content.diplomacy;
  for (const relation of world.diplomacy.relations) {
    const gap = center - relation.value;
    relation.value += Math.sign(gap) * Math.min(Math.abs(gap), yearlyDrift);
  }
}

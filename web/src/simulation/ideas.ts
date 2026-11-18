import type { Content } from "../definitions/types";
import type { WorldState } from "./state";
import { copyWorld } from "./state";
import { resolveStat } from "./modifier-query";
import { applyEffects } from "./effects";

type IdeaWorld = Pick<WorldState, "research">;

export function isIdeaUnlocked(
  content: Content,
  world: IdeaWorld,
  nationId: string,
  ideaId: string,
): boolean {
  return (
    content.ideas.some((idea) => idea.id === ideaId) &&
    (world.research.nations[nationId]?.unlockedIdeas.includes(ideaId) ?? false)
  );
}

/** Shared idempotent action for research, events, or other future unlock sources. */
export function unlockIdea(
  content: Content,
  world: IdeaWorld,
  nationId: string,
  ideaId: string,
): void {
  if (!content.ideas.some((idea) => idea.id === ideaId))
    throw new Error(`理念不存在：${ideaId}`);
  const state = world.research.nations[nationId];
  if (!state) throw new Error(`国家不存在：${nationId}`);
  if (!state.unlockedIdeas.includes(ideaId)) state.unlockedIdeas.push(ideaId);
}

export function ideaSlots(
  content: Content,
  world: WorldState,
  nationId: string,
): number {
  return resolveStat(content, world, { nationId }, "idea.slots", 2, { min: 1 })
    .value;
}

export function enactIdea(
  content: Content,
  world: WorldState,
  nationId: string,
  id: string,
): WorldState {
  if (!isIdeaUnlocked(content, world, nationId, id))
    throw new Error("尚未解锁该理念");
  const next = copyWorld(world);
  const enacted = next.research.nations[nationId].enacted;
  const idea = content.ideas.find((item) => item.id === id)!;
  const removing = enacted.includes(id);
  if (removing) enacted.splice(enacted.indexOf(id), 1);
  else {
    if (enacted.length >= ideaSlots(content, world, nationId))
      throw new Error("理念槽位已满，请先卸下一个理念");
    enacted.push(id);
  }
  applyEffects(
    content,
    next,
    { nationId, source: { kind: "idea", id, name: idea.name } },
    (removing ? idea.repealEffects : idea.enactEffects) ?? [],
  );
  return next;
}

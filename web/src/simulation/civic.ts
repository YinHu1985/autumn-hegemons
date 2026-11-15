import type { Content, DateValue } from "../definitions/types";
import type { WorldState } from "./state";
import { copyWorld } from "./state";
import { calculateEconomy } from "./economy";
import { addResearchInspiration, researchModifier } from "./research";
export { buildingCapacity, constructionQuote } from "./settlements";

export interface ActiveEvent {
  id: string;
  definitionId: string;
  nationId: string;
  daysLeft: number;
}
export interface ChronicleEntry {
  date: DateValue;
  nationId: string;
  text: string;
}
export interface CivicState {
  events: ActiveEvent[];
  log: ChronicleEntry[];
  seed: number;
  nextEventId: number;
}
export function createCivic(_content: Content): CivicState {
  return { events: [], log: [], seed: 450, nextEventId: 1 };
}
export function civicRandom(world: WorldState): number {
  world.civic.seed = (Math.imul(world.civic.seed, 1664525) + 1013904223) >>> 0;
  return world.civic.seed / 4294967296;
}
export function recordChronicle(
  world: WorldState,
  nationId: string,
  text: string,
): void {
  world.civic.log.unshift({ date: { ...world.date }, nationId, text });
  world.civic.log = world.civic.log.slice(0, 160);
}
export function manpowerCapacity(
  content: Content,
  world: WorldState,
  nationId: string,
): number {
  const cities = Object.values(world.settlements).filter(
    (city) => city.owner === nationId,
  );
  const value = cities.reduce(
    (sum, city) => sum + city.scale * city.governance * 2000,
    0,
  );
  const garrison =
    calculateEconomy(content, world, nationId).modifiers.manpower ?? 0;
  return Math.floor(
    value *
      Math.max(
        0.1,
        1 + garrison + researchModifier(content, world, nationId, "manpower"),
      ),
  );
}
function applyEvent(
  content: Content,
  world: WorldState,
  event: ActiveEvent,
  choice: number,
): void {
  const definition = content.events.find(
    (item) => item.id === event.definitionId,
  );
  const option = definition?.options[choice];
  if (!option) throw new Error("事件选项不存在");
  const nation = world.nations[event.nationId];
  for (const effect of option.effects) {
    if (effect.kind === "research") {
      const targets = effect.targetId
        ? [effect.targetId]
        : world.research.nations[nation.id].groups.map(
            (group) => group.targetId,
          );
      for (const targetId of targets)
        addResearchInspiration(
          content,
          world,
          nation.id,
          targetId,
          effect.amount,
        );
    } else if (effect.kind === "governance") {
      const before = manpowerCapacity(content, world, nation.id);
      for (const city of Object.values(world.settlements).filter(
        (item) => item.owner === nation.id,
      ))
        city.governance = Math.max(
          0.05,
          Math.min(1, city.governance + effect.amount),
        );
      const after = manpowerCapacity(content, world, nation.id);
      if (after < before)
        nation.manpower = before
          ? Math.floor((nation.manpower * after) / before)
          : 0;
    } else if (effect.kind === "grain")
      nation.treasury = Math.max(0, nation.treasury + effect.amount);
    else
      nation[effect.kind] = Math.max(
        0,
        Math.min(
          manpowerCapacity(content, world, nation.id),
          nation[effect.kind] + effect.amount,
        ),
      );
  }
  recordChronicle(world, nation.id, `${definition!.title}：${option.label}`);
  world.civic.events = world.civic.events.filter(
    (item) => item.id !== event.id,
  );
}
export function chooseEvent(
  content: Content,
  world: WorldState,
  eventId: string,
  choice: number,
): WorldState {
  const next = copyWorld(world);
  const event = next.civic.events.find((item) => item.id === eventId);
  if (!event) throw new Error("事件已处理或过期");
  applyEvent(content, next, event, choice);
  return next;
}
export function tickCivicDay(content: Content, world: WorldState): void {
  for (const city of Object.values(world.settlements)) {
    const cap = Math.min(
      1,
      0.85 + researchModifier(content, world, city.owner, "governance_cap"),
    );
    if (city.governance < cap)
      city.governance = Math.min(
        cap,
        city.governance +
          0.0005 *
            (1 +
              researchModifier(
                content,
                world,
                city.owner,
                "governance_growth",
              )),
      );
  }
  for (const event of [...world.civic.events]) {
    event.daysLeft -= 1;
    if (event.daysLeft <= 0) applyEvent(content, world, event, 0);
  }
}
export function tickCivicMonth(content: Content, world: WorldState): void {
  for (const nation of Object.values(world.nations)) {
    const capacity = manpowerCapacity(content, world, nation.id);
    nation.manpower = Math.min(
      capacity,
      nation.manpower + Math.floor(capacity * 0.015),
    );
    if (
      !capacity ||
      world.civic.events.some((event) => event.nationId === nation.id)
    )
      continue;
    if (civicRandom(world) > 0.22 || !content.events.length) continue;
    let choice =
      civicRandom(world) *
      content.events.reduce((sum, event) => sum + event.weight, 0);
    const selected =
      content.events.find((event) => (choice -= event.weight) <= 0) ??
      content.events[0];
    world.civic.events.push({
      id: `event-${world.civic.nextEventId++}`,
      definitionId: selected.id,
      nationId: nation.id,
      daysLeft: selected.duration,
    });
  }
}

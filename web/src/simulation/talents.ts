import type { WorldState } from "./state";
import { copyWorld } from "./state";
import type { ResearchState, TalentRole } from "./research-state";
import { absoluteMonth, researchRandom } from "./research-state";
import type { ResearchCategory } from "../definitions/research";
const surnames = [
  "田",
  "孟",
  "公孙",
  "季",
  "仲",
  "申",
  "乐",
  "孙",
  "墨",
  "荀",
  "韩",
  "卫",
];
const names = [
  "宁",
  "成",
  "衡",
  "远",
  "敬",
  "仪",
  "策",
  "简",
  "敖",
  "端",
  "修",
  "正",
];
export function generateTalent(
  state: ResearchState,
  nationId: string,
  month: number | null,
) {
  const id = `talent_${state.nextId++}`;
  const roll = () => 25 + Math.floor(researchRandom(state) * 66);
  state.talents[id] = {
    id,
    nationId,
    name:
      surnames[Math.floor(researchRandom(state) * surnames.length)] +
      names[Math.floor(researchRandom(state) * names.length)],
    role: "idle",
    command: roll(),
    martial: roll(),
    administration: roll(),
    scholarship: roll(),
    specialty: (
      ["civil", "craft", "military", "humanities"] as ResearchCategory[]
    )[Math.floor(researchRandom(state) * 4)],
    recruitedMonth: month,
    busy: false,
    portrait: `assets/portraits/${["xunzi", "wuzixu", "lvbuwei", "gongsunlong"][Math.floor(researchRandom(state) * 4)]}.webp`,
  };
  return state.talents[id];
}
export function refreshTalentPool(
  world: WorldState,
  nationId: string,
): WorldState {
  if (world.nations[nationId].treasury < 15) throw new Error("访贤需要15粮");
  const next = copyWorld(world);
  next.nations[nationId].treasury -= 15;
  refreshCandidates(next.research, nationId, absoluteMonth(next.date));
  return next;
}
export function refreshCandidates(
  state: ResearchState,
  nationId: string,
  month: number,
) {
  for (const t of Object.values(state.talents))
    if (t.nationId === nationId && t.recruitedMonth === null)
      delete state.talents[t.id];
  for (let i = 0; i < 5; i++) generateTalent(state, nationId, null);
  state.nations[nationId].lastRefresh = month;
}
export function recruitTalent(
  world: WorldState,
  nationId: string,
  id: string,
): WorldState {
  const talent = world.research.talents[id];
  if (!talent || talent.nationId !== nationId || talent.recruitedMonth !== null)
    throw new Error("此人不可招募");
  if (world.nations[nationId].treasury < 10) throw new Error("招募需要10粮");
  const next = copyWorld(world);
  next.nations[nationId].treasury -= 10;
  next.research.talents[id].recruitedMonth = absoluteMonth(world.date);
  return next;
}
export function assignTalent(
  world: WorldState,
  nationId: string,
  id: string,
  role: TalentRole,
): WorldState {
  if (!["idle", "advisor", "general", "research", "envoy"].includes(role))
    throw new Error("未知人才职务");
  const talent = world.research.talents[id];
  if (!talent || talent.nationId !== nationId || talent.recruitedMonth === null)
    throw new Error("尚未招募这位人才");
  if (talent.busy) throw new Error("此人正在执行任务");
  if (world.research.nations[nationId].groups.some((g) => g.leaderId === id))
    throw new Error("请先结束该人才主持的课题");
  if (
    Object.values(world.military?.armies ?? {}).some(
      (a) => a.generalId === id && a.status !== "idle",
    )
  )
    throw new Error("将领正在出征或休整");
  const next = copyWorld(world);
  next.research.talents[id].role = role;
  if (role !== "general")
    for (const army of Object.values(next.military?.armies ?? {}))
      if (army.generalId === id) army.generalId = null;
  return next;
}

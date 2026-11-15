import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
const bundle = await build({
  stdin: {
    contents: `export * from './src/simulation/research.ts'; export * from './src/simulation/state.ts'; export * from './src/definitions/validate.ts'; export * from './src/simulation/research-ai.ts'; export * from './src/definitions/modifiers.ts';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const rules = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);
const names = [
  "goods",
  "buildings",
  "scenario",
  "technologies",
  "ideas",
  "units",
  "events",
];
const entries = await Promise.all(
  names.map(async (name) => {
    const value = JSON.parse(
      await readFile(`public/content/base/${name}.json`, "utf8"),
    );
    return [name, value];
  }),
);
const content = rules.validateContent(Object.fromEntries(entries));
function researcher(world) {
  return Object.values(world.research.talents).find(
    (t) => t.nationId === "qi" && t.role === "research",
  ).id;
}

test("87项科技的直系前置有效，独立高档理念可以直接开研", () => {
  assert.equal(content.technologies.length, 87);
  const world = rules.createWorld(content);
  const leader = researcher(world);
  assert.throws(
    () => rules.startResearch(content, world, "qi", "iron_3", leader),
    /前置/,
  );
  const idea = content.ideas.find((t) => t.tier === 3);
  const next = rules.startResearch(content, world, "qi", idea.id, leader);
  assert.equal(next.research.nations.qi.groups[0].targetId, idea.id);
  assert.equal(world.research.nations.qi.groups.length, 0);
});
test("研究必须先拨款，零预算后下一周期不会继续免费获得进度", () => {
  let world = rules.createWorld(content);
  world = rules.startResearch(
    content,
    world,
    "qi",
    "iron_1",
    researcher(world),
  );
  rules.tickResearchMonth(content, world);
  assert.equal(world.research.nations.qi.progress.iron_1, 0);
  world.nations.qi.operatingCoverage.research = 0.5;
  rules.fundResearchMonth(world, "qi");
  assert.equal(world.research.nations.qi.groups[0].fundedInvestment, 2.5);
  rules.tickResearchMonth(content, world);
  const gained = world.research.nations.qi.progress.iron_1;
  assert.ok(gained > 0);
  world.nations.qi.operatingCoverage.research = 0;
  rules.fundResearchMonth(world, "qi");
  rules.tickResearchMonth(content, world);
  assert.equal(world.research.nations.qi.progress.iron_1, gained);
});
test("知识启发按已知成果重算并封顶，不随月重复累计或自动完成", () => {
  const world = rules.createWorld(content);
  const state = world.research.nations.qi;
  state.unlocked = content.technologies
    .filter((t) => t.tier === 1)
    .map((t) => t.id);
  const target = content.technologies.find((t) => t.id === "iron_2");
  const first = rules.inspiration(content, world, "qi", target);
  assert.equal(first, target.cost * target.inspirationCap);
  rules.tickResearchMonth(content, world);
  assert.equal(rules.inspiration(content, world, "qi", target), first);
  assert.equal(state.unlocked.includes("iron_2"), false);
  assert.ok(rules.researchProgress(content, world, "qi", target) < target.cost);
});
test("同类超编惩罚作用全部组，世界传播随掌握国家增加而加速", () => {
  let world = rules.createWorld(content);
  world = rules.startResearch(
    content,
    world,
    "qi",
    "iron_1",
    researcher(world),
  );
  const group = world.research.nations.qi.groups[0];
  group.fundedInvestment = 5;
  const normal = rules.groupMonthlyProgress(content, world, "qi", group);
  world.research.nations.qi.groups.push({
    ...group,
    id: "excess",
    targetId: "gold_1",
  });
  assert.ok(
    rules.groupMonthlyProgress(content, world, "qi", group) < normal * 0.3,
  );
  world.research.nations.qi.groups.pop();
  world.research.nations.lu.unlocked.push("iron_1");
  assert.ok(rules.groupMonthlyProgress(content, world, "qi", group) > normal);
});
test("理念效果仅在安排实行后应用，卸下后知识仍保留", () => {
  let world = rules.createWorld(content);
  const idea = content.ideas.find((t) => t.id === "idea_wuwei_erzhi");
  world.research.nations.qi.unlocked.push(idea.id);
  const initial = rules.researchModifier(content, world, "qi", "income");
  world = rules.enactIdea(content, world, "qi", idea.id);
  assert.equal(
    rules.researchModifier(content, world, "qi", "income"),
    initial + idea.effects.income,
  );
  world = rules.enactIdea(content, world, "qi", idea.id);
  assert.equal(rules.researchModifier(content, world, "qi", "income"), initial);
  assert.ok(world.research.nations.qi.unlocked.includes(idea.id));
});
test("正在主持课题的人才不可同时转任将领", () => {
  let world = rules.createWorld(content);
  const leader = researcher(world);
  world = rules.startResearch(content, world, "qi", "iron_1", leader);
  assert.throws(
    () => rules.assignTalent(world, "qi", leader, "general"),
    /课题/,
  );
  world = rules.stopResearch(
    world,
    "qi",
    world.research.nations.qi.groups[0].id,
  );
  world = rules.assignTalent(world, "qi", leader, "general");
  assert.equal(world.research.talents[leader].role, "general");
});

test("AI 会按财政招募人才并开展四个独立科研类别", () => {
  const world = rules.createWorld(content);
  world.nations.lu.treasury = 1000;
  for (let i = 0; i < 4; i++) rules.tickResearchAI(content, world, "qi");
  const groups = world.research.nations.lu.groups;
  assert.equal(groups.length, 4);
  const subjects = rules.researchSubjects(content);
  assert.equal(
    new Set(
      groups.map((g) => subjects.find((t) => t.id === g.targetId).category),
    ).size,
    4,
  );
  assert.equal(new Set(groups.map((g) => g.leaderId)).size, 4);
  assert.ok(world.nations.lu.treasury < 1000);
});

test("词条注册表拒绝未接入计算的拼写，支持产线与类别动态键", () => {
  assert.throws(
    () => rules.validateModifiers({ "research.spedd": 0.2 }, "test"),
    /未注册/,
  );
  assert.deepEqual(
    rules.validateModifiers(
      { "production.iron": 0.2, "research.seats.craft": 1 },
      "test",
    ),
    { "production.iron": 0.2, "research.seats.craft": 1 },
  );
  assert.equal(
    rules.formatModifier("army.cadre_ratio", 0.15),
    "常备比例上限 +15%",
  );
});

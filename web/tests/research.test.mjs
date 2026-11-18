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
  "modifierDefinitions",
];
const entries = await Promise.all(
  names.map(async (name) => {
    const value = JSON.parse(
      await readFile(
        `public/content/base/${name === "modifierDefinitions" ? "modifier-definitions" : name}.json`,
        "utf8",
      ),
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

test("105项科技统一研究，独立高档百家科技可跳档但理念不可直接开研", () => {
  assert.equal(content.technologies.length, 105);
  assert.equal(content.ideas.length, 18);
  const world = rules.createWorld(content);
  const leader = researcher(world);
  assert.throws(
    () => rules.startResearch(content, world, "qi", "iron_3", leader),
    /前置/,
  );
  const topic = content.technologies.find(
    (t) => t.category === "humanities" && t.tier === 3,
  );
  const idea = content.ideas.find(
    (item) => item.id === topic.completionEffects[0].ideaId,
  );
  assert.equal(topic.prerequisite, undefined);
  assert.throws(
    () => rules.startResearch(content, world, "qi", idea.id, leader),
    /课题不存在/,
  );
  assert.ok(
    !rules.researchSubjects(content).some((item) => item.id === idea.id),
  );
  const next = rules.startResearch(content, world, "qi", topic.id, leader);
  assert.equal(next.research.nations.qi.groups[0].targetId, topic.id);
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
test("研究解锁理念但不自动实行，卸下只移除实行效果而不删除科技", () => {
  let world = rules.createWorld(content);
  const idea = content.ideas.find((t) => t.id === "idea_wuwei_erzhi");
  const topic = content.technologies.find((t) =>
    t.completionEffects?.some((effect) => effect.ideaId === idea.id),
  );
  const initial = rules.researchModifier(content, world, "qi", "income");
  assert.equal(rules.isIdeaUnlocked(content, world, "qi", idea.id), false);
  assert.throws(() => rules.enactIdea(content, world, "qi", idea.id), /解锁/);
  world = rules.startResearch(
    content,
    world,
    "qi",
    topic.id,
    researcher(world),
  );
  world.research.nations.qi.progress[topic.id] = topic.cost - 0.01;
  rules.fundResearchMonth(world, "qi");
  rules.tickResearchMonth(content, world);
  assert.equal(rules.isIdeaUnlocked(content, world, "qi", idea.id), true);
  assert.deepEqual(world.research.nations.qi.unlockedIdeas, [idea.id]);
  assert.ok(!world.research.nations.qi.unlocked.includes(idea.id));
  assert.deepEqual(world.research.nations.qi.enacted, []);
  assert.equal(rules.researchModifier(content, world, "qi", "income"), initial);
  world = rules.enactIdea(content, world, "qi", idea.id);
  assert.equal(
    rules.researchModifier(content, world, "qi", "income"),
    initial + idea.effects.income,
  );
  world = rules.enactIdea(content, world, "qi", idea.id);
  assert.equal(rules.researchModifier(content, world, "qi", "income"), initial);
  assert.ok(world.research.nations.qi.unlocked.includes(topic.id));
  assert.equal(rules.isIdeaUnlocked(content, world, "qi", idea.id), true);
});

test("理念可由独立动作解锁，既不要求科技也不自动生效，重复动作幂等", () => {
  let world = rules.createWorld(content);
  const idea = content.ideas.find((entry) => entry.id === "idea_wuwei_erzhi");
  const known = [...world.research.nations.qi.unlocked];
  const before = rules.researchModifier(content, world, "qi", "income");
  rules.unlockIdea(content, world, "qi", idea.id);
  rules.unlockIdea(content, world, "qi", idea.id);
  assert.deepEqual(world.research.nations.qi.unlockedIdeas, [idea.id]);
  assert.deepEqual(world.research.nations.qi.unlocked, known);
  assert.deepEqual(world.research.nations.qi.enacted, []);
  assert.equal(rules.researchModifier(content, world, "qi", "income"), before);
  world = rules.enactIdea(content, world, "qi", idea.id);
  assert.equal(
    rules.researchModifier(content, world, "qi", "income"),
    before + idea.effects.income,
  );
  world = rules.enactIdea(content, world, "qi", idea.id);
  assert.equal(rules.isIdeaUnlocked(content, world, "qi", idea.id), true);
  assert.deepEqual(world.research.nations.qi.unlocked, known);
  assert.throws(
    () => rules.unlockIdea(content, world, "qi", "unknown"),
    /理念不存在/,
  );
});

test("初始科技也执行完成动作，完成动作可解锁多个理念且不强制一对一", () => {
  const custom = structuredClone(content);
  const ideaIds = custom.ideas.slice(0, 2).map((idea) => idea.id);
  const effects = ideaIds.map((ideaId) => ({ type: "unlock_idea", ideaId }));
  custom.technologies.find((t) => t.id === "agriculture_1").completionEffects =
    effects;
  custom.technologies.find((t) => t.id === "infantry_1").completionEffects =
    effects;
  const checked = rules.validateContent(custom);
  const world = rules.createWorld(checked);
  for (const state of Object.values(world.research.nations)) {
    assert.deepEqual(state.unlockedIdeas, ideaIds);
    assert.deepEqual(state.enacted, []);
  }
  rules.tickResearchMonth(checked, world);
  assert.deepEqual(world.research.nations.qi.unlockedIdeas, ideaIds);
});

test("研究完成只处理一次动作与完成通知，已完成的冗余研究组不会再次触发", () => {
  let world = rules.createWorld(content);
  const topic = content.technologies.find(
    (t) => t.id === "doctrine_youjiao_wulei",
  );
  world = rules.startResearch(
    content,
    world,
    "qi",
    topic.id,
    researcher(world),
  );
  const state = world.research.nations.qi;
  const group = { ...state.groups[0] };
  state.progress[topic.id] = topic.cost - 0.01;
  rules.fundResearchMonth(world, "qi");
  rules.tickResearchMonth(content, world);
  assert.equal(state.unlocked.filter((id) => id === topic.id).length, 1);
  assert.equal(
    state.notices.filter((entry) => entry === `研究完成：${topic.name}`).length,
    1,
  );
  state.unlockedIdeas = [];
  state.groups.push({ ...group, id: "stale_group" });
  rules.tickResearchMonth(content, world);
  assert.deepEqual(state.unlockedIdeas, []);
  assert.deepEqual(state.groups, []);
  assert.equal(
    state.notices.filter((entry) => entry === `研究完成：${topic.name}`).length,
    1,
  );
});

test("AI 可实行非科研来源解锁的理念，不能把已有科技反查为理念资格", () => {
  const world = rules.createWorld(content);
  const idea = content.ideas.find((entry) => entry.id === "idea_wuwei_erzhi");
  world.nations.lu.treasury = 0;
  world.research.nations.lu.unlocked.push("doctrine_wuwei_erzhi");
  rules.tickResearchAI(content, world, "qi");
  assert.deepEqual(world.research.nations.lu.enacted, []);
  rules.unlockIdea(content, world, "lu", idea.id);
  rules.tickResearchAI(content, world, "qi");
  assert.deepEqual(world.research.nations.lu.enacted, [idea.id]);
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
    "常备比例上限 +15个百分点",
  );
});

test("百家与普通科技共用同类前档启发，跨学派也可贡献", () => {
  const world = rules.createWorld(content);
  const target = content.technologies.find(
    (t) => t.id === "doctrine_zhongyong_zhidao",
  );
  world.research.nations.qi.unlocked.push("doctrine_wuwei_erzhi");
  assert.equal(
    rules.inspiration(content, world, "qi", target),
    target.inspiration,
  );
  world.research.nations.qi.unlocked.push("doctrine_jianai_jiaoli");
  assert.equal(
    rules.inspiration(content, world, "qi", target),
    Math.min(target.cost * target.inspirationCap, target.inspiration * 2),
  );
});

test("百家类可包含不解锁理念的普通永久效果科技", () => {
  const custom = structuredClone(content);
  const topic = {
    ...custom.technologies.find(
      (t) => t.category === "humanities" && t.tier === 1,
    ),
    id: "humanities_institutions",
    name: "典章编纂",
    route: "institutions",
    routeName: "典章",
    effects: { income: 0.2 },
    completionEffects: [],
  };
  custom.technologies.push(topic);
  const checked = rules.validateContent(custom);
  let world = rules.createWorld(checked);
  const before = rules.researchModifier(checked, world, "qi", "income");
  world = rules.startResearch(
    checked,
    world,
    "qi",
    topic.id,
    researcher(world),
  );
  world.research.nations.qi.progress[topic.id] = topic.cost - 0.01;
  rules.fundResearchMonth(world, "qi");
  rules.tickResearchMonth(checked, world);
  assert.equal(
    rules.researchModifier(checked, world, "qi", "income"),
    before + 0.2,
  );
  assert.deepEqual(world.research.nations.qi.enacted, []);
  assert.deepEqual(world.research.nations.qi.unlockedIdeas, []);
});

test("发布科技按类别采用主能力，次能力权重不得盖过主能力", () => {
  const expected = {
    civil: "administration",
    craft: "administration",
    military: "command",
    humanities: "scholarship",
  };
  for (const topic of content.technologies) {
    const primary = expected[topic.category];
    assert.equal(topic.attributeWeights[primary], 1, topic.id);
    for (const [attribute, weight] of Object.entries(topic.attributeWeights))
      if (attribute !== primary) assert.ok(weight < 1, topic.id);
  }
});

test("每月科研实得使用主能力，次能力加成真实生效且无关能力无效", () => {
  for (const [id, primary, secondary, unused] of [
    ["agriculture_2", "administration", null, "command"],
    ["copper_1", "administration", "scholarship", "command"],
    ["infantry_2", "command", null, "administration"],
    ["doctrine_youjiao_wulei", "scholarship", null, "command"],
  ]) {
    let world = rules.createWorld(content);
    const topic = content.technologies.find((t) => t.id === id);
    const leaderId = researcher(world);
    const leader = world.research.talents[leaderId];
    Object.assign(leader, {
      administration: 0,
      scholarship: 0,
      command: 0,
      specialty: topic.category,
    });
    world = rules.startResearch(content, world, "qi", id, leaderId);
    const talent = world.research.talents[leaderId];
    const group = world.research.nations.qi.groups[0];
    group.fundedInvestment = 5;
    const base = rules.groupMonthlyProgress(content, world, "qi", group);
    talent[primary] = 100;
    const primaryRate = rules.groupMonthlyProgress(content, world, "qi", group);
    assert.ok(primaryRate > base * 2.9, id);
    talent[unused] = 100;
    assert.equal(
      rules.groupMonthlyProgress(content, world, "qi", group),
      primaryRate,
      id,
    );
    if (secondary) {
      talent[secondary] = 100;
      assert.ok(
        rules.groupMonthlyProgress(content, world, "qi", group) > primaryRate,
        id,
      );
      assert.equal(
        rules.researcherAptitude(topic, talent),
        1.5 + topic.attributeWeights[secondary],
      );
    }
  }
});

test("科技能力权重与完成动作严格校验，拒绝理念反向引用和旧研究字段", () => {
  for (const attributeWeights of [
    undefined,
    {},
    { administration: 0 },
    { administration: -1 },
    { administration: Infinity },
    { administration: NaN },
    { administration: "1" },
    { martial: 1 },
    { administration: 1, typo: 0 },
  ]) {
    const custom = structuredClone(content);
    custom.technologies[0].attributeWeights = attributeWeights;
    assert.throws(() => rules.validateContent(custom), /attributeWeights/);
  }
  for (const completionEffects of [
    {},
    [null],
    [{ type: "missing_action", ideaId: content.ideas[0].id }],
    [{ type: "unlock_idea", ideaId: "missing_idea" }],
    [{ type: "unlock_idea", ideaId: content.technologies[0].id }],
    [{ type: "unlock_idea", ideaId: "" }],
    [{ type: "unlock_idea", ideaId: content.ideas[0].id, typo: 1 }],
  ]) {
    const custom = structuredClone(content);
    custom.technologies[0].completionEffects = completionEffects;
    assert.throws(
      () => rules.validateContent(custom),
      /完成动作|completionEffects|动作字段/,
    );
  }
  for (const field of [
    "cost",
    "tier",
    "category",
    "route",
    "prerequisite",
    "inspiration",
    "attributeWeights",
    "technology",
    "completionEffects",
  ]) {
    const custom = structuredClone(content);
    custom.ideas[0][field] = 1;
    assert.throws(() => rules.validateContent(custom), /科研字段/);
  }
});

test("AI 按实际课题能力与专长选择负责人，不一律选择最高学识", () => {
  for (const [id, primary, competing] of [
    ["agriculture_2", "administration", "scholarship"],
    ["gold_1", "administration", "scholarship"],
    ["infantry_2", "command", "scholarship"],
    ["doctrine_youjiao_wulei", "scholarship", "administration"],
  ]) {
    const world = rules.createWorld(content);
    world.nations.lu.treasury = 50;
    const topic = content.technologies.find((t) => t.id === id);
    world.research.nations.lu.unlocked = content.technologies
      .filter((t) => t.id !== id)
      .map((t) => t.id);
    const template = Object.values(world.research.talents).find(
      (t) => t.nationId === "lu" && t.role === "research",
    );
    for (const talent of Object.values(world.research.talents))
      if (talent.nationId === "lu") delete world.research.talents[talent.id];
    for (const [key, high] of [
      ["lu_fit", primary],
      ["lu_other", competing],
    ])
      world.research.talents[key] = {
        ...template,
        id: key,
        administration: 10,
        scholarship: 10,
        command: 10,
        [high]: 95,
        specialty: topic.category,
      };
    rules.tickResearchAI(content, world, "qi");
    assert.equal(
      world.research.nations.lu.groups.find((group) => group.targetId === id)
        ?.leaderId,
      "lu_fit",
      id,
    );
  }
});

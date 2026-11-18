import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundle = await build({
  stdin: {
    contents: `export * from './src/simulation/state.ts'; export * from './src/simulation/modifier-query.ts'; export * from './src/simulation/modifier-clock.ts'; export * from './src/simulation/modifier-instances.ts'; export * from './src/simulation/effects.ts'; export * from './src/simulation/research.ts'; export * from './src/simulation/civic.ts'; export * from './src/simulation/time.ts'; export * from './src/definitions/validate.ts';`,
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
const manifest = JSON.parse(
  await readFile("public/content/base/manifest.json", "utf8"),
);
const raw = Object.fromEntries(
  await Promise.all(
    Object.entries(manifest)
      .filter(([key]) => key !== "version")
      .map(async ([key, file]) => [
        key,
        JSON.parse(await readFile(`public/content/base/${file}`, "utf8")),
      ]),
  ),
);
const content = rules.validateContent(raw);
const source = { kind: "event", id: "test_event", name: "测试事件" };
const context = { nationId: "qi", source };
function fixture(definitions) {
  const custom = structuredClone(content);
  custom.modifierDefinitions.push(
    ...definitions.map((definition) => ({
      name: definition.id,
      description: "测试效果",
      scope: "nation",
      stacking: "refresh",
      ...definition,
    })),
  );
  const checked = rules.validateContent(custom);
  const world = rules.createWorld(checked);
  world.research.nations.qi.unlocked = [];
  world.research.nations.qi.enacted = [];
  for (const talent of Object.values(world.research.talents))
    talent.role = "idle";
  return { content: checked, world };
}
function add(content, world, modifierId, more = {}, effectContext = context) {
  rules.applyEffects(content, world, effectContext, [
    { type: "add_modifier", modifierId, ...more },
  ]);
}

test("同一查询合并科技、理念与额外状态，固定值、百分比和独立乘数按顺序计算", () => {
  const { content: custom, world } = fixture([
    {
      id: "factor",
      effects: { "army.limit": { operation: "multiply", value: 2 } },
    },
  ]);
  custom.technologies[0].effects = { "army.limit": 3 };
  custom.ideas[0].effects = {
    "army.limit": { operation: "add_percent", value: 0.5 },
  };
  world.research.nations.qi.unlocked = [custom.technologies[0].id];
  world.research.nations.qi.enacted = [custom.ideas[0].id];
  add(custom, world, "factor");
  const result = rules.resolveStat(custom, world, context, "army.limit", 2, {
    max: 14,
    round: "floor",
  });
  assert.equal(result.rawValue, 15);
  assert.equal(result.clampedValue, 14);
  assert.equal(result.value, 14);
  assert.equal(result.contributions.length, 3);
  assert.deepEqual(
    result.contributions.map((entry) => entry.source.kind),
    ["technology", "idea", "event"],
  );
  const visible = rules.listActiveModifiers(custom, world, context, {
    administrationOnly: true,
  });
  assert.equal(visible.length, 1);
  assert.equal(visible[0].name, "factor");
  world.research.nations.qi.enacted = [];
  assert.equal(
    rules.resolveStat(custom, world, context, "army.limit", 2).value,
    10,
  );
  assert.equal(world.modifiers.instances.length, 1);
});

test("显示覆盖只影响内政列表，隐藏额外状态和科技仍完整参与来源明细", () => {
  const { content: custom, world } = fixture([
    { id: "hidden", effects: { income: 0.2 }, showInAdministration: false },
  ]);
  custom.technologies[0].effects = { income: 0.1 };
  custom.technologies[0].showInAdministration = true;
  world.research.nations.qi.unlocked = [custom.technologies[0].id];
  add(custom, world, "hidden");
  assert.equal(
    rules.listActiveModifiers(custom, world, context, {
      administrationOnly: true,
    })[0].source.kind,
    "technology",
  );
  const result = rules.resolveStat(custom, world, context, "income", 100);
  assert.equal(result.value, 130);
  assert.equal(result.contributions.length, 2);
  world.modifiers.instances[0].showInAdministration = true;
  assert.equal(
    rules.listActiveModifiers(custom, world, context, {
      administrationOnly: true,
    }).length,
    2,
  );
});

test("城市局部状态只进入指定城市，国家贡献不会因城市查询重复计入", () => {
  const { content: custom, world } = fixture([
    { id: "national", effects: { income: 0.1 } },
    {
      id: "local",
      scope: "settlement",
      effects: {
        income: {
          op: "multiply",
          args: [{ metric: "settlement.governance" }, 0.2],
        },
      },
    },
  ]);
  const city = Object.values(world.settlements).find(
    (entry) => entry.owner === "qi",
  );
  city.governance = 0.5;
  add(custom, world, "national");
  add(custom, world, "local", { target: { kind: "settlement", id: city.id } });
  assert.equal(
    rules.resolveStat(custom, world, context, "income", 100).value,
    110.00000000000001,
  );
  assert.equal(
    rules.resolveStat(
      custom,
      world,
      { ...context, settlementId: city.id },
      "income",
      100,
    ).value,
    120,
  );
  assert.equal(
    rules.listActiveModifiers(custom, world, context, {
      administrationOnly: true,
      includeSettlements: true,
    }).length,
    2,
  );
  assert.equal(
    rules.resolveStat(custom, world, { nationId: "lu" }, "income", 100).value,
    100,
  );
  assert.throws(() => add(custom, world, "local"), /有效目标/);
  city.owner = "lu";
  assert.equal(
    rules.resolveStat(
      custom,
      world,
      { nationId: "lu", settlementId: city.id },
      "income",
      100,
    ).value,
    110.00000000000001,
  );
});

test("外加建筑来源同样按词条和目标筛选，局部城防不泄漏到国家", () => {
  const { content: custom, world } = fixture([]);
  const city = Object.values(world.settlements).find(
    (entry) => entry.owner === "qi",
  );
  const additional = [
    {
      key: "fortification",
      operation: "add",
      value: 2,
      source: { kind: "building", id: "wall", name: "城墙" },
      target: { kind: "settlement", id: city.id },
    },
    {
      key: "research_scale",
      operation: "add",
      value: 3,
      source: { kind: "building", id: "school", name: "学府" },
      target: { kind: "nation", id: "qi" },
    },
  ];
  assert.equal(
    rules.resolveStat(custom, world, context, "fortification", 0, {
      additional,
    }).value,
    0,
  );
  assert.equal(
    rules.resolveStat(
      custom,
      world,
      { ...context, settlementId: city.id },
      "fortification",
      0,
      { additional },
    ).value,
    2,
  );
  assert.equal(
    rules.resolveStat(custom, world, context, "research_scale", 10, {
      additional,
    }).value,
    13,
  );
});

test("持续表达式读取本期维护覆盖，不把计划预算立即冒充实付", () => {
  const { content: custom, world } = fixture([
    {
      id: "funding",
      effects: {
        income: {
          op: "multiply",
          args: [{ metric: "nation.operatingCoverage.buildings" }, 0.2],
        },
      },
    },
  ]);
  add(custom, world, "funding");
  world.nations.qi.budget.buildings = 0;
  assert.equal(
    rules.resolveStat(custom, world, context, "income", 100).value,
    120,
  );
  world.nations.qi.operatingCoverage.buildings = 0.5;
  assert.equal(
    rules.resolveStat(custom, world, context, "income", 100).value,
    110.00000000000001,
  );
  world.nations.qi.operatingCoverage.buildings = 0;
  assert.equal(
    rules.resolveStat(custom, world, context, "income", 100).value,
    100,
  );
});

test("游戏日序跨公元前后连续，到期当天立即失效，永久时间有限可序列化", () => {
  const previous = rules.gameDay({ year: -1, month: 12, day: 30 });
  assert.equal(rules.gameDay({ year: 1, month: 1, day: 1 }), previous + 1);
  assert.deepEqual(rules.dateFromGameDay(previous), {
    year: -1,
    month: 12,
    day: 30,
  });
  const { content: custom, world } = fixture([
    { id: "short", effects: { income: 0.5 } },
  ]);
  const start = rules.gameDay(world.date);
  add(custom, world, "short", { durationDays: 2 });
  world.date = rules.dateFromGameDay(start + 1);
  assert.equal(
    rules.resolveStat(custom, world, context, "income", 100).value,
    150,
  );
  world.date = rules.dateFromGameDay(start + 2);
  assert.equal(
    rules.resolveStat(custom, world, context, "income", 100).value,
    100,
  );
  assert.equal(
    world.modifiers.instances.length,
    1,
    "查询不通过修改状态来模拟到期",
  );
  rules.pruneExpiredModifiers(world);
  assert.deepEqual(world.modifiers.instances, []);
  add(custom, world, "short");
  assert.equal(
    world.modifiers.instances[0].expiresAt,
    rules.PERMANENT_MODIFIER_EXPIRY,
  );
  assert.equal(
    JSON.parse(JSON.stringify(world.modifiers)).instances[0].expiresAt,
    rules.PERMANENT_MODIFIER_EXPIRY,
  );
});

test("refresh按效果ID和对象刷新，后续来源能移除同效果，其他国家不受影响", () => {
  const { content: custom, world } = fixture([
    { id: "refresh", effects: { income: 0.1 } },
    { id: "stack", stacking: "stack", effects: { income: 0.1 } },
    { id: "replace", stacking: "replace", effects: { income: 0.1 } },
  ]);
  add(custom, world, "refresh", { durationDays: 5 });
  const firstId = world.modifiers.instances[0].id;
  add(
    custom,
    world,
    "refresh",
    { durationDays: 10 },
    { ...context, source: { ...source, instanceId: "second_occurrence" } },
  );
  assert.equal(world.modifiers.instances.length, 1);
  assert.equal(world.modifiers.instances[0].id, firstId);
  assert.equal(
    world.modifiers.instances[0].expiresAt,
    rules.gameDay(world.date) + 10,
  );
  const otherSource = { ...context, source: { ...source, id: "other" } };
  add(custom, world, "refresh", {}, otherSource);
  assert.equal(world.modifiers.instances.length, 1);
  assert.equal(world.modifiers.instances[0].id, firstId);
  assert.equal(world.modifiers.instances[0].source.id, "other");
  const otherNation = Object.keys(world.nations).find((id) => id !== "qi");
  add(custom, world, "refresh", {}, { ...context, nationId: otherNation });
  rules.applyEffects(custom, world, context, [
    { type: "remove_modifier", modifierId: "refresh" },
  ]);
  assert.equal(world.modifiers.instances.length, 1);
  assert.equal(world.modifiers.instances[0].target.id, otherNation);
  rules.applyEffects(custom, world, { ...context, nationId: otherNation }, [
    { type: "remove_modifier", modifierId: "refresh" },
  ]);
  add(custom, world, "stack");
  add(custom, world, "stack");
  assert.equal(world.modifiers.instances.length, 2);
  add(custom, world, "replace");
  add(custom, world, "replace", {}, otherSource);
  assert.equal(
    world.modifiers.instances.filter(
      (entry) => entry.definitionId === "replace",
    ).length,
    1,
  );
  rules.applyEffects(custom, world, otherSource, [
    { type: "remove_modifier", modifierId: "stack" },
  ]);
  assert.equal(
    world.modifiers.instances.filter((entry) => entry.definitionId === "stack")
      .length,
    0,
  );
});

test("一次性动态收益只求值一次，查询和复制恢复不会重放动作", () => {
  const { content: custom, world } = fixture([
    { id: "lasting", effects: { income: 0.1 } },
  ]);
  world.nations.qi.treasury = 100;
  rules.applyEffects(custom, world, context, [
    {
      type: "grain",
      amount: { op: "multiply", args: [{ metric: "nation.treasury" }, 0.5] },
    },
    { type: "unlock_idea", ideaId: custom.ideas[0].id },
    { type: "add_modifier", modifierId: "lasting", durationDays: 5 },
  ]);
  assert.equal(world.nations.qi.treasury, 150);
  const restored = JSON.parse(JSON.stringify(world));
  for (let i = 0; i < 4; i++)
    rules.resolveStat(custom, restored, context, "income", 100);
  assert.equal(restored.nations.qi.treasury, 150);
  assert.deepEqual(restored.research.nations.qi.unlockedIdeas, [
    custom.ideas[0].id,
  ]);
  assert.equal(restored.modifiers.instances.length, 1);
});

test("科技完成与事件选项共用添加动作，查询已知科技不重新生成过期效果", () => {
  const { content: custom } = fixture([
    { id: "reform", effects: { income: 0.1 } },
  ]);
  custom.technologies.find(
    (entry) => entry.id === "agriculture_1",
  ).completionEffects = [
    { type: "add_modifier", modifierId: "reform", durationDays: 1 },
  ];
  custom.events = [
    {
      id: "test_event",
      title: "改革",
      description: "改革测试",
      weight: 1,
      duration: 30,
      triggers: [],
      options: [
        {
          id: "continue",
          label: "继续",
          description: "确认",
          effects: [
            { type: "grain", amount: 7 },
            { type: "add_modifier", modifierId: "reform", durationDays: 5 },
          ],
        },
      ],
    },
  ];
  let world = rules.createWorld(custom);
  assert.ok(
    world.modifiers.instances.some(
      (entry) => entry.source.kind === "technology",
    ),
  );
  world.date = rules.dateFromGameDay(rules.gameDay(world.date) + 1);
  assert.ok(
    !rules
      .listActiveModifiers(custom, world, context)
      .some((entry) => entry.name === "reform"),
  );
  rules.pruneExpiredModifiers(world);
  rules.resolveStat(custom, world, context, "income", 100);
  assert.equal(world.modifiers.instances.length, 0);
  world.civic.events = [
    {
      id: "event-test",
      definitionId: "test_event",
      nationId: "qi",
      context: { nationId: "qi" },
      createdAt: rules.gameDay(world.date),
      expiresAt: rules.gameDay(world.date) + 30,
    },
  ];
  const treasury = world.nations.qi.treasury;
  world = rules.chooseEvent(custom, world, "event-test", "continue");
  assert.equal(world.nations.qi.treasury, treasury + 7);
  assert.deepEqual(world.civic.events, []);
  assert.equal(world.modifiers.instances.length, 1);
  assert.equal(world.modifiers.instances[0].source.kind, "event");
});

test("每日推进在跨日后清理到期实例", () => {
  const { content: custom, world } = fixture([
    { id: "one_day", effects: { income: 0.1 } },
  ]);
  add(custom, world, "one_day", { durationDays: 1 });
  const next = rules.advanceDays(custom, world, 1);
  assert.equal(next.modifiers.instances.length, 0);
  assert.equal(world.modifiers.instances.length, 1);
});

test("动态算式异常明确报告，不把除零、反向上下界或未知词条静默当零", () => {
  const { content: custom, world } = fixture([
    {
      id: "division",
      effects: {
        income: { op: "divide", args: [1, { metric: "nation.treasury" }] },
      },
    },
    {
      id: "bounds",
      effects: {
        income: { op: "clamp", args: [2, { metric: "nation.treasury" }, 10] },
      },
    },
  ]);
  add(custom, world, "division");
  world.nations.qi.treasury = 0;
  assert.throws(
    () => rules.resolveStat(custom, world, context, "income", 100),
    /除数/,
  );
  rules.applyEffects(custom, world, context, [
    { type: "remove_modifier", modifierId: "division" },
  ]);
  add(custom, world, "bounds");
  world.nations.qi.treasury = 11;
  assert.throws(
    () => rules.resolveStat(custom, world, context, "income", 100),
    /下限/,
  );
  assert.throws(
    () => rules.resolveStat(custom, world, context, "typo", 100),
    /未注册/,
  );
});

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const temp = await mkdtemp(join(tmpdir(), "spring-effects-integration-"));
after(() => rm(temp, { recursive: true, force: true }));
const { outputFiles } = await build({
  stdin: {
    contents: [
      "simulation/index",
      "simulation/effects",
      "simulation/modifier-query",
      "simulation/modifier-clock",
      "simulation/research",
      "simulation/civic",
      "simulation/time",
      "simulation/military-battles",
      "platform/saves",
    ]
      .map((name) => `export * from './src/${name}.ts';`)
      .join("\n"),
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const modulePath = join(temp, "rules.mjs");
await writeFile(modulePath, outputFiles[0].text);
const rules = await import(pathToFileURL(modulePath).href);
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
const source = { kind: "event", id: "integration", name: "试验诏令" };
const makeDefinition = (id, effects, scope = "nation", extra = {}) => ({
  id,
  name: id,
  description: "测试来源",
  scope,
  effects,
  stacking: "refresh",
  ...extra,
});
const add = (custom, world, modifierId, target) =>
  rules.applyEffects(custom, world, { nationId: "qi", source }, [
    { type: "add_modifier", modifierId, target, durationDays: 90 },
  ]);
const close = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test("城市和全国贡献各计算一次，来源说明复用实际产出，国家基础资源不受影响", () => {
  const custom = structuredClone(content);
  custom.modifierDefinitions.push(
    makeDefinition("national", { income: 0.1 }, "nation", {
      showInAdministration: false,
    }),
    makeDefinition("local", { income: 0.2 }, "settlement"),
  );
  const world = rules.createWorld(custom);
  const baseline = rules.calculateEconomy(custom, world, "qi");
  const city = Object.values(world.settlements).find(
    (item) => item.owner === "qi",
  );
  add(custom, world, "national");
  add(custom, world, "local", { kind: "settlement", id: city.id });
  const result = rules.calculateEconomy(custom, world, "qi");
  for (const before of baseline.lines) {
    const after = result.lines.find(
      (line) =>
        line.source === before.source && line.resourceId === before.resourceId,
    );
    if (before.source.startsWith("国家基础")) {
      close(after.amount, before.amount);
      continue;
    }
    if (before.resourceId !== "grain") continue;
    const prior = before.calculation.steps.find(
      (step) => step.stat?.key === "income",
    );
    const step = after.calculation.steps.find(
      (step) => step.stat?.key === "income",
    );
    const cityName = custom.scenario.settlements.find(
      (item) => item.id === city.id,
    ).name;
    const local = before.source.includes(cityName);
    close(step.factor, prior.factor + 0.1 + (local ? 0.2 : 0));
    assert.equal(
      step.stat.contributions.filter((item) => item.modifierName === "national")
        .length,
      1,
    );
    assert.equal(
      step.stat.contributions.filter((item) => item.modifierName === "local")
        .length,
      local ? 1 : 0,
    );
    close(after.amount, after.calculation.value);
  }
  const visible = rules.listActiveModifiers(
    custom,
    world,
    { nationId: "qi" },
    { administrationOnly: true, includeSettlements: true },
  );
  assert.deepEqual(
    visible.map((item) => item.name),
    ["local"],
  );
  assert.equal(
    rules
      .resolveStat(custom, world, { nationId: "qi" }, "income", 1)
      .contributions.some((item) => item.modifierName === "local"),
    false,
  );
});

test("科技完成动作只发放一次，读档保留同一期限，到期后已知科技不重建实例", () => {
  const custom = structuredClone(content);
  custom.modifierDefinitions.push(makeDefinition("reform", { income: -0.1 }));
  const target = custom.technologies.find(
    (item) => item.id === "agriculture_2",
  );
  target.cost = 1;
  target.completionEffects = [
    { type: "grain", amount: 75 },
    { type: "unlock_idea", ideaId: custom.ideas[0].id },
    { type: "add_modifier", modifierId: "reform", durationDays: 2 },
  ];
  let world = rules.createWorld(custom);
  const leader = Object.values(world.research.talents).find(
    (item) => item.nationId === "qi" && item.role === "research",
  );
  world = rules.startResearch(custom, world, "qi", target.id, leader.id);
  world.research.nations.qi.groups[0].fundedInvestment = 5;
  const treasury = world.nations.qi.treasury;
  rules.tickResearchMonth(custom, world);
  assert.equal(world.nations.qi.treasury, treasury + 75);
  assert.ok(
    world.research.nations.qi.unlockedIdeas.includes(custom.ideas[0].id),
  );
  assert.equal(world.modifiers.instances.length, 1);
  assert.equal(world.modifiers.instances[0].source.id, target.id);
  const expiresAt = world.modifiers.instances[0].expiresAt;
  const saved = rules.parseSave(
    JSON.stringify(rules.createSave(custom, world)),
  );
  assert.equal(saved.world.nations.qi.treasury, treasury + 75);
  assert.equal(saved.world.modifiers.instances[0].expiresAt, expiresAt);
  const after = rules.advanceDays(saved.content, saved.world, 2);
  assert.equal(after.modifiers.instances.length, 0);
  rules.tickResearchMonth(saved.content, after);
  rules.calculateEconomy(saved.content, after, "qi");
  assert.equal(after.modifiers.instances.length, 0);
  assert.equal(after.nations.qi.treasury, treasury + 75);
});

test("科研规模失效按实际已付投入处罚，当前滑条不能掩盖超额投入", () => {
  const custom = structuredClone(content);
  custom.modifierDefinitions.push(
    makeDefinition("scale", { research_scale: 10 }),
  );
  let world = rules.createWorld(custom);
  const leader = Object.values(world.research.talents).find(
    (item) => item.nationId === "qi" && item.role === "research",
  );
  world = rules.startResearch(custom, world, "qi", "agriculture_2", leader.id);
  const group = world.research.nations.qi.groups[0];
  const normalScale = rules.researchScale(custom, world, "qi");
  group.investment = normalScale * 2;
  group.fundedInvestment = normalScale * 2;
  add(custom, world, "scale");
  const before = rules.groupMonthlyProgress(custom, world, "qi", group);
  world.modifiers.instances = [];
  const after = rules.groupMonthlyProgress(custom, world, "qi", group);
  assert.ok(after < before);
  group.investment = 0;
  close(rules.groupMonthlyProgress(custom, world, "qi", group), after);
  group.fundedInvestment = normalScale;
  assert.ok(rules.groupMonthlyProgress(custom, world, "qi", group) > after);
});

test("过期以日界限判定，月底不重算上期收入或把计划维护冒充实际覆盖", () => {
  const custom = structuredClone(content);
  custom.events = [];
  custom.modifierDefinitions.push(
    makeDefinition("funded", {
      income: {
        op: "multiply",
        args: [0.2, { metric: "nation.operatingCoverage.buildings" }],
      },
    }),
  );
  const world = rules.createWorld(custom);
  world.date.day = 30;
  for (const city of Object.values(world.settlements)) city.governance = 1;
  world.nations.qi.operatingCoverage.buildings = 0.5;
  world.nations.qi.budget.buildings = 1;
  rules.applyEffects(custom, world, { nationId: "qi", source }, [
    { type: "add_modifier", modifierId: "funded", durationDays: 1 },
  ]);
  const expected = rules.calculateEconomy(custom, world, "qi").income;
  const before = rules
    .resolveStat(custom, world, { nationId: "qi" }, "income", 1)
    .contributions.find((item) => item.modifierName === "funded");
  close(before.value, 0.1);
  const next = rules.advanceDays(custom, world, 1);
  close(next.nations.qi.lastReport.income, expected);
  assert.equal(next.modifiers.instances.length, 0);
  assert.equal(next.date.day, 1);
});

test("存档拒绝无效目标、来源、期限、重复实例和会重用的实例序号", () => {
  const custom = structuredClone(content);
  custom.modifierDefinitions.push(makeDefinition("saved", { income: 0.1 }));
  const world = rules.createWorld(custom);
  add(custom, world, "saved");
  const save = rules.createSave(custom, world);
  for (const mutate of [
    (state) => (state.instances[0].target.id = "unknown"),
    (state) => (state.instances[0].target.kind = "settlement"),
    (state) => (state.instances[0].source.kind = "unknown"),
    (state) => (state.instances[0].expiresAt = state.instances[0].startedAt),
    (state) => (state.instances[0].startedAt = rules.gameDay(world.date) + 1),
    (state) => (state.instances[0].showInAdministration = "true"),
    (state) => state.instances.push(structuredClone(state.instances[0])),
    (state) => (state.nextId = 1),
  ]) {
    const invalid = structuredClone(save);
    mutate(invalid.world.modifiers);
    assert.throws(() => rules.parseSave(JSON.stringify(invalid)), /modifiers/);
  }
});

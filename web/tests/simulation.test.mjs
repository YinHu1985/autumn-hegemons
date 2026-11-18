import { atWar } from "./fixtures/war-world.mjs";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const temp = await mkdtemp(join(tmpdir(), "autumn-economy-test-"));
after(() => rm(temp, { recursive: true, force: true }));
const bundled = await build({
  stdin: {
    contents: `export * from './src/simulation/index.ts'; export * from './src/simulation/civic.ts'; export * from './src/simulation/events/index.ts'; export * from './src/simulation/modifier-clock.ts'; export * from './src/simulation/commands.ts'; export * from './src/simulation/research.ts'; export * from './src/simulation/time.ts'; export * from './src/simulation/military.ts';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const entry = join(temp, "rules.mjs");
await writeFile(entry, bundled.outputFiles[0].text);
const rules = await import(pathToFileURL(entry).href);
const raw = Object.fromEntries(
  await Promise.all(
    [
      "goods",
      "buildings",
      "scenario",
      "technologies",
      "ideas",
      "units",
      "events",
      "modifierDefinitions",
    ].map(async (name) => [
      name,
      JSON.parse(
        await readFile(
          `public/content/base/${name === "modifierDefinitions" ? "modifier-definitions" : name}.json`,
          "utf8",
        ),
      ),
    ]),
  ),
);
// Stable six-country fixture isolates rules from changes to the shipped historical starts.
raw.scenario = JSON.parse(
  await readFile("tests/fixtures/legacy-scenario.json", "utf8"),
);
const fixture = structuredClone(raw);
fixture.events = [];
fixture.scenario.nations = [
  {
    id: "qi",
    name: "齐",
    treasury: 100,
    baseResources: { grain: 16, wood: 2, leather_armor: 1 },
    budget: { buildings: 1 },
    manpower: 6000,
  },
];
fixture.scenario.settlements = [
  {
    id: "linzi",
    name: "临淄",
    owner: "qi",
    map: { x: 1168, y: 358 },
    terrain: "plain",
    specialty: "grain",
    scale: 2,
    governance: 1,
    buildings: { warehouse: 1, market: 1 },
  },
  {
    id: "jimo",
    name: "即墨",
    owner: "qi",
    map: { x: 1266, y: 382 },
    terrain: "forest",
    specialty: "wood",
    scale: 1,
    governance: 1,
    buildings: { lumberyard: 1 },
  },
];
fixture.scenario.roads = [{ from: "jimo", to: "linzi" }];
const content = rules.validateContent(fixture);
function isolatedWorld(data = content) {
  const world = atWar(rules.createWorld(data));
  world.research.talents = {};
  world.research.nations.qi.unlocked = [];
  world.military.armies = {};
  return world;
}

test("国家基础资源独立于城市维护且商品不累积库存", () => {
  const world = isolatedWorld();
  const baseline = rules.calculateEconomy(content, world, "qi");
  const next = rules.advanceDays(content, world, 30);
  assert.equal(
    next.nations.qi.treasury,
    100 + baseline.income - baseline.fullBuildingUpkeep,
  );
  assert.equal(
    rules.calculateEconomy(content, next, "qi").gross.leather_armor,
    1,
  );
  next.nations.qi.operatingCoverage.buildings = 0;
  assert.equal(
    rules.calculateEconomy(content, next, "qi").gross.leather_armor,
    1,
  );
});
test("维护滑条月底实付只影响下月产出", () => {
  const world = isolatedWorld();
  const income = rules.calculateEconomy(content, world, "qi").income;
  const next = rules.advanceDays(
    content,
    rules.setBuildingBudget(world, "qi", 0.5),
    30,
  );
  assert.equal(next.nations.qi.lastReport.income, income);
  assert.equal(next.nations.qi.lastReport.coverage, 0.5);
  assert.ok(rules.calculateEconomy(content, next, "qi").income < income);
  assert.equal(world.nations.qi.budget.buildings, 1);
});
test("财政不足对三类计划开支同比缩减，余额不为负", () => {
  const world = atWar(rules.createWorld(content));
  world.nations.qi.treasury = 10;
  for (const city of Object.values(world.settlements)) city.governance = 0;
  const poor = structuredClone(content);
  poor.scenario.nations[0].baseResources.grain = 0;
  const leader = Object.values(world.research.talents).find(
    (t) => t.role === "research",
  );
  const active = rules.startResearch(poor, world, "qi", "copper_1", leader.id);
  active.nations.qi.budget = { buildings: 0.8, army: 1, research: 0.7 };
  rules.settleMonth(poor, active);
  const report = active.nations.qi.lastReport;
  assert.equal(active.nations.qi.treasury, 0);
  assert.ok(Math.abs(report.paid - 10) < 1e-8);
  const shares = Object.values(report.categories).map(
    (row) => row.paid / row.requested,
  );
  assert.ok(shares.every((share) => Math.abs(share - shares[0]) < 1e-9));
  assert.ok(report.categories.buildings.coverage < 0.8);
});
test("加工共享原料按比例分配且不依赖城镇顺序", () => {
  const world = isolatedWorld();
  world.settlements.linzi.buildings.bowyer = { level: 1, effectiveLevel: 1 };
  world.settlements.jimo.buildings.bowyer = { level: 1, effectiveLevel: 1 };
  const scarce = structuredClone(content);
  scarce.scenario.nations[0].baseResources.wood = 0;
  scarce.buildings.find((b) => b.id === "lumberyard").levels[0].outputs.wood =
    4;
  const a = rules.calculateEconomy(scarce, world, "qi");
  const reversed = {
    ...world,
    settlements: Object.fromEntries(
      Object.entries(world.settlements).reverse(),
    ),
  };
  const b = rules.calculateEconomy(scarce, reversed, "qi");
  assert.ok(a.available.bows > 0 && a.available.bows < 8);
  assert.equal(a.available.bows, b.available.bows);
  assert.equal(a.used.wood, b.used.wood);
});
test("建设遵守科研条件、每城施工队列及下月产出生效", () => {
  const initial = isolatedWorld();
  assert.throws(
    () => rules.startConstruction(content, initial, "linzi", "bowyer"),
    /尚未掌握/,
  );
  initial.research.nations.qi.unlocked.push("bows_1");
  const started = rules.startConstruction(content, initial, "linzi", "bowyer");
  assert.throws(
    () => rules.startConstruction(content, started, "linzi", "market"),
    /已有工程/,
  );
  const quote = rules.constructionQuote(content, initial, "linzi", "bowyer");
  assert.equal(
    started.nations.qi.treasury,
    initial.nations.qi.treasury - quote.cost,
  );
  const built = rules.advanceDays(content, started, quote.days);
  assert.equal(built.settlements.linzi.buildings.bowyer.level, 1);
  assert.equal(built.settlements.linzi.buildings.bowyer.effectiveLevel, 0);
  const active = rules.advanceDays(content, built, 60 - quote.days);
  assert.equal(active.settlements.linzi.buildings.bowyer.effectiveLevel, 1);
});
test("缺少玉器时学府不提供科研加成", () => {
  const world = isolatedWorld();
  world.settlements.linzi.buildings.academy = { level: 1, effectiveLevel: 1 };
  const none = rules.calculateEconomy(content, world, "qi");
  assert.equal(none.modifiers.research_scale ?? 0, 0);
  const supplied = structuredClone(content);
  supplied.scenario.nations[0].baseResources.jade = 2;
  assert.ok(
    rules.calculateEconomy(supplied, world, "qi").modifiers.research_scale > 0,
  );
});
test("事件逾期选择第一项，治理损失按容量同比扣全国人力一次", () => {
  const data = rules.validateContent({ ...fixture, events: raw.events });
  const world = isolatedWorld(data);
  const before = world.nations.qi.treasury;
  world.civic.events = [
    {
      id: "test-event",
      definitionId: "good_harvest",
      nationId: "qi",
      context: { nationId: "qi" },
      createdAt: rules.gameDay(world.date) - 1,
      expiresAt: rules.gameDay(world.date),
    },
  ];
  rules.tickEventsDay(data, world);
  assert.equal(world.nations.qi.treasury, before + 45);
  assert.equal(world.civic.events.length, 0);
  world.civic.events = [
    {
      id: "fire",
      definitionId: "granary_fire",
      nationId: "qi",
      context: { nationId: "qi" },
      createdAt: rules.gameDay(world.date),
      expiresAt: rules.gameDay(world.date) + 30,
    },
  ];
  const oldManpower = world.nations.qi.manpower,
    oldCapacity = rules.manpowerCapacity(data, world, "qi");
  const after = rules.chooseEvent(data, world, "fire", "local_funding");
  assert.equal(
    after.nations.qi.manpower,
    Math.floor(
      (oldManpower * rules.manpowerCapacity(data, after, "qi")) / oldCapacity,
    ),
  );
  assert.ok(after.nations.qi.manpower < world.nations.qi.manpower);
  assert.equal(world.nations.qi.manpower, oldManpower);
});
test("事件启发计入当前课题并受定义上限约束", () => {
  const data = rules.validateContent({ ...fixture, events: raw.events });
  let world = atWar(rules.createWorld(data));
  const leader = Object.values(world.research.talents).find(
    (t) => t.role === "research",
  );
  world = rules.startResearch(data, world, "qi", "copper_1", leader.id);
  world.civic.events = [
    {
      id: "scholar",
      definitionId: "travelling_scholar",
      nationId: "qi",
      context: { nationId: "qi" },
      createdAt: rules.gameDay(world.date),
      expiresAt: rules.gameDay(world.date) + 30,
    },
  ];
  const after = rules.chooseEvent(data, world, "scholar", "teach");
  const tech = data.technologies.find((t) => t.id === "copper_1");
  assert.ok(after.research.nations.qi.bonuses.copper_1 > 0);
  assert.ok(
    after.research.nations.qi.bonuses.copper_1 <=
      tech.cost * tech.inspirationCap,
  );
});

test("地形建设成本与工期由内容定义独立控制", () => {
  const world = isolatedWorld();
  const baseline = rules.constructionQuote(content, world, "linzi", "market");
  const modded = structuredClone(content);
  const plain = modded.terrains.find((terrain) => terrain.id === "plain");
  plain.constructionCost = 2;
  plain.constructionTime = 3;
  const quote = rules.constructionQuote(modded, world, "linzi", "market");
  assert.equal(quote.cost, baseline.cost * 2);
  assert.equal(quote.days, baseline.days * 3);
  assert.equal(
    modded.specialties.find((specialty) => specialty.id === "fish").resourceId,
    "grain",
  );
});

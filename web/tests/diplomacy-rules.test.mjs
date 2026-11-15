import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundle = await build({
  stdin: {
    contents: `
      export * from './src/definitions/validate.ts';
      export * from './src/definitions/diplomacy.ts';
      export * from './src/simulation/diplomacy.ts';
      export * from './src/simulation/state.ts';
      export * from './src/simulation/time.ts';
      export * from './src/simulation/talents.ts';
      export * from './src/simulation/geography.ts';
      export * from './src/simulation/military-commands.ts';
    `,
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
      .filter(([, file]) => typeof file === "string" && file.endsWith(".json"))
      .map(async ([name, file]) => [
        name,
        JSON.parse(await readFile(`public/content/base/${file}`, "utf8")),
      ]),
  ),
);
const content = rules.validateContent(raw);
function withEnvoy(nationId = "qi") {
  let world = rules.createWorld(content);
  const talent = Object.values(world.research.talents).find(
    (t) => t.nationId === nationId && t.recruitedMonth !== null && !t.busy,
  );
  world = rules.assignTalent(world, nationId, talent.id, "envoy");
  return { world, envoyId: talent.id };
}
const tick = (world, days) => {
  for (let i = 0; i < days; i++) rules.tickDiplomacyDay(content, world);
};
const relation = (world, a = "qi", b = "lu") =>
  rules.relationValue(content, world, a, b);

test("新剧本所有国家对初始中心值，关系对称且档位边界清晰", () => {
  const world = rules.createWorld(content);
  const n = content.scenario.nations.length;
  assert.equal(world.diplomacy.relations.length, (n * (n - 1)) / 2);
  assert.ok(world.diplomacy.relations.every((pair) => pair.value === 20));
  assert.equal(relation(world, "lu", "qi"), relation(world));
  assert.equal(rules.diplomaticRelation(content, world, "qi", "qi"), "self");
  for (const [value, tier] of [
    [-200, "hostile"],
    [-101, "hostile"],
    [-100, "discord"],
    [-1, "discord"],
    [0, "friendly"],
    [99, "friendly"],
    [100, "close"],
    [200, "close"],
  ])
    assert.equal(rules.relationTier(value), tier);
  assert.equal(rules.canAttackCity(content, world, "qi", "qufu"), false);
});

test("年度关系漂移只在跨年结算，向中心收敛且不越过", () => {
  let world = rules.createWorld(content);
  rules.changeRelation(content, world, "qi", "lu", -21);
  rules.changeRelation(content, world, "qi", "chu", 1);
  world.date = { year: -2, month: 12, day: 29 };
  world = rules.advanceDays(content, world, 1);
  assert.equal(relation(world), -1);
  world = rules.advanceDays(content, world, 1);
  assert.equal(relation(world), 0);
  assert.equal(relation(world, "qi", "chu"), 20);
  assert.equal(world.date.year, -1);
  const fast = {
    ...content,
    diplomacy: { ...content.diplomacy, yearlyDrift: 50 },
  };
  rules.tickDiplomacyYear(fast, world);
  assert.equal(relation(world), 20);
  rules.tickDiplomacyYear(fast, world);
  assert.equal(relation(world), 20);
});

test("赠礼开始扣费占用使者，完成之前无关系变化，完成后双方关系增加并释放", () => {
  const { world, envoyId } = withEnvoy();
  const before = JSON.stringify(world);
  const sent = rules.startDiplomaticMission(
    content,
    world,
    "qi",
    "lu",
    "gift",
    envoyId,
  );
  assert.equal(JSON.stringify(world), before);
  assert.equal(sent.nations.qi.treasury, world.nations.qi.treasury - 30);
  assert.equal(sent.research.talents[envoyId].busy, true);
  tick(sent, 29);
  assert.equal(relation(sent), 20);
  assert.equal(sent.diplomacy.missions[0].remainingDays, 1);
  tick(sent, 1);
  assert.equal(relation(sent), 70);
  assert.equal(relation(sent, "lu", "qi"), 70);
  assert.equal(sent.diplomacy.missions.length, 0);
  assert.equal(sent.research.talents[envoyId].busy, false);
  assert.equal(sent.research.talents[envoyId].role, "envoy");
  assert.ok(sent.civic.log.some((entry) => entry.nationId === "lu"));
});

test("谴责三次后跨入险恶才可从道路邻城出兵", () => {
  let { world, envoyId } = withEnvoy();
  const army = Object.values(world.military.armies).find(
    (a) => a.nationId === "qi",
  );
  assert.throws(
    () => rules.startAttack(content, world, "qi", [army.id], "qufu"),
    /险恶/,
  );
  for (let i = 0; i < 3; i++) {
    world = rules.startDiplomaticMission(
      content,
      world,
      "qi",
      "lu",
      "denounce",
      envoyId,
    );
    tick(world, 30);
    assert.equal(rules.canAttackCity(content, world, "qi", "qufu"), i === 2);
  }
  assert.equal(relation(world), -130);
  const attacked = rules.startAttack(content, world, "qi", [army.id], "qufu");
  assert.ok(
    Object.values(attacked.military.battles).some((b) => b.cityId === "qufu"),
  );
});

test("使者不可重复占用且同方向同国任务串行，非法命令不修改世界", () => {
  const { world, envoyId } = withEnvoy();
  const sent = rules.startDiplomaticMission(
    content,
    world,
    "qi",
    "lu",
    "gift",
    envoyId,
  );
  const other = Object.values(sent.research.talents).find(
    (t) =>
      t.nationId === "qi" &&
      t.recruitedMonth !== null &&
      t.id !== envoyId &&
      !t.busy,
  );
  const prepared = rules.assignTalent(sent, "qi", other.id, "envoy");
  const before = JSON.stringify(prepared);
  assert.throws(
    () =>
      rules.startDiplomaticMission(
        content,
        prepared,
        "qi",
        "chu",
        "gift",
        envoyId,
      ),
    /正在执行/,
  );
  assert.throws(
    () =>
      rules.startDiplomaticMission(
        content,
        prepared,
        "qi",
        "lu",
        "gift",
        other.id,
      ),
    /已有外交任务/,
  );
  assert.throws(
    () => rules.assignTalent(prepared, "qi", envoyId, "advisor"),
    /正在执行/,
  );
  assert.equal(JSON.stringify(prepared), before);
  const parallel = rules.startDiplomaticMission(
    content,
    prepared,
    "qi",
    "chu",
    "gift",
    other.id,
  );
  assert.equal(parallel.diplomacy.missions.length, 2);
});

test("撤回无关系收益且不退赠礼，退场或目标灭亡中止任务释放使者", () => {
  const { world, envoyId } = withEnvoy();
  const sent = rules.startDiplomaticMission(
    content,
    world,
    "qi",
    "lu",
    "gift",
    envoyId,
  );
  tick(sent, 5);
  const cancelled = rules.cancelDiplomaticMission(
    sent,
    "qi",
    sent.diplomacy.missions[0].id,
  );
  assert.equal(cancelled.nations.qi.treasury, world.nations.qi.treasury - 30);
  assert.equal(relation(cancelled), 20);
  assert.equal(cancelled.research.talents[envoyId].busy, false);
  rules.cancelDiplomacyTasksForTalent(sent, envoyId);
  assert.equal(sent.diplomacy.missions.length, 0);
  const extinct = rules.startDiplomaticMission(
    content,
    cancelled,
    "qi",
    "lu",
    "denounce",
    envoyId,
  );
  for (const city of Object.values(extinct.settlements))
    if (city.owner === "lu") city.owner = "qi";
  tick(extinct, 1);
  assert.equal(extinct.diplomacy.missions.length, 0);
  assert.equal(extinct.research.talents[envoyId].busy, false);
  assert.equal(relation(extinct), 20);
});

test("关系在上下限截断，修改JSON会调整任务时间成本与效果", () => {
  let { world, envoyId } = withEnvoy();
  const custom = {
    ...content,
    diplomacy: {
      ...content.diplomacy,
      actions: [
        { id: "gift", name: "厚礼", days: 2, relationChange: 300, cost: 7 },
      ],
    },
  };
  world = rules.startDiplomaticMission(
    custom,
    world,
    "qi",
    "lu",
    "gift",
    envoyId,
  );
  assert.equal(world.diplomacy.missions[0].totalDays, 2);
  rules.tickDiplomacyDay(custom, world);
  assert.equal(relation(world), 20);
  rules.tickDiplomacyDay(custom, world);
  assert.equal(relation(world), 200);
  assert.equal(world.nations.qi.treasury, 293);
  rules.changeRelation(content, world, "qi", "lu", -999);
  assert.equal(relation(world), -200);
});

test("外交规则拒绝不合法中心、任务时间与重复任务ID", () => {
  for (const mutate of [
    (d) => (d.center = 300),
    (d) => (d.yearlyDrift = -1),
    (d) => (d.actions[0].days = 0),
    (d) => (d.actions[0].cost = -2),
    (d) => d.actions.push({ ...d.actions[0] }),
    (d) => (d.actions[0].relationChange = NaN),
  ]) {
    const definition = structuredClone(content.diplomacy);
    mutate(definition);
    assert.throws(() => rules.validateDiplomacyRules(definition), /diplomacy/);
  }
});

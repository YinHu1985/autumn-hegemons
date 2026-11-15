import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { atWar } from "./fixtures/war-world.mjs";

const bundle = await build({
  stdin: {
    contents: `
      export * from './src/definitions/validate.ts';
      export * from './src/simulation/state.ts';
      export * from './src/simulation/civic.ts';
      export * from './src/simulation/military.ts';
      export * from './src/simulation/military-battles.ts';
      export * from './src/simulation/military-tactics.ts';
      export * from './src/simulation/military-lifecycle.ts';
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
raw.scenario = JSON.parse(
  await readFile("tests/fixtures/legacy-scenario.json", "utf8"),
);
raw.events = [];
const content = rules.validateContent(raw);
const armyOf = (world, id) =>
  Object.values(world.military.armies).find((a) => a.nationId === id);
function start() {
  const world = atWar(rules.createWorld(content));
  world.playerNationId = "lu";
  return world;
}
function attack(world) {
  return rules.startAttack(
    content,
    world,
    "qi",
    [armyOf(world, "qi").id],
    "qufu",
  );
}
function tick(world, days) {
  for (let i = 0; i < days; i++) rules.tickMilitaryDay(content, world);
}
function ready() {
  const world = attack(start());
  tick(world, content.warfare.preparationDays);
  const battle = Object.values(world.military.battles)[0];
  assert.equal(battle.phase, "ready");
  return { world, battle };
}

test("开局只有全国人力，初始部队从裁至容量后的同一池扣一次", () => {
  const world = start();
  for (const nation of content.scenario.nations) {
    const reserve = world.nations[nation.id];
    const serving = Object.values(world.military.armies)
      .filter((a) => a.nationId === nation.id)
      .reduce((sum, a) => sum + rules.armySize(a), 0);
    assert.equal(
      reserve.manpower + serving,
      Math.min(
        nation.manpower,
        rules.manpowerCapacity(content, world, nation.id),
      ),
    );
    assert.equal(Object.hasOwn(reserve, "defenseManpower"), false);
  }
});

test("征募与地方守备争用同一池：先征募会减少可动员守备，就绪后不能再次征募用掉已动员人数", () => {
  let world = start();
  world.nations.lu.manpower = 1500;
  world.nations.lu.treasury = 1000;
  const army = armyOf(world, "lu");
  world = rules.recruitRegiment(content, world, "lu", army.id, "levy");
  assert.equal(world.nations.lu.manpower, 500);
  world = attack(world);
  let battle = Object.values(world.military.battles)[0];
  assert.equal(rules.availableGarrison(content, world, battle), 500);
  tick(world, content.warfare.preparationDays);
  battle = world.military.battles[battle.id];
  assert.equal(battle.garrison, 500);
  assert.equal(world.nations.lu.manpower, 0);
  world = rules.createArmy(content, world, "lu", "mengshan");
  const reserveArmy = Object.values(world.military.armies).find(
    (a) => a.nationId === "lu" && a.units.length === 0,
  );
  assert.throws(
    () => rules.recruitRegiment(content, world, "lu", reserveArmy.id, "levy"),
    /人力不足/,
  );
  assert.equal(world.military.battles[battle.id].garrison, 500);
});

test("在役不占储备上限，月恢复仅一份1.5%，复员超容量直接裁剪", () => {
  let world = start();
  const army = armyOf(world, "lu");
  const capacity = rules.manpowerCapacity(content, world, "lu");
  world.nations.lu.treasury = 1000;
  world = rules.recruitRegiment(content, world, "lu", army.id, "levy");
  assert.equal(rules.manpowerCapacity(content, world, "lu"), capacity);
  assert.ok(rules.armySize(world.military.armies[army.id]) > 1000);
  world.nations.lu.manpower = 100;
  rules.tickCivicMonth(content, world);
  assert.equal(world.nations.lu.manpower, 100 + Math.floor(capacity * 0.015));
  world.nations.lu.manpower = capacity - 1;
  rules.tickCivicMonth(content, world);
  assert.equal(world.nations.lu.manpower, capacity);
  tick(world, 15);
  const unitId = world.military.armies[army.id].units.at(-1).id;
  world = rules.demobilizeRegiment(content, world, "lu", army.id, unitId);
  assert.equal(world.nations.lu.manpower, capacity);
});

test("自动决战只返守备幸存者一次，防守军团留在役不重复返池", () => {
  const { world, battle } = ready();
  const attacker = armyOf(world, "qi");
  for (const unit of attacker.units) {
    unit.cadre = 1;
    unit.levy = 1;
    unit.morale = 5;
  }
  const pool = world.nations.lu.manpower;
  const garrison = battle.garrison;
  const defender = armyOf(world, "lu");
  const serving = rules.armySize(defender);
  rules.autoResolveBattle(content, world, battle);
  assert.equal(world.settlements.qufu.owner, "lu");
  assert.equal(world.nations.lu.manpower, pool + Math.round(garrison * 0.88));
  assert.ok(rules.armySize(defender) < serving);
  assert.equal(defender.status, "idle");
  assert.equal(battle.garrison, 0);
  const after = world.nations.lu.manpower;
  rules.finishBattle(content, world, battle, "defender");
  rules.returnGarrison(content, world, battle);
  assert.throws(() => rules.autoResolveBattle(content, world, battle), /决战/);
  assert.equal(world.nations.lu.manpower, after);
});

test("手动决战按守备兵牌剩余人数返还，军团损失不影响返池数且不可二次提交", () => {
  const { world, battle } = ready();
  rules.beginTactical(content, world, battle);
  const pool = world.nations.lu.manpower;
  const locals = battle.tactical.units.filter(
    (u) => u.armyId === null && u.side === "defender",
  );
  assert.ok(locals.length > 0);
  for (const unit of locals) unit.levy = Math.floor(unit.levy * 0.4);
  const returning = locals.reduce((sum, u) => sum + u.levy + u.cadre, 0);
  const regular = battle.tactical.units.find(
    (u) => u.armyId !== null && u.side === "defender",
  );
  regular.levy = Math.max(0, regular.levy - 100);
  battle.tactical.winner = "defender";
  rules.commitTactical(content, world, battle);
  assert.equal(world.nations.lu.manpower, pool + returning);
  assert.equal(
    armyOf(world, "lu").units.find((u) => u.id === regular.id).levy,
    regular.levy,
  );
  assert.equal(battle.garrison, 0);
  assert.throws(() => rules.commitTactical(content, world, battle), /已经结算/);
  rules.returnGarrison(content, world, battle);
  assert.equal(world.nations.lu.manpower, pool + returning);
});

test("进攻获胜先返守备幸存者再按失城比例缩池，剩余军团不被同比扣减", () => {
  const { world, battle } = ready();
  const pool = world.nations.lu.manpower;
  const garrison = battle.garrison;
  const oldCap = rules.manpowerCapacity(content, world, "lu");
  const defender = armyOf(world, "lu");
  const before = rules.armySize(defender);
  // Internal completion with deterministic no army casualties isolates occupation ordering.
  rules.finishBattle(content, world, battle, "attacker", false);
  const newCap = rules.manpowerCapacity(content, world, "lu");
  assert.ok(newCap > 0 && newCap < oldCap);
  assert.equal(
    world.nations.lu.manpower,
    (Math.min(oldCap, pool + garrison) * newCap) / oldCap,
  );
  assert.equal(rules.armySize(defender), before);
  assert.equal(battle.garrison, 0);
  const after = world.nations.lu.manpower;
  rules.finishBattle(content, world, battle, "attacker", false);
  assert.equal(world.nations.lu.manpower, after);
});

test("战役取消返还已征守备，重复取消与返还均不增加人力", () => {
  const { world, battle } = ready();
  const pool = world.nations.lu.manpower;
  const garrison = battle.garrison;
  rules.cancelCampaign(content, world, battle, "测试撤回目标");
  assert.equal(world.nations.lu.manpower, pool + garrison);
  assert.equal(battle.garrison, 0);
  rules.cancelCampaign(content, world, battle, "重复撤回");
  rules.returnGarrison(content, world, battle);
  assert.equal(world.nations.lu.manpower, pool + garrison);
});

import { atWar } from "./fixtures/war-world.mjs";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundle = await build({
  stdin: {
    contents:
      "export * from './src/simulation/military.ts'; export * from './src/simulation/military-battles.ts'; export * from './src/simulation/military-tactics.ts'; export * from './src/simulation/state.ts'; export * from './src/simulation/civic.ts'; export * from './src/definitions/validate.ts'; export * from './src/simulation/time.ts';",
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
      .filter(([, path]) => typeof path === "string" && path.endsWith(".json"))
      .map(async ([name, path]) => [
        name,
        JSON.parse(await readFile(`public/content/base/${path}`, "utf8")),
      ]),
  ),
);
// Stable six-country fixture isolates rules from changes to the shipped historical starts.
raw.scenario = JSON.parse(
  await readFile("tests/fixtures/legacy-scenario.json", "utf8"),
);
const content = rules.validateContent(raw);
const daysToBattle = content.warfare.preparationDays;
const queueCap = Math.floor(daysToBattle * content.warfare.queuedProgressCap);

function start(player = "lu") {
  const world = atWar(rules.createWorld(content));
  world.playerNationId = player;
  return world;
}
function armyOf(world, nationId) {
  return Object.values(world.military.armies).find(
    (army) => army.nationId === nationId,
  );
}
function latestBattle(world) {
  return Object.values(world.military.battles).sort(
    (a, b) => b.order - a.order,
  )[0];
}
function attack(world, nationId, cityId, armyIds) {
  return rules.startAttack(
    content,
    world,
    nationId,
    armyIds ?? [armyOf(world, nationId).id],
    cityId,
  );
}
function tick(world, count) {
  for (let i = 0; i < count; i++) rules.tickMilitaryDay(content, world);
  return world;
}
function plan(world, battle, nationId, armyIds) {
  return rules.assignBattleDefenders(
    content,
    world,
    battle.id,
    nationId,
    armyIds ?? [armyOf(world, nationId).id],
  );
}
function readyBattle(player = "lu") {
  let world = attack(start(player), "qi", "qufu");
  const battleId = latestBattle(world).id;
  world = plan(world, world.military.battles[battleId], "lu");
  tick(world, daysToBattle);
  assert.equal(world.military.battles[battleId].phase, "ready");
  return { world, battleId };
}
function addArmy(world, nationId) {
  const original = armyOf(world, nationId);
  const copy = structuredClone(original);
  copy.id = `army-${world.military.nextId++}`;
  copy.name = `${nationId}预备军`;
  copy.generalId = null;
  for (const unit of copy.units) unit.id = `unit-${world.military.nextId++}`;
  world.military.armies[copy.id] = copy;
  // Fixture recruitment also removes people from the national reserve.
  world.nations[nationId].manpower -= rules.armySize(copy);
  return copy.id;
}

test("征募与复员守恒：存活人力回池，战死不返还", () => {
  let world = start("qi");
  const army = armyOf(world, "qi");
  world.nations.qi.treasury = 1000;
  const before = world.nations.qi.manpower;
  world = rules.recruitRegiment(content, world, "qi", army.id, "levy");
  assert.equal(world.nations.qi.manpower, before - 1000);
  const unit = world.military.armies[army.id].units.at(-1);
  rules.applyCasualties(unit, 200);
  world.military.armies[army.id].status = "idle";
  world = rules.demobilizeRegiment(content, world, "qi", army.id, unit.id);
  assert.equal(world.nations.qi.manpower, before - 200);
});

test("理念解锁的兵种只在实行期间可用，仅解锁理念不会直接启用", () => {
  const definitions = structuredClone(content);
  const idea = definitions.ideas[0];
  const type = definitions.units.find((entry) => entry.id === "infantry");
  type.requires = idea.id;
  const world = rules.createWorld(definitions);
  const state = world.research.nations.qi;
  state.unlockedIdeas.push(idea.id);
  assert.equal(rules.unitUnlocked(definitions, world, "qi", type.id), false);
  state.enacted.push(idea.id);
  assert.equal(rules.unitUnlocked(definitions, world, "qi", type.id), true);
  state.enacted = [];
  assert.equal(rules.unitUnlocked(definitions, world, "qi", type.id), false);
});

test("常备受征召保护，骑兵伤亡直接减少常备", () => {
  const unit = {
    id: "u",
    typeId: "infantry",
    cadre: 100,
    levy: 900,
    morale: 100,
    training: 50,
  };
  rules.applyCasualties(unit, 100);
  assert.ok(unit.levy < 820);
  assert.ok(unit.cadre >= 90);
  assert.equal(unit.cadre + unit.levy, 900);
  const cavalry = { ...unit, cadre: 500, levy: 0 };
  rules.applyCasualties(cavalry, 100);
  assert.equal(cavalry.cadre, 400);
});

test("发起进攻即占用部队并开始完整准备期，不能重复占用", () => {
  let world = start();
  const attackerId = armyOf(world, "qi").id;
  world = attack(world, "qi", "qufu");
  const battle = latestBattle(world);
  assert.equal(battle.kind, "field");
  assert.equal(battle.phase, "preparation");
  assert.equal(battle.elapsed, 0);
  assert.equal(battle.preparationDays, daysToBattle);
  assert.equal(world.military.armies[attackerId].expedition, true);
  assert.notEqual(world.military.armies[attackerId].status, "idle");
  assert.throws(() => attack(world, "qi", "mengshan", [attackerId]));
  tick(world, daysToBattle - 1);
  assert.equal(world.military.battles[battle.id].phase, "preparation");
  tick(world, 1);
  assert.equal(world.military.battles[battle.id].phase, "ready");
});

test("同一防守国按发起顺序排队，后续只到半程且退出不重置进度", () => {
  let world = attack(start(), "qi", "qufu");
  const firstId = latestBattle(world).id;
  world = attack(world, "chu", "mengshan");
  const secondId = latestBattle(world).id;
  world = attack(world, "jin", "teng");
  const thirdId = latestBattle(world).id;
  tick(world, queueCap + 10);
  assert.equal(world.military.battles[firstId].elapsed, queueCap + 10);
  assert.equal(world.military.battles[secondId].elapsed, queueCap);
  assert.equal(world.military.battles[thirdId].elapsed, queueCap);
  assert.deepEqual(
    rules.defenseQueue(world, "lu").map((battle) => battle.id),
    [firstId, secondId, thirdId],
  );
  world = rules.withdrawBattle(content, world, firstId, "qi");
  assert.equal(
    rules.battleQueuePosition(world, world.military.battles[secondId]),
    1,
  );
  tick(world, 1);
  assert.equal(world.military.battles[secondId].elapsed, queueCap + 1);
  assert.equal(world.military.battles[thirdId].elapsed, queueCap);
});

test("一个国家可以进攻同时防守，不同防守国的准备并行", () => {
  let world = attack(start("qi"), "qi", "qufu");
  const outboundId = latestBattle(world).id;
  world = attack(world, "jin", "linzi");
  const inboundId = latestBattle(world).id;
  tick(world, 20);
  assert.equal(world.military.battles[outboundId].elapsed, 20);
  assert.equal(world.military.battles[inboundId].elapsed, 20);
  assert.equal(rules.defenseQueue(world, "qi").length, 1);
  assert.equal(rules.defenseQueue(world, "lu").length, 1);
});

test("同国可编组多军团进攻，后发军团建立另一场战役而非援军", () => {
  let world = start("qi");
  const firstArmy = armyOf(world, "qi").id;
  const secondArmy = addArmy(world, "qi");
  const thirdArmy = addArmy(world, "qi");
  world = attack(world, "qi", "qufu", [firstArmy, secondArmy]);
  const firstId = latestBattle(world).id;
  world = attack(world, "qi", "qufu", [thirdArmy]);
  const secondId = latestBattle(world).id;
  assert.deepEqual(world.military.battles[firstId].attackerArmies, [
    firstArmy,
    secondArmy,
  ]);
  assert.deepEqual(world.military.battles[secondId].attackerArmies, [
    thirdArmy,
  ]);
  assert.equal(rules.defenseQueue(world, "lu").length, 2);
});

test("防守编组是准备计划，满进度才锁定，决战后不能添加援军", () => {
  let world = attack(start(), "qi", "qufu");
  const battleId = latestBattle(world).id;
  const defenderId = armyOf(world, "lu").id;
  world = plan(world, world.military.battles[battleId], "lu", [defenderId]);
  assert.equal(world.military.armies[defenderId].status, "idle");
  tick(world, daysToBattle);
  assert.equal(world.military.armies[defenderId].status, "battle");
  assert.throws(() => plan(world, world.military.battles[battleId], "lu", []));
});

test("复员后裁撤空军团会清除未来防守计划中的引用", () => {
  let world = attack(start(), "qi", "qufu");
  const battleId = latestBattle(world).id;
  const defender = armyOf(world, "lu");
  world = plan(world, world.military.battles[battleId], "lu", [defender.id]);
  for (const unit of defender.units)
    world = rules.demobilizeRegiment(
      content,
      world,
      "lu",
      defender.id,
      unit.id,
    );
  world = rules.dismissArmy(world, "lu", defender.id);
  assert.equal(world.military.armies[defender.id], undefined);
  assert.ok(
    !world.military.battles[battleId].defenderArmies.includes(defender.id),
  );
});

test("未来防守计划不复制正在远征的部队", () => {
  let world = attack(start(), "qi", "qufu");
  const incomingId = latestBattle(world).id;
  const defenderId = armyOf(world, "lu").id;
  world = plan(world, world.military.battles[incomingId], "lu", [defenderId]);
  world = attack(world, "lu", "ying", [defenderId]);
  tick(world, daysToBattle);
  assert.ok(
    !rules
      .battleArmies(world, world.military.battles[incomingId], "defender")
      .some((army) => army.id === defenderId),
  );
  assert.equal(world.military.armies[defenderId].expedition, true);
});

test("地方守备到决战才动员，准备排队和重复查询不重复扣人力", () => {
  let world = attack(start(), "qi", "qufu");
  const firstId = latestBattle(world).id;
  world = attack(world, "chu", "mengshan");
  const secondId = latestBattle(world).id;
  const before = world.nations.lu.manpower;
  tick(world, daysToBattle - 1);
  assert.equal(world.nations.lu.manpower, before);
  tick(world, 1);
  const garrison = world.military.battles[firstId].garrison;
  assert.ok(garrison > 0);
  assert.equal(world.nations.lu.manpower, before - garrison);
  assert.equal(world.military.battles[secondId].garrison, 0);
  rules.battleStrength(
    content,
    world,
    world.military.battles[firstId],
    "defender",
  );
  world = rules.startManualBattle(content, world, firstId, "lu");
  assert.equal(world.nations.lu.manpower, before - garrison);
  const localUnits = world.military.battles[firstId].tactical.units.filter(
    (unit) => unit.side === "defender" && unit.armyId === null,
  );
  assert.equal(
    localUnits.reduce((sum, unit) => sum + unit.cadre + unit.levy, 0),
    garrison,
  );
});

test("准备中撤军不制造伤亡，仍返程并支付远征维护", () => {
  let world = start("qi");
  const attacker = armyOf(world, "qi");
  const initialUnits = structuredClone(attacker.units);
  const base = rules.militaryUpkeepBreakdown(content, world, "qi");
  world = attack(world, "qi", "qufu");
  const battleId = latestBattle(world).id;
  const away = rules.militaryUpkeepBreakdown(content, world, "qi");
  assert.equal(away.base, base.base);
  assert.ok(away.expedition > 0);
  assert.equal(away.total, away.base + away.expedition);
  world = rules.withdrawBattle(content, world, battleId, "qi");
  assert.equal(world.military.armies[attacker.id].status, "returning");
  assert.equal(
    world.military.armies[attacker.id].remainingDays,
    content.warfare.returnDays,
  );
  assert.deepEqual(world.military.armies[attacker.id].units, initialUnits);
  assert.equal(
    rules.militaryUpkeepBreakdown(content, world, "qi").total,
    away.total,
  );
  assert.throws(() => attack(world, "qi", "mengshan", [attacker.id]));
  tick(world, content.warfare.returnDays);
  assert.equal(world.military.armies[attacker.id].status, "idle");
  assert.equal(world.military.armies[attacker.id].expedition, false);
  assert.equal(
    rules.militaryUpkeepBreakdown(content, world, "qi").expedition,
    0,
  );
});

test("防守放弃立即让出目标，不凭空消灭计划部队或征用守备", () => {
  let world = attack(start(), "qi", "qufu");
  const battleId = latestBattle(world).id;
  const defenderId = armyOf(world, "lu").id;
  const men = rules.armySize(world.military.armies[defenderId]);
  const unitDay = world.military.armies[defenderId].units[0].lastBattleDay;
  world = plan(world, world.military.battles[battleId], "lu");
  world = rules.withdrawBattle(content, world, battleId, "lu");
  assert.equal(world.settlements.qufu.owner, "qi");
  assert.equal(world.military.battles[battleId].phase, "resolved");
  assert.equal(world.military.battles[battleId].garrison, 0);
  assert.equal(rules.armySize(world.military.armies[defenderId]), men);
  assert.equal(
    world.military.armies[defenderId].units[0].lastBattleDay,
    unitDay,
  );
  assert.equal(world.military.armies[defenderId].status, "idle");
});

test("攻击胜利直接占城，进攻方延迟回池，防守方即时可调度", () => {
  const { world, battleId } = readyBattle();
  const battle = world.military.battles[battleId];
  const attackerId = battle.attackerArmies[0];
  const defenderId = battle.defenderArmies[0];
  const defender = world.military.armies[defenderId];
  defender.units[0].morale = 41;
  const before = rules.armySize(defender);
  rules.finishBattle(content, world, battle, "attacker", false);
  assert.equal(world.settlements.qufu.owner, "qi");
  assert.equal(world.military.armies[attackerId].status, "returning");
  assert.equal(world.military.armies[defenderId].status, "idle");
  assert.equal(world.military.armies[defenderId].remainingDays, 0);
  assert.equal(world.military.armies[defenderId].units[0].morale, 41);
  assert.equal(rules.armySize(world.military.armies[defenderId]), before);
  assert.equal(
    world.settlements[world.military.armies[defenderId].cityId].owner,
    "lu",
  );
  const result = structuredClone(world);
  rules.finishBattle(content, world, battle, "defender", true);
  assert.deepEqual(world, result, "战果只能提交一次");
});

test("连续防守可以复用同一军团但不恢复既有伤亡", () => {
  let world = attack(start(), "qi", "qufu");
  const firstId = latestBattle(world).id;
  world = attack(world, "chu", "mengshan");
  const secondId = latestBattle(world).id;
  const defenderId = armyOf(world, "lu").id;
  world = plan(world, world.military.battles[firstId], "lu", [defenderId]);
  world = plan(world, world.military.battles[secondId], "lu", [defenderId]);
  tick(world, daysToBattle);
  rules.applyCasualties(world.military.armies[defenderId].units[0], 100);
  const survivors = rules.armySize(world.military.armies[defenderId]);
  rules.finishBattle(
    content,
    world,
    world.military.battles[firstId],
    "defender",
    false,
  );
  assert.equal(world.military.armies[defenderId].status, "idle");
  tick(world, daysToBattle - queueCap);
  assert.equal(world.military.battles[secondId].phase, "ready");
  assert.equal(world.military.armies[defenderId].status, "battle");
  assert.equal(rules.armySize(world.military.armies[defenderId]), survivors);
  assert.equal(
    world.military.armies[defenderId].units[0].offensiveFatigue ?? 0,
    0,
  );
});

test("任意参战后近期主动进攻才叠疲劳，调编不抹除部队状态", () => {
  let { world, battleId } = readyBattle();
  const defenderId = armyOf(world, "lu").id;
  rules.finishBattle(
    content,
    world,
    world.military.battles[battleId],
    "defender",
    false,
  );
  const oldUnit = world.military.armies[defenderId].units[0];
  assert.equal(oldUnit.lastBattleDay, world.military.day);
  assert.equal(oldUnit.offensiveFatigue ?? 0, 0);
  world = attack(world, "lu", "ying", [defenderId]);
  assert.equal(
    world.military.armies[defenderId].units[0].offensiveFatigue,
    content.warfare.offensiveFatiguePerAttack,
  );
  const offensiveId = latestBattle(world).id;
  world = rules.withdrawBattle(content, world, offensiveId, "lu");
  tick(world, content.warfare.returnDays);
  const transferredId = world.military.armies[defenderId].units[0].id;
  world = rules.createArmy(
    content,
    world,
    "lu",
    world.military.armies[defenderId].cityId,
  );
  const empty = Object.values(world.military.armies).find(
    (army) => army.nationId === "lu" && !army.units.length,
  );
  world = rules.transferRegiment(
    world,
    "lu",
    defenderId,
    empty.id,
    transferredId,
  );
  assert.equal(
    world.military.armies[empty.id].units[0].lastBattleDay,
    oldUnit.lastBattleDay,
  );
  assert.equal(
    world.military.armies[empty.id].units[0].offensiveFatigue,
    content.warfare.offensiveFatiguePerAttack,
  );
});

test("已有进攻疲劳在防守中仍削弱战力，但防守不新增疲劳", () => {
  let world = start();
  const defenderId = armyOf(world, "lu").id;
  const unit = world.military.armies[defenderId].units[0];
  unit.lastBattleDay = 0;
  world = attack(world, "qi", "qufu");
  const battleId = latestBattle(world).id;
  world = plan(world, world.military.battles[battleId], "lu");
  tick(world, daysToBattle);
  const readyUnit = world.military.armies[defenderId].units[0];
  readyUnit.offensiveFatigue = 0.4;
  const tiredPower = rules.regimentPower(content, world, "lu", readyUnit);
  const freshPower = rules.regimentPower(content, world, "lu", {
    ...readyUnit,
    offensiveFatigue: 0,
  });
  assert.ok(Math.abs(tiredPower / freshPower - 0.6) < 1e-9);
  rules.finishBattle(
    content,
    world,
    world.military.battles[battleId],
    "defender",
    false,
  );
  assert.equal(
    world.military.armies[defenderId].units[0].offensiveFatigue,
    0.4,
  );
  assert.equal(world.military.armies[defenderId].status, "idle");
});

test("进攻结束后再次远征增加疲劳，并按单位叠加封顶", () => {
  let { world, battleId } = readyBattle("qi");
  const attackerId = armyOf(world, "qi").id;
  rules.finishBattle(
    content,
    world,
    world.military.battles[battleId],
    "attacker",
    false,
  );
  tick(world, content.warfare.returnDays);
  assert.equal(
    world.military.armies[attackerId].units[0].offensiveFatigue ?? 0,
    0,
  );
  world = attack(world, "qi", "mengshan", [attackerId]);
  const nextId = latestBattle(world).id;
  assert.equal(
    world.military.armies[attackerId].units[0].offensiveFatigue,
    content.warfare.offensiveFatiguePerAttack,
  );
  tick(world, daysToBattle);
  rules.finishBattle(
    content,
    world,
    world.military.battles[nextId],
    "defender",
    false,
  );
  tick(world, content.warfare.returnDays);
  world.military.armies[attackerId].units[0].offensiveFatigue =
    content.warfare.maximumOffensiveFatigue - 0.01;
  world = attack(world, "qi", "teng", [attackerId]);
  assert.equal(
    world.military.armies[attackerId].units[0].offensiveFatigue,
    content.warfare.maximumOffensiveFatigue,
  );
});

test("疲劳不会在进攻准备、排队或返程中消失，池中休整才恢复", () => {
  let world = attack(start(), "qi", "qufu");
  const firstId = latestBattle(world).id;
  const attackerId = armyOf(world, "chu").id;
  world.military.armies[attackerId].units[0].lastBattleDay = 0;
  world = attack(world, "chu", "mengshan");
  const queuedId = latestBattle(world).id;
  const fatigue = content.warfare.offensiveFatiguePerAttack;
  assert.equal(
    world.military.armies[attackerId].units[0].offensiveFatigue,
    fatigue,
  );
  tick(world, queueCap + 10);
  assert.equal(
    world.military.armies[attackerId].units[0].offensiveFatigue,
    fatigue,
  );
  world = rules.withdrawBattle(content, world, queuedId, "chu");
  world = rules.withdrawBattle(content, world, firstId, "qi");
  tick(world, content.warfare.returnDays);
  assert.equal(
    world.military.armies[attackerId].units[0].offensiveFatigue,
    fatigue,
  );
  tick(world, content.warfare.fatigueRecoveryDays);
  assert.ok(
    (world.military.armies[attackerId].units[0].offensiveFatigue ?? 0) < 1e-9,
  );
});

test("决战待处理与手动战术均冻结世界，手动结算只推进一个战略日", () => {
  let { world, battleId } = readyBattle();
  assert.equal(rules.hasPendingBattle(world), true);
  const pending = rules.advanceDays(content, world, 30);
  assert.deepEqual(pending.date, world.date);
  assert.equal(pending.military.day, world.military.day);
  world = rules.startManualBattle(content, world, battleId, "lu");
  const frozen = rules.advanceDays(content, world, 30);
  assert.deepEqual(frozen.date, world.date);
  assert.equal(frozen.military.day, world.military.day);
  const before = world.military.day;
  world = rules.finishManualBattle(content, world, battleId, "lu", true);
  assert.equal(world.military.activeBattleId, null);
  assert.equal(world.military.day, before + 1);
  assert.equal(world.military.battles[battleId].phase, "resolved");
});

test("手动全灭军团仍释放战斗占用：攻方返程，守方立即回池", () => {
  for (const defeatedSide of ["attacker", "defender"]) {
    let { world, battleId } = readyBattle();
    world = rules.startManualBattle(content, world, battleId, "lu");
    const battle = world.military.battles[battleId];
    const armyId =
      defeatedSide === "attacker"
        ? battle.attackerArmies[0]
        : battle.defenderArmies[0];
    for (const unit of battle.tactical.units.filter(
      (unit) => unit.side === defeatedSide,
    )) {
      unit.cadre = 0;
      unit.levy = 0;
      unit.morale = 0;
    }
    battle.tactical.phase = "finished";
    battle.tactical.winner =
      defeatedSide === "attacker" ? "defender" : "attacker";
    world = rules.finishManualBattle(content, world, battleId, "lu");
    const army = world.military.armies[armyId];
    assert.equal(rules.armySize(army), 0);
    assert.equal(
      army.status,
      defeatedSide === "attacker" ? "returning" : "idle",
    );
    assert.equal(world.military.battles[battleId].phase, "resolved");
    assert.equal(world.military.activeBattleId, null);
  }
});

test("主动托管同样提交战果并只推进一天，AI战役不要求玩家处理", () => {
  let { world, battleId } = readyBattle();
  const before = world.military.day;
  world = rules.resolveBattleNow(content, world, battleId, "lu");
  assert.equal(world.military.day, before + 1);
  assert.equal(world.military.battles[battleId].phase, "resolved");
  let aiWorld = attack(start("yan"), "qi", "qufu");
  const aiId = latestBattle(aiWorld).id;
  tick(aiWorld, daysToBattle);
  assert.equal(aiWorld.military.battles[aiId].phase, "resolved");
  assert.equal(rules.hasPendingBattle(aiWorld), false);
});

test("读档已有的AI就绪战役在下一日结算，不永久占住队首", () => {
  const { world, battleId } = readyBattle();
  // A migrated save can contain an AI battle that was already awaiting resolution.
  world.playerNationId = "yan";
  tick(world, 1);
  assert.equal(world.military.battles[battleId].phase, "resolved");
  assert.equal(rules.defenseQueue(world, "lu").length, 0);
});

test("同时就绪的不同战役逐场提交，每场各计一天而不静默托管另一场", () => {
  let world = start("qi");
  const secondArmyId = addArmy(world, "qi");
  world = attack(world, "qi", "qufu", [armyOf(world, "qi").id]);
  const firstId = latestBattle(world).id;
  world = attack(world, "qi", "ying", [secondArmyId]);
  const secondId = latestBattle(world).id;
  tick(world, daysToBattle);
  assert.equal(world.military.battles[firstId].phase, "ready");
  assert.equal(world.military.battles[secondId].phase, "ready");
  const before = world.military.day;
  world = rules.resolveBattleNow(content, world, firstId, "qi");
  assert.equal(world.military.day, before + 1);
  assert.equal(world.military.battles[secondId].phase, "ready");
  const stopped = rules.advanceDays(content, world, 20);
  assert.equal(stopped.military.day, before + 1);
  world = rules.resolveBattleNow(content, world, secondId, "qi");
  assert.equal(world.military.day, before + 2);
});

test("没有任何可用守军仍在准备期满才失城，不生成免费人力", () => {
  let world = start();
  world.nations.lu.manpower = 0;
  world = attack(world, "qi", "qufu");
  const battleId = latestBattle(world).id;
  world = plan(world, world.military.battles[battleId], "lu", []);
  tick(world, daysToBattle - 1);
  assert.equal(world.settlements.qufu.owner, "lu");
  tick(world, 1);
  assert.equal(world.settlements.qufu.owner, "qi");
  assert.equal(world.military.battles[battleId].phase, "resolved");
  assert.equal(world.military.battles[battleId].garrison, 0);
  assert.equal(world.nations.lu.manpower, 0);
});

test("手动快照保留疲劳与守方城防，地方守备也进入战场", () => {
  let world = attack(start("qi"), "lu", "linzi");
  const battleId = latestBattle(world).id;
  world = plan(world, world.military.battles[battleId], "qi");
  tick(world, daysToBattle);
  const army = armyOf(world, "qi");
  army.units[0].offensiveFatigue = 0.4;
  const freshWorld = structuredClone(world);
  freshWorld.military.armies[army.id].units[0].offensiveFatigue = 0;
  const withoutWalls = structuredClone(world);
  withoutWalls.settlements.linzi.buildings.walls.effectiveLevel = 0;
  const tired = rules.startManualBattle(content, world, battleId, "qi");
  const fresh = rules.startManualBattle(content, freshWorld, battleId, "qi");
  const unfortified = rules.startManualBattle(
    content,
    withoutWalls,
    battleId,
    "qi",
  );
  const tacticalUnit = (state) =>
    state.military.battles[battleId].tactical.units.find(
      (unit) => unit.armyId === army.id,
    );
  assert.ok(
    Math.abs(
      tacticalUnit(tired).attackMultiplier /
        tacticalUnit(fresh).attackMultiplier -
        0.6,
    ) < 1e-9,
  );
  assert.ok(
    tacticalUnit(tired).defenseMultiplier >
      tacticalUnit(unfortified).defenseMultiplier,
  );
  assert.ok(
    tired.military.battles[battleId].tactical.units.some(
      (unit) => unit.armyId === null && unit.side === "defender",
    ),
  );
  assert.ok(
    rules.battleStrength(
      content,
      world,
      world.military.battles[battleId],
      "defender",
    ) >
      rules.battleStrength(
        content,
        withoutWalls,
        withoutWalls.military.battles[battleId],
        "defender",
      ),
  );
});

test("军费滑条不追溯生效，月底实付不足同时削弱自动与手动战力", () => {
  let { world, battleId } = readyBattle();
  const armyId = armyOf(world, "qi").id;
  const unit = world.military.armies[armyId].units[0];
  const fundedPower = rules.regimentPower(content, world, "qi", unit);
  const funded = rules.startManualBattle(content, world, battleId, "lu");
  world.nations.qi.budget.army = 0;
  assert.equal(rules.regimentPower(content, world, "qi", unit), fundedPower);
  rules.settleMonth(content, world);
  assert.equal(world.nations.qi.operatingCoverage.army, 0);
  assert.ok(
    Math.abs(
      rules.regimentPower(content, world, "qi", unit) / fundedPower - 0.05,
    ) < 1e-9,
  );
  const unfunded = rules.startManualBattle(content, world, battleId, "lu");
  const snapshot = (state) =>
    state.military.battles[battleId].tactical.units.find(
      (item) => item.id === unit.id,
    );
  assert.ok(
    Math.abs(
      snapshot(unfunded).attackMultiplier / snapshot(funded).attackMultiplier -
        0.05,
    ) < 1e-9,
  );
});

test("目标先被他国占领时取消失效进攻，不自动改打新主人", () => {
  let world = attack(start("qi"), "qi", "qufu");
  const battleId = latestBattle(world).id;
  const armyId = armyOf(world, "qi").id;
  rules.occupyCity(content, world, "qufu", "chu");
  tick(world, 1);
  assert.equal(world.military.battles[battleId].phase, "resolved");
  assert.equal(world.military.armies[armyId].status, "returning");
  assert.equal(world.settlements.qufu.owner, "chu");
  assert.equal(rules.defenseQueue(world, "lu").length, 0);
});

test("灭国清理本国军团和所有未结战役，不遗留队首或将领占用", () => {
  let world = start("qi");
  const general = Object.values(world.research.talents).find(
    (talent) => talent.nationId === "lu",
  );
  general.role = "general";
  general.recruitedMonth = 0;
  general.busy = false;
  world = rules.assignGeneral(world, "lu", armyOf(world, "lu").id, general.id);
  for (const city of Object.values(world.settlements))
    if (city.owner === "lu" && city.id !== "qufu") city.owner = "qi";
  world = attack(world, "lu", "ying");
  assert.equal(world.research.talents[general.id].busy, true);
  const outboundId = latestBattle(world).id;
  world = attack(world, "qi", "qufu");
  const incomingId = latestBattle(world).id;
  world = attack(world, "jin", "qufu");
  const queuedId = latestBattle(world).id;
  // Remove the final city through the same occupation path used by victories.
  rules.occupyCity(content, world, "qufu", "qi");
  tick(world, 1);
  assert.ok(
    !Object.values(world.military.armies).some(
      (army) => army.nationId === "lu",
    ),
  );
  for (const id of [outboundId, incomingId, queuedId])
    assert.equal(world.military.battles[id].phase, "resolved");
  assert.equal(rules.defenseQueue(world, "lu").length, 0);
  assert.equal(world.military.activeBattleId, null);
  assert.equal(world.research.talents[general.id].busy, false);
});

test("失城按容量同比扣统一人力储备一次，既有军队不同比删除", () => {
  const world = start("qi");
  const before = world.nations.lu.manpower;
  const oldCap = rules.manpowerCapacity(content, world, "lu");
  const existing = armyOf(world, "lu");
  const soldiers = rules.armySize(existing);
  rules.occupyCity(content, world, "qufu", "qi");
  const cap = rules.manpowerCapacity(content, world, "lu");
  assert.equal(world.nations.lu.manpower, (before * cap) / oldCap);
  assert.equal(rules.armySize(existing), soldiers);
  assert.equal(world.settlements.qufu.owner, "qi");
});

test("转训常备提高持续维护且不凭空增加总人数", () => {
  let world = start("qi");
  const army = armyOf(world, "qi");
  world.nations.qi.treasury = 1000;
  const unit = army.units[0];
  const before = rules.militaryUpkeep(content, world, "qi");
  const pool = world.nations.qi.manpower;
  const total = rules.armySize(army);
  world = rules.professionalizeRegiment(content, world, "qi", army.id, unit.id);
  assert.equal(rules.armySize(world.military.armies[army.id]), total);
  assert.equal(world.nations.qi.manpower, pool);
  assert.ok(rules.militaryUpkeep(content, world, "qi") > before);
  assert.ok(world.military.armies[army.id].units[0].cadre > unit.cadre);
});

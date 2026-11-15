import { atWar } from "./fixtures/war-world.mjs";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundle = await build({
  stdin: {
    contents:
      "export * from './src/simulation/military.ts'; export * from './src/simulation/military-tactics.ts'; export * from './src/simulation/state.ts'; export * from './src/definitions/validate.ts';",
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
      .map(async ([key, path]) => [
        key,
        JSON.parse(await readFile(`public/content/base/${path}`, "utf8")),
      ]),
  ),
);
// Stable six-country fixture isolates rules from changes to the shipped historical starts.
raw.scenario = JSON.parse(
  await readFile("tests/fixtures/legacy-scenario.json", "utf8"),
);
const baseContent = rules.validateContent(raw);

function armyOf(world, nationId) {
  return Object.values(world.military.armies).find(
    (army) => army.nationId === nationId,
  );
}

function fixture({
  player = "qi",
  type = "infantry",
  deployment = false,
  startReady = true,
  actionPoints,
  unitCount = 1,
  generalCommand,
} = {}) {
  const content = structuredClone(baseContent);
  if (actionPoints !== undefined)
    content.units.find((unit) => unit.id === type).actionPoints = actionPoints;
  let world = atWar(rules.createWorld(content));
  world.playerNationId = player;
  const attackerId = armyOf(world, "qi").id;
  const defenderId = armyOf(world, "lu").id;
  world = rules.startAttack(content, world, "qi", [attackerId], "qufu");
  const battleId = Object.keys(world.military.battles)[0];
  world = rules.assignBattleDefenders(content, world, battleId, "lu", [
    defenderId,
  ]);
  for (let i = 0; i < content.warfare.preparationDays; i++)
    rules.tickMilitaryDay(content, world);
  // Isolate two regiments; garrison integration is covered in military.test.mjs.
  world.military.battles[battleId].garrison = 0;
  const ownArmy = armyOf(world, player);
  ownArmy.units[0].typeId = type;
  for (let i = 1; i < unitCount; i++)
    ownArmy.units.push({
      ...structuredClone(ownArmy.units[0]),
      id: `unit-${world.military.nextId++}`,
    });
  if (generalCommand !== undefined) {
    const general = Object.values(world.research.talents).find(
      (talent) => talent.nationId === player,
    );
    Object.assign(general, {
      command: generalCommand,
      role: "general",
      recruitedMonth: 0,
    });
    ownArmy.generalId = general.id;
  }
  world.research.nations[player].unlocked = content.technologies.map(
    (item) => item.id,
  );
  world = rules.startManualBattle(content, world, battleId, player);
  if (!deployment)
    world = rules.endTacticalTurn(content, world, battleId, player);
  const battle = world.military.battles[battleId];
  const unit = battle.tactical.units.find((item) => item.armyId === ownArmy.id);
  const enemy = battle.tactical.units.find((item) => item.side !== unit.side);
  if (!deployment) {
    Object.assign(unit, { x: 0, y: 1 });
    Object.assign(enemy, { x: 9, y: 6 });
  }
  const context = {
    content,
    world,
    battleId,
    player,
    unitId: unit.id,
    enemyId: enemy.id,
  };
  context.world = rules.selectTacticalUnit(world, battleId, unit.id, player);
  if (!deployment && startReady) {
    // Local command tests start at this regiment's actual activation boundary.
    // Scheduler integration tests use startReady:false and naturally charge all bars.
    for (const waiting of battleOf(context).tactical.units)
      waiting.actionProgress = content.tactics.actionThreshold / 2;
    unitOf(context).actionProgress = content.tactics.actionThreshold;
    context.world = rules.advanceTacticalTime(
      content,
      context.world,
      battleId,
      0,
    );
  }
  return context;
}

const battleOf = (f) => f.world.military.battles[f.battleId];
const unitOf = (f) =>
  battleOf(f).tactical.units.find((unit) => unit.id === f.unitId);
const enemyOf = (f) =>
  battleOf(f).tactical.units.find((unit) => unit.id === f.enemyId);
const men = (unit) => unit.cadre + unit.levy;
function order(f, x, y, mode = "auto") {
  f.world = rules.actTactical(
    f.content,
    f.world,
    f.battleId,
    f.player,
    x,
    y,
    mode,
  );
}
function endTurn(f) {
  f.world = rules.endTacticalTurn(f.content, f.world, f.battleId, f.player);
}
function advance(f, delta = 100) {
  f.world = rules.advanceTacticalTime(f.content, f.world, f.battleId, delta);
}
function step(f) {
  f.world = rules.stepTacticalAutomation(
    f.content,
    f.world,
    f.battleId,
    f.player,
  );
}
function nextOwnActivation(f) {
  const prior = unitOf(f).activationCount;
  if (battleOf(f).tactical.activeUnitId === f.unitId) endTurn(f);
  for (let i = 0; i < 100; i++) {
    if (battleOf(f).tactical.phase === "finished")
      throw new Error("battle ended before next activation");
    if (
      battleOf(f).tactical.activeUnitId === f.unitId &&
      unitOf(f).activationCount > prior
    )
      return;
    if (!battleOf(f).tactical.activeUnitId) advance(f);
    else {
      const active = battleOf(f).tactical.units.find(
        (u) => u.id === battleOf(f).tactical.activeUnitId,
      );
      if (active.side === unitOf(f).side && !active.statuses.length) endTurn(f);
      else step(f);
    }
  }
  throw new Error("scheduler failed to return the player regiment");
}
function query(f, mode = "auto") {
  return rules.tacticalActions(f.content, battleOf(f), f.unitId, mode, f.world);
}
function strategy(f, effect) {
  const definition = f.content.tactics.strategies.find(
    (item) => item.effect === effect,
  );
  assert.ok(
    definition,
    `${effect} strategy must exist in the playable content`,
  );
  delete definition.requires;
  return definition;
}
function addFriendly(f, x, y) {
  const copy = {
    ...structuredClone(unitOf(f)),
    id: `fixture-${x}-${y}`,
    x,
    y,
    actionProgress: 0,
    activationCount: 0,
  };
  battleOf(f).tactical.units.push(copy);
  return copy;
}

const hexCases = [
  {
    origin: { x: 4, y: 3 },
    neighbors: [
      { x: 4, y: 2 },
      { x: 4, y: 4 },
      { x: 3, y: 2 },
      { x: 3, y: 3 },
      { x: 5, y: 2 },
      { x: 5, y: 3 },
    ],
  },
  {
    origin: { x: 5, y: 3 },
    neighbors: [
      { x: 5, y: 2 },
      { x: 5, y: 4 },
      { x: 4, y: 3 },
      { x: 4, y: 4 },
      { x: 6, y: 3 },
      { x: 6, y: 4 },
    ],
  },
];
const tileKey = ({ x, y }) => `${x},${y}`;

test("错列战场与C一致：奇数列下移半格，奇偶列各有六个正确邻格", () => {
  for (const { origin, neighbors } of hexCases) {
    assert.deepEqual(rules.hexNeighbors(origin, 12, 8), neighbors);
    for (const neighbor of neighbors) {
      assert.equal(rules.hexDistance(origin, neighbor), 1);
      assert.equal(rules.hexDistance(neighbor, origin), 1);
      assert.ok(
        rules
          .hexNeighbors(neighbor, 12, 8)
          .some((point) => tileKey(point) === tileKey(origin)),
      );
    }
  }
});

test("错列战场边缘裁剪六邻，不生成越界邻格或行首行尾环绕", () => {
  assert.deepEqual(rules.hexNeighbors({ x: 0, y: 0 }, 12, 8), [
    { x: 0, y: 1 },
    { x: 1, y: 0 },
  ]);
  assert.deepEqual(rules.hexNeighbors({ x: 11, y: 7 }, 12, 8), [
    { x: 11, y: 6 },
    { x: 10, y: 7 },
  ]);
  for (let x = 0; x < 12; x++)
    for (let y = 0; y < 8; y++) {
      const neighbors = rules.hexNeighbors({ x, y }, 12, 8);
      assert.equal(new Set(neighbors.map(tileKey)).size, neighbors.length);
      for (const point of neighbors)
        assert.ok(point.x >= 0 && point.x < 12 && point.y >= 0 && point.y < 8);
    }
});

test("六角距离在全棋盘对称，并等于六邻通路最短步数", () => {
  for (let x = 0; x < 12; x++)
    for (let y = 0; y < 8; y++) {
      const origin = { x, y };
      const distances = new Map([[tileKey(origin), 0]]);
      const queue = [origin];
      for (let index = 0; index < queue.length; index++) {
        const current = queue[index];
        for (const neighbor of rules.hexNeighbors(current, 12, 8)) {
          if (distances.has(tileKey(neighbor))) continue;
          distances.set(tileKey(neighbor), distances.get(tileKey(current)) + 1);
          queue.push(neighbor);
        }
      }
      assert.equal(distances.size, 96);
      for (const target of queue) {
        assert.equal(
          rules.hexDistance(origin, target),
          distances.get(tileKey(target)),
        );
        assert.equal(
          rules.hexDistance(target, origin),
          rules.hexDistance(origin, target),
        );
      }
    }
});

test("一个AP在平地可走六个邻向，奇偶列预览和实际移动一致", () => {
  for (const { origin, neighbors } of hexCases) {
    const f = fixture();
    Object.assign(unitOf(f), origin, { actionPoints: 1 });
    f.content.tactics.plainMoveCost = 1;
    f.content.tactics.roughMoveCost = 1;
    assert.deepEqual(
      new Set(query(f, "move").moves.keys()),
      new Set(neighbors.map(tileKey)),
    );
    for (const destination of neighbors) {
      const moved = structuredClone(f);
      order(moved, destination.x, destination.y, "move");
      assert.equal(tileKey(unitOf(moved)), tileKey(destination));
      assert.equal(unitOf(moved).actionPoints, 0);
    }
  }
});

test("奇偶列的六个贴身方向都锁定移动和射击，但允许近战", () => {
  for (const { origin, neighbors } of hexCases)
    for (const target of neighbors) {
      const f = fixture({ type: "crossbow" });
      Object.assign(unitOf(f), origin);
      Object.assign(enemyOf(f), target);
      assert.equal(
        query(f).engaged,
        true,
        `${tileKey(origin)} -> ${tileKey(target)}`,
      );
      assert.equal(query(f, "move").moves.size, 0);
      assert.equal(query(f, "shoot").attacks.size, 0);
      assert.ok(query(f, "melee").attacks.has(f.enemyId));
      const before = structuredClone(f.world);
      assert.throws(() => order(f, 0, 0, "move"));
      assert.deepEqual(f.world, before);
      order(f, target.x, target.y, "melee");
      assert.ok(
        men(enemyOf(f)) <
          men(
            before.military.battles[f.battleId].tactical.units.find(
              (unit) => unit.id === f.enemyId,
            ),
          ),
      );
    }
});

test("射击与计策按六角距离判射程，不把错列斜向误算为曼哈顿距离", () => {
  const ranged = fixture({ type: "crossbow" });
  Object.assign(unitOf(ranged), { x: 4, y: 3 });
  Object.assign(enemyOf(ranged), { x: 7, y: 1 });
  assert.equal(rules.hexDistance(unitOf(ranged), enemyOf(ranged)), 3);
  assert.ok(query(ranged, "shoot").attacks.has(ranged.enemyId));
  const outside = structuredClone(ranged);
  enemyOf(outside).y = 0;
  assert.equal(rules.hexDistance(unitOf(outside), enemyOf(outside)), 4);
  assert.equal(query(outside, "shoot").attacks.size, 0);
  assert.throws(() => order(outside, 7, 0, "shoot"));
  order(ranged, 7, 1, "shoot");
  const scheme = fixture();
  const fire = strategy(scheme, "fire");
  fire.range = 2;
  Object.assign(unitOf(scheme), { x: 4, y: 3 });
  Object.assign(enemyOf(scheme), { x: 6, y: 2 });
  assert.equal(rules.hexDistance(unitOf(scheme), enemyOf(scheme)), 2);
  assert.ok(query(scheme, fire.id).attacks.has(scheme.enemyId));
  order(scheme, 6, 2, fire.id);
  assert.equal(unitOf(scheme).strategyUsed, true);
});

test("部署不消耗行动力，开战按兵种初始化行动力且骑兵更多", () => {
  const infantry = fixture({ deployment: true });
  const initial = unitOf(infantry).actionPoints;
  order(infantry, 3, 7, "move");
  order(infantry, 2, 6, "move");
  assert.equal(unitOf(infantry).actionPoints, initial);
  endTurn(infantry);
  assert.equal(battleOf(infantry).tactical.activeUnitId, null);
  advance(infantry);
  while (activeOf(infantry).id !== infantry.unitId) {
    finishActor(infantry);
    advance(infantry);
  }
  assert.equal(
    unitOf(infantry).actionPoints,
    infantry.content.tactics.baseActionPoints,
  );
  const cavalry = fixture({ type: "cavalry" });
  assert.equal(
    unitOf(cavalry).actionPoints,
    cavalry.content.tactics.cavalryActionPoints,
  );
  assert.ok(unitOf(cavalry).maxActionPoints > unitOf(infantry).maxActionPoints);
});

test("Mod兵种可显式覆盖通用行动力，不由旧movement字段暗中决定", () => {
  const f = fixture({ type: "infantry", actionPoints: 9 });
  assert.equal(unitOf(f).maxActionPoints, 9);
  assert.equal(unitOf(f).actionPoints, 9);
  order(f, 1, 1, "move");
  assert.equal(unitOf(f).actionPoints, 8);
});

test("战术定义拒绝坏概率、错误引用、未知效果、动作ID冲突与非法AP", () => {
  const changes = [
    (pack) => {
      pack.tactics.baseInitiative = 0;
    },
    (pack) => {
      pack.tactics.actionThreshold = -1;
    },
    (pack) => {
      pack.tactics.trainingInitiativeBonus = -0.1;
    },
    (pack) => {
      pack.tactics.moraleInitiativeBonus = Number.POSITIVE_INFINITY;
    },
    (pack) => {
      pack.units[0].initiative = 0;
    },
    (pack) => {
      pack.tactics.strategies[0].successChance = 1.1;
    },
    (pack) => {
      pack.tactics.strategies[0].requires = "not-a-technology";
    },
    (pack) => {
      pack.tactics.strategies[0].effect = "teleport";
    },
    (pack) => {
      pack.tactics.strategies[0].id = "auto";
    },
    (pack) => {
      pack.tactics.strategies.push(structuredClone(pack.tactics.strategies[0]));
    },
    (pack) => {
      pack.tactics.meleeCost = 0;
    },
    (pack) => {
      pack.tactics.baseActionPoints = 1.5;
    },
    (pack) => {
      pack.units[0].actionPoints = -1;
    },
    (pack) => {
      pack.units[0].actionPoints = 2.5;
    },
  ];
  for (const change of changes) {
    const pack = structuredClone(raw);
    change(pack);
    assert.throws(() => rules.validateContent(pack));
  }
});

test("骑兵三AP可分两次移动后近战，AP按路径与攻击累计扣除", () => {
  const f = fixture({ type: "cavalry" });
  Object.assign(enemyOf(f), { x: 3, y: 1 });
  const initial = unitOf(f).actionPoints;
  const before = men(enemyOf(f));
  order(f, 1, 1, "move");
  assert.equal(
    unitOf(f).actionPoints,
    initial - f.content.tactics.plainMoveCost,
  );
  assert.equal(unitOf(f).acted, false);
  order(f, 2, 1, "move");
  order(f, 3, 1, "melee");
  assert.equal(
    unitOf(f).actionPoints,
    initial - f.content.tactics.plainMoveCost * 2 - f.content.tactics.meleeCost,
  );
  assert.ok(men(enemyOf(f)) < before);
});

test("行动力不足与非法目标不消耗AP、不造成伤亡或改动原状态", () => {
  const f = fixture();
  Object.assign(enemyOf(f), { x: 1, y: 1 });
  unitOf(f).actionPoints = f.content.tactics.meleeCost - 1;
  const before = structuredClone(f.world);
  assert.throws(() => order(f, 1, 1, "melee"));
  assert.deepEqual(f.world, before);
  assert.throws(() => order(f, -1, 1, "move"));
  assert.deepEqual(f.world, before);
});

test("敌军贴身后不能移动，进入控制区可攻击但不能继续穿过", () => {
  const f = fixture({ actionPoints: 6 });
  Object.assign(unitOf(f), { x: 0, y: 0 });
  Object.assign(enemyOf(f), { x: 3, y: 0 });
  for (let x = 0; x < 12; x++) addFriendly(f, x, 1);
  assert.ok(query(f).moves.has("2,0"));
  assert.ok(
    !query(f).moves.has("4,0"),
    "cannot route through an enemy's contact zone",
  );
  assert.ok(
    !query(f).moves.has("0,1"),
    "occupied friendly cells block movement",
  );
  order(f, 2, 0, "move");
  assert.equal(query(f).engaged, true);
  assert.equal(query(f).moves.size, 0);
  const before = structuredClone(f.world);
  assert.throws(() => order(f, 1, 0, "move"));
  assert.deepEqual(f.world, before);
  assert.ok(query(f, "melee").attacks.has(f.enemyId));
});

test("林丘与平地分别扣实际地形AP，预览和执行使用同一费用", () => {
  const f = fixture();
  const actions = query(f);
  assert.equal(rules.tacticalTerrain(f.content, battleOf(f), 1, 1), "plain");
  assert.notEqual(rules.tacticalTerrain(f.content, battleOf(f), 0, 0), "plain");
  assert.equal(actions.moves.get("1,1"), f.content.tactics.plainMoveCost);
  assert.equal(actions.moves.get("0,0"), f.content.tactics.roughMoveCost);
  const before = unitOf(f).actionPoints;
  order(f, 0, 0, "move");
  assert.equal(unitOf(f).actionPoints, before - actions.moves.get("0,0"));
});

test("弩兵显式射击按射程选敌，远射没有近战反击", () => {
  const f = fixture({ type: "crossbow" });
  Object.assign(enemyOf(f), { x: 3, y: 1 });
  assert.ok(query(f, "shoot").attacks.has(f.enemyId));
  assert.ok(!query(f, "melee").attacks.has(f.enemyId));
  const sourceMen = men(unitOf(f));
  const targetMen = men(enemyOf(f));
  const ap = unitOf(f).actionPoints;
  order(f, 3, 1, "shoot");
  assert.ok(men(enemyOf(f)) < targetMen);
  assert.equal(men(unitOf(f)), sourceMen);
  assert.equal(unitOf(f).actionPoints, ap - f.content.tactics.shootCost);
});

test("贴身弩兵只能近战，纯征召不能借远程模板获得射击", () => {
  const f = fixture({ type: "crossbow" });
  Object.assign(enemyOf(f), { x: 1, y: 1 });
  assert.equal(query(f, "shoot").attacks.size, 0);
  assert.ok(query(f, "melee").attacks.has(f.enemyId));
  assert.throws(() => order(f, 1, 1, "shoot"));
  const sourceMen = men(unitOf(f));
  order(f, 1, 1, "melee");
  assert.ok(
    men(unitOf(f)) < sourceMen,
    "surviving adjacent defender counters melee",
  );
  const noCore = fixture({ type: "crossbow" });
  unitOf(noCore).cadre = 0;
  Object.assign(enemyOf(noCore), { x: 3, y: 1 });
  assert.equal(query(noCore, "shoot").attacks.size, 0);
  assert.throws(() => order(noCore, 3, 1, "shoot"));
});

test("相同常备弩手的射击伤害不会被额外征召人数放大", () => {
  const few = fixture({ type: "crossbow" });
  const many = structuredClone(few);
  unitOf(few).levy = 10;
  unitOf(many).levy = 5000;
  Object.assign(enemyOf(few), { x: 3, y: 1 });
  Object.assign(enemyOf(many), { x: 3, y: 1 });
  const before = men(enemyOf(few));
  order(few, 3, 1, "shoot");
  order(many, 3, 1, "shoot");
  assert.ok(men(enemyOf(few)) < before);
  assert.equal(men(enemyOf(few)), men(enemyOf(many)));
});

test("计策可由科技锁定，未研究时不能施放且无副作用", () => {
  const f = fixture();
  const fire = strategy(f, "fire");
  fire.requires = "infantry_3";
  fire.successChance = 1;
  worldRemoveUnlock(f, fire.requires);
  Object.assign(enemyOf(f), { x: 1, y: 1 });
  const before = structuredClone(f.world);
  assert.throws(() => order(f, 1, 1, fire.id));
  assert.deepEqual(f.world, before);
  f.world.research.nations[f.player].unlocked.push(fire.requires);
  order(f, 1, 1, fire.id);
  assert.equal(unitOf(f).strategyUsed, true);
});
function worldRemoveUnlock(f, id) {
  f.world.research.nations[f.player].unlocked = f.world.research.nations[
    f.player
  ].unlocked.filter((entry) => entry !== id);
}

for (const successChance of [0, 1]) {
  test(`火攻${successChance ? "成功" : "失败"}都恰好消耗一次AP及本次行动计策机会`, () => {
    const f = fixture();
    const fire = strategy(f, "fire");
    fire.successChance = successChance;
    Object.assign(enemyOf(f), { x: 1, y: 1 });
    const initial = unitOf(f).actionPoints;
    const before = men(enemyOf(f));
    order(f, 1, 1, fire.id);
    assert.equal(unitOf(f).actionPoints, initial - fire.actionPoints);
    assert.equal(unitOf(f).strategyUsed, true);
    if (successChance) assert.ok(men(enemyOf(f)) < before);
    else assert.equal(men(enemyOf(f)), before);
    const after = structuredClone(f.world);
    assert.throws(() => order(f, 1, 1, fire.id));
    assert.deepEqual(f.world, after);
  });
}

for (const player of ["qi", "lu"]) {
  test(`疑兵使${player === "qi" ? "守" : "攻"}方跳过完整下次行动，查询不消耗状态`, () => {
    const f = fixture({ player });
    const doubt = strategy(f, "doubt");
    doubt.successChance = 1;
    doubt.duration = 1;
    Object.assign(enemyOf(f), { x: 1, y: 1 });
    const before = men(unitOf(f));
    order(f, 1, 1, doubt.id);
    assert.equal(
      enemyOf(f).statuses.find((status) => status.kind === "doubt")
        ?.remainingActivations,
      1,
    );
    query(f);
    query(f);
    assert.equal(
      enemyOf(f).statuses.find((status) => status.kind === "doubt")
        ?.remainingActivations,
      1,
    );
    nextOwnActivation(f);
    assert.equal(
      men(unitOf(f)),
      before,
      "controlled enemy cannot attack during its skipped turn",
    );
    assert.equal(
      enemyOf(f).statuses.some((status) => status.kind === "doubt"),
      false,
    );
    assert.equal(
      unitOf(f).strategyUsed,
      false,
      "next activation restores one strategy opportunity",
    );
  });
}

test("第二施术者不能重置疑兵；状态只在目标自己结束行动时减少", () => {
  const f = fixture();
  const doubt = strategy(f, "doubt");
  doubt.successChance = 1;
  doubt.duration = 2;
  Object.assign(enemyOf(f), { x: 1, y: 1 });
  const other = addFriendly(f, 1, 2);
  other.actionProgress = f.content.tactics.actionThreshold;
  order(f, 1, 1, doubt.id);
  endTurn(f);
  advance(f, 0);
  assert.equal(battleOf(f).tactical.activeUnitId, other.id);
  assert.equal(enemyOf(f).statuses[0].remainingActivations, 2);
  f.world = rules.selectTacticalUnit(f.world, f.battleId, other.id, f.player);
  const before = structuredClone(f.world);
  assert.throws(() => order(f, 1, 1, doubt.id));
  assert.deepEqual(f.world, before);
  endTurn(f);
  assert.equal(enemyOf(f).statuses[0].remainingActivations, 2);
  for (let i = 0; i < 80 && enemyOf(f).statuses.length; i++) {
    const activeId = battleOf(f).tactical.activeUnitId;
    if (!activeId) advance(f);
    else if (activeId === f.enemyId) step(f);
    else endTurn(f);
  }
  assert.equal(enemyOf(f).statuses.length, 0);
  assert.equal(enemyOf(f).activationCount, 2);
});

test("鼓舞选择友军恢复士气，不能作用敌军或反复刷新本次行动次数", () => {
  const f = fixture();
  const rally = strategy(f, "rally");
  rally.successChance = 1;
  unitOf(f).morale = 30;
  const before = unitOf(f).actionPoints;
  Object.assign(enemyOf(f), { x: 1, y: 1, morale: 20 });
  const invalid = structuredClone(f.world);
  assert.throws(() => order(f, 1, 1, rally.id));
  assert.deepEqual(f.world, invalid);
  order(f, unitOf(f).x, unitOf(f).y, rally.id);
  assert.ok(unitOf(f).morale > 30);
  assert.equal(unitOf(f).actionPoints, before - rally.actionPoints);
  assert.equal(unitOf(f).strategyUsed, true);
  assert.throws(() => order(f, unitOf(f).x, unitOf(f).y, rally.id));
});

test("火矢引燃失败仍有正常射击，成功只追加一次火伤", () => {
  const shot = fixture({ type: "crossbow" });
  const failed = structuredClone(shot);
  const success = structuredClone(shot);
  for (const f of [shot, failed, success])
    Object.assign(enemyOf(f), { x: 3, y: 1 });
  const failedFire = strategy(failed, "fireArrow");
  failedFire.successChance = 0;
  const successfulFire = strategy(success, "fireArrow");
  successfulFire.successChance = 1;
  order(shot, 3, 1, "shoot");
  order(failed, 3, 1, failedFire.id);
  order(success, 3, 1, successfulFire.id);
  assert.equal(men(enemyOf(failed)), men(enemyOf(shot)));
  assert.ok(men(enemyOf(success)) < men(enemyOf(failed)));
  assert.equal(
    unitOf(failed).actionPoints,
    unitOf(failed).maxActionPoints - failedFire.actionPoints,
  );
  assert.equal(
    unitOf(success).actionPoints,
    unitOf(success).maxActionPoints - successfulFire.actionPoints,
  );
  assert.equal(unitOf(success).strategyUsed, true);
});

test("挑衅使目标按AP追击施术者并近战，结束行动后消除状态", () => {
  const f = fixture();
  const provoke = strategy(f, "provoke");
  provoke.successChance = 1;
  provoke.duration = 1;
  Object.assign(enemyOf(f), { x: 2, y: 1 });
  order(f, 2, 1, provoke.id);
  assert.equal(
    enemyOf(f).statuses.find((status) => status.kind === "provoke")?.sourceId,
    f.unitId,
  );
  const before = men(unitOf(f));
  nextOwnActivation(f);
  assert.equal(rules.hexDistance(unitOf(f), enemyOf(f)), 1);
  assert.ok(men(unitOf(f)) < before);
  assert.ok(enemyOf(f).actionPoints >= 0);
  assert.equal(
    enemyOf(f).statuses.some((status) => status.kind === "provoke"),
    false,
  );
});

test("挑衅源已溃灭时取消控制，目标不会为失效追击浪费整次行动", () => {
  const f = fixture();
  // This case tests expired control, not scouting. Fog decisions have their own suite.
  f.content.tactics.visibility.enabled = false;
  const provoke = strategy(f, "provoke");
  provoke.successChance = 1;
  provoke.duration = 3;
  Object.assign(enemyOf(f), { x: 3, y: 1 });
  addFriendly(f, 3, 7);
  order(f, 3, 1, provoke.id);
  Object.assign(unitOf(f), { cadre: 0, levy: 0, morale: 0 });
  f.content.tactics.strategies = [];
  endTurn(f);
  for (
    let i = 0;
    i < 30 &&
    (enemyOf(f).activationCount < 1 ||
      battleOf(f).tactical.activeUnitId === f.enemyId);
    i++
  ) {
    if (!battleOf(f).tactical.activeUnitId) advance(f);
    else if (battleOf(f).tactical.activeUnitId === f.enemyId) step(f);
    else endTurn(f);
  }
  assert.equal(
    enemyOf(f).statuses.some((status) => status.kind === "provoke"),
    false,
  );
  assert.ok(
    enemyOf(f).y > 1,
    "enemy resumes ordinary action toward a surviving opponent",
  );
});

test("被疑兵控制的玩家不能用移动、攻击、计策或坚守绕过控制", () => {
  const f = fixture();
  const doubt = strategy(f, "doubt");
  doubt.successChance = 1;
  Object.assign(enemyOf(f), { x: 1, y: 1 });
  unitOf(f).statuses.push({
    kind: "doubt",
    remainingActivations: 1,
    sourceId: f.enemyId,
  });
  const before = structuredClone(f.world);
  for (const mode of ["move", "melee", "shoot", "guard", "wait", doubt.id]) {
    assert.throws(() =>
      order(f, mode === "guard" || mode === "wait" ? 0 : 1, 1, mode),
    );
    assert.deepEqual(f.world, before);
  }
});

test("坚守耗尽行动力并减少敌方伤害，下次行动开始取消防御姿态", () => {
  const ordinary = fixture();
  ordinary.content.tactics.strategies = [];
  Object.assign(enemyOf(ordinary), { x: 1, y: 1 });
  const guarded = structuredClone(ordinary);
  const initial = men(unitOf(ordinary));
  order(guarded, unitOf(guarded).x, unitOf(guarded).y, "guard");
  assert.equal(unitOf(guarded).actionPoints, 0);
  assert.equal(unitOf(guarded).guarding, true);
  nextOwnActivation(ordinary);
  nextOwnActivation(guarded);
  assert.ok(men(unitOf(ordinary)) < initial);
  assert.ok(men(unitOf(guarded)) > men(unitOf(ordinary)));
  assert.equal(unitOf(guarded).guarding, false);
  assert.equal(unitOf(guarded).actionPoints, unitOf(guarded).maxActionPoints);
});

test("待机按配置恢复士气但不超过100，且不能继续移动或施计", () => {
  const f = fixture();
  f.content.tactics.waitMoraleRecovery = 7;
  unitOf(f).morale = 97;
  order(f, unitOf(f).x, unitOf(f).y, "wait");
  assert.equal(unitOf(f).morale, 100);
  assert.equal(unitOf(f).actionPoints, 0);
  assert.equal(unitOf(f).acted, true);
  assert.equal(query(f).moves.size, 0);
  assert.throws(() => order(f, 1, 1, "move"));
});

test("军团将领统率统一增强旗下全部部队，不需要每队指派武将", () => {
  const plain = fixture({ unitCount: 2 });
  const commanded = fixture({ unitCount: 2, generalCommand: 100 });
  const plainOwn = battleOf(plain).tactical.units.filter(
    (unit) => unit.side === unitOf(plain).side,
  );
  const commandedOwn = battleOf(commanded).tactical.units.filter(
    (unit) => unit.side === unitOf(commanded).side,
  );
  assert.equal(plainOwn.length, 2);
  assert.equal(commandedOwn.length, 2);
  for (let i = 0; i < 2; i++) {
    assert.ok(commandedOwn[i].attackMultiplier > plainOwn[i].attackMultiplier);
    assert.equal(commandedOwn[i].generalId, undefined);
  }
  assert.equal(
    commandedOwn[0].attackMultiplier,
    commandedOwn[1].attackMultiplier,
  );
});

test("AI使用同一AP规则，能够先接近再近战且不穿越贴身单位", () => {
  const f = fixture();
  f.content.tactics.strategies = [];
  Object.assign(unitOf(f), { x: 2, y: 1 });
  Object.assign(enemyOf(f), { x: 0, y: 1 });
  const before = men(unitOf(f));
  nextOwnActivation(f);
  assert.ok(
    men(unitOf(f)) < before,
    "AI can move then attack within one activation",
  );
  assert.equal(rules.hexDistance(unitOf(f), enemyOf(f)), 1);
  assert.ok(enemyOf(f).actionPoints >= 0);
  assert.ok(enemyOf(f).actionPoints < enemyOf(f).maxActionPoints);
});

test("多次战术行动不推进世界，提交本场决战才推进一个战略日", () => {
  const f = fixture();
  const initialDay = f.world.military.day;
  const initialDate = structuredClone(f.world.date);
  order(f, 1, 1, "move");
  endTurn(f);
  assert.equal(f.world.military.day, initialDay);
  assert.deepEqual(f.world.date, initialDate);
  f.world = rules.finishManualBattle(
    f.content,
    f.world,
    f.battleId,
    f.player,
    true,
  );
  assert.equal(f.world.military.day, initialDay + 1);
  assert.equal(battleOf(f).phase, "resolved");
});

function schedulerFixture(options = {}) {
  const f = fixture({ ...options, startReady: false });
  for (const unit of battleOf(f).tactical.units)
    Object.assign(unit, { training: 50, morale: 50, actionProgress: 0 });
  f.content.tactics.strategies = [];
  return f;
}
function activeOf(f) {
  return battleOf(f).tactical.units.find(
    (u) => u.id === battleOf(f).tactical.activeUnitId,
  );
}
function finishActor(f) {
  const battle = battleOf(f);
  const nation =
    activeOf(f).side === "attacker" ? battle.attackerId : battle.defenderId;
  f.world = rules.endTacticalTurn(f.content, f.world, f.battleId, nation);
}
function near(actual, expected) {
  assert.ok(
    Math.abs(actual - expected) < 1e-8,
    `${actual} should equal ${expected}`,
  );
}

test("普通部队两AP、骑兵三AP，普通部队能移动一格再近战", () => {
  const f = fixture();
  assert.equal(unitOf(f).maxActionPoints, 2);
  assert.equal(unitOf(fixture({ type: "cavalry" })).maxActionPoints, 3);
  Object.assign(enemyOf(f), { x: 2, y: 1 });
  order(f, 1, 1, "move");
  assert.equal(unitOf(f).actionPoints, 1);
  const before = men(enemyOf(f));
  order(f, 2, 1, "melee");
  assert.equal(unitOf(f).actionPoints, 0);
  assert.ok(men(enemyOf(f)) < before);
});

test("行动条等速增长且大步推进停在首个满条，当前部队思考时所有条暂停", () => {
  const f = schedulerFixture();
  unitOf(f).actionProgress = 20;
  enemyOf(f).actionProgress = 60;
  advance(f, 0.1);
  near(unitOf(f).actionProgress, 30);
  near(enemyOf(f).actionProgress, 70);
  near(battleOf(f).tactical.clock, 0.1);
  assert.equal(battleOf(f).tactical.activeUnitId, null);
  advance(f, 99);
  near(unitOf(f).actionProgress, 60);
  near(enemyOf(f).actionProgress, 100);
  near(battleOf(f).tactical.clock, 0.4);
  assert.equal(battleOf(f).tactical.activeUnitId, f.enemyId);
  const before = structuredClone(f.world);
  advance(f, 99);
  assert.deepEqual(f.world, before);
});

test("同时满条以稳定部队ID裁决，处理同刻下一部队不额外走时", () => {
  const original = schedulerFixture({ unitCount: 2 });
  const own = battleOf(original).tactical.units.filter(
    (u) => u.side === unitOf(original).side,
  );
  for (const unit of own) unit.actionProgress = 100;
  const reversed = structuredClone(original);
  battleOf(reversed).tactical.units.reverse();
  const expected = own.map((u) => u.id).sort((a, b) => a.localeCompare(b));
  for (const f of [original, reversed]) {
    advance(f, 0);
    assert.equal(activeOf(f).id, expected[0]);
    assert.equal(battleOf(f).tactical.clock, 0);
    endTurn(f);
    advance(f, 0);
    assert.equal(activeOf(f).id, expected[1]);
    assert.equal(battleOf(f).tactical.clock, 0);
    assert.equal(
      battleOf(f).tactical.units.find((u) => u.id === expected[0])
        .actionProgress,
      0,
    );
  }
});

test("高主动性可在慢部队两次行动之间多次行动，预期序列与真实调度一致", () => {
  const f = schedulerFixture({ type: "cavalry" });
  f.content.units.find((u) => u.id === "cavalry").initiative = 300;
  f.content.units.find((u) => u.id === enemyOf(f).typeId).initiative = 100;
  const forecast = rules.tacticalForecast(f.content, battleOf(f), 12);
  assert.equal(forecast.length, 12);
  const actual = [];
  for (let i = 0; i < 12; i++) {
    advance(f);
    actual.push(activeOf(f).id);
    assert.equal(activeOf(f).id, forecast[i].unitId);
    near(battleOf(f).tactical.clock, forecast[i].at);
    finishActor(f);
  }
  assert.ok(actual.filter((id) => id === f.unitId).length >= 8);
  const slow = actual.flatMap((id, i) => (id === f.enemyId ? [i] : []));
  assert.ok(slow.length >= 2);
  assert.ok(
    slow[1] - slow[0] >= 3,
    "at least two fast activations occur between slow activations",
  );
});

test("训练和士气微调实际主动性、剩余时间与下一次满条时刻", () => {
  const f = schedulerFixture();
  Object.assign(unitOf(f), { training: 100, morale: 100 });
  Object.assign(enemyOf(f), { training: 0, morale: 20 });
  const high = rules
    .tacticalTimeline(f.content, battleOf(f))
    .find((u) => u.unitId === f.unitId);
  const low = rules
    .tacticalTimeline(f.content, battleOf(f))
    .find((u) => u.unitId === f.enemyId);
  assert.ok(high.initiative > 100 && high.initiative <= 120.000001);
  assert.ok(low.initiative < 100 && low.initiative >= 80);
  assert.ok(high.timeUntilAction < low.timeUntilAction);
  advance(f);
  assert.equal(activeOf(f).id, f.unitId);
  near(battleOf(f).tactical.clock, high.timeUntilAction);
  near(enemyOf(f).actionProgress, low.initiative * high.timeUntilAction);
  const currentClock = battleOf(f).tactical.clock;
  endTurn(f);
  unitOf(f).morale = 10;
  const before = rules
    .tacticalTimeline(f.content, battleOf(f))
    .find((u) => u.unitId === f.unitId);
  assert.ok(before.initiative < high.initiative);
  assert.ok(before.timeUntilAction > high.timeUntilAction);
  assert.equal(battleOf(f).tactical.clock, currentClock);
});

test("行动列表按剩余条动态排序而非ETA，未来预期另按实际主动性计算", () => {
  const f = schedulerFixture({ type: "cavalry" });
  f.content.units.find((u) => u.id === "cavalry").initiative = 300;
  Object.assign(unitOf(f), { actionProgress: 20 });
  Object.assign(enemyOf(f), { actionProgress: 70 });
  const before = structuredClone(f.world);
  let rows = rules.tacticalTimeline(f.content, battleOf(f));
  assert.equal(rows[0].unitId, f.enemyId);
  assert.equal(rows[0].remaining, 30);
  assert.equal(rows[1].remaining, 80);
  assert.ok(rows[1].timeUntilAction < rows[0].timeUntilAction);
  assert.equal(
    rules.tacticalForecast(f.content, battleOf(f), 1)[0].unitId,
    f.unitId,
  );
  assert.deepEqual(
    f.world,
    before,
    "queries cannot move time or consume statuses",
  );
  advance(f, 0.26);
  rows = rules.tacticalTimeline(f.content, battleOf(f));
  assert.equal(
    rows[0].unitId,
    f.unitId,
    "faster bar overtakes and moves upward without an activation",
  );
  assert.equal(battleOf(f).tactical.activeUnitId, null);
  advance(f);
  endTurn(f);
  rows = rules.tacticalTimeline(f.content, battleOf(f));
  assert.equal(
    rows.at(-1).unitId,
    f.unitId,
    "completed bar returns below the waiting regiment",
  );
});

test("查阅另一己方部队不能夺取当前主动权，AP和坚守只在自己开始行动时刷新", () => {
  const f = fixture();
  const other = addFriendly(f, 2, 3);
  other.actionPoints = 0;
  other.strategyUsed = true;
  other.guarding = true;
  other.actionProgress = 100;
  f.world = rules.selectTacticalUnit(f.world, f.battleId, other.id, f.player);
  const before = structuredClone(f.world);
  assert.throws(() => order(f, 3, 3, "move"));
  assert.deepEqual(f.world, before);
  assert.equal(battleOf(f).tactical.activeUnitId, f.unitId);
  endTurn(f);
  advance(f, 0);
  const refreshed = activeOf(f);
  assert.equal(refreshed.id, other.id);
  assert.equal(refreshed.actionPoints, refreshed.maxActionPoints);
  assert.equal(refreshed.guarding, false);
  assert.equal(refreshed.strategyUsed, false);
  assert.equal(unitOf(f).actionPoints, 0);
});

test("AI每步只执行一个命令，移动与攻击可分别播放且自动结束不吞掉下一条", () => {
  const f = fixture();
  f.content.tactics.strategies = [];
  Object.assign(unitOf(f), { x: 2, y: 1 });
  Object.assign(enemyOf(f), { x: 0, y: 1, actionProgress: 100 });
  endTurn(f);
  advance(f, 0);
  assert.equal(activeOf(f).id, f.enemyId);
  const beforeMen = men(unitOf(f));
  step(f);
  assert.equal(rules.hexDistance(unitOf(f), enemyOf(f)), 1);
  assert.equal(men(unitOf(f)), beforeMen, "movement step cannot also attack");
  assert.equal(enemyOf(f).actionPoints, 1);
  assert.equal(battleOf(f).tactical.lastAction.kind, "move");
  const moveSequence = battleOf(f).tactical.lastAction.sequence;
  step(f);
  assert.ok(men(unitOf(f)) < beforeMen);
  assert.equal(enemyOf(f).actionPoints, 0);
  assert.equal(battleOf(f).tactical.lastAction.sequence, moveSequence + 1);
  const stoppedClock = battleOf(f).tactical.clock;
  step(f);
  assert.equal(battleOf(f).tactical.activeUnitId, null);
  assert.equal(battleOf(f).tactical.clock, stoppedClock);
  assert.equal(
    unitOf(f).activationCount,
    1,
    "AI finish does not execute or activate another unit",
  );
});

test("动画路径为实际六邻最短合法路径，逐格费用等于AP扣除且避开占位和接敌穿越", () => {
  const f = fixture({ actionPoints: 8 });
  Object.assign(unitOf(f), { x: 0, y: 1 });
  Object.assign(enemyOf(f), { x: 4, y: 1 });
  addFriendly(f, 1, 1);
  const beforeWorld = structuredClone(f.world);
  const path = rules.tacticalMovementPath(
    f.content,
    battleOf(f),
    unitOf(f),
    3,
    1,
  );
  assert.deepEqual(f.world, beforeWorld);
  assert.deepEqual(path[0], { x: 0, y: 1, cost: 0 });
  assert.equal(tileKey(path.at(-1)), "3,1");
  assert.ok(path.length >= 4);
  const occupied = new Set(
    battleOf(f)
      .tactical.units.filter((u) => u.id !== f.unitId)
      .map(tileKey),
  );
  for (let i = 1; i < path.length; i++) {
    assert.equal(rules.hexDistance(path[i - 1], path[i]), 1);
    assert.ok(!occupied.has(tileKey(path[i])));
    if (i < path.length - 1)
      assert.ok(rules.hexDistance(path[i], enemyOf(f)) > 1);
  }
  const cost = path.reduce((sum, cell) => sum + cell.cost, 0);
  assert.equal(cost, query(f, "move").moves.get("3,1"));
  const before = unitOf(f).actionPoints;
  order(f, 3, 1, "move");
  assert.equal(unitOf(f).actionPoints, before - cost);
  assert.deepEqual(battleOf(f).tactical.lastAction.path, path);
  assert.deepEqual(
    rules.tacticalMovementPath(f.content, battleOf(f), unitOf(f), 5, 1),
    [],
  );
});

test("混编多单位完整战斗沿连续时钟完成，战中冻结世界、提交战果仅推进一日", () => {
  const f = schedulerFixture({ unitCount: 3 });
  const own = battleOf(f).tactical.units.filter(
    (u) => u.side === unitOf(f).side,
  );
  const templateEnemy = enemyOf(f);
  for (let i = 1; i < 3; i++)
    battleOf(f).tactical.units.push({
      ...structuredClone(templateEnemy),
      id: `enemy-${i}`,
      x: 9,
      y: i * 2,
    });
  const sides = [
    own,
    battleOf(f).tactical.units.filter((u) => u.side !== unitOf(f).side),
  ];
  for (const units of sides)
    units.forEach((unit, i) => {
      unit.typeId = ["infantry", "crossbow", "cavalry"][i];
      unit.y = i * 2 + 1;
      unit.training = 45 + i * 15;
      unit.morale = 70;
    });
  const startDay = f.world.military.day;
  const startDate = structuredClone(f.world.date);
  const seen = new Set();
  let commands = 0;
  for (
    ;
    commands < 2500 && battleOf(f).tactical.phase !== "finished";
    commands++
  ) {
    const actor = activeOf(f);
    if (!actor) {
      advance(f);
      continue;
    }
    seen.add(actor.id);
    if (
      actor.side !== unitOf(f).side ||
      actor.actionPoints <= 0 ||
      actor.morale <= 8 ||
      men(actor) <= 0
    ) {
      step(f);
      continue;
    }
    f.world = rules.selectTacticalUnit(f.world, f.battleId, actor.id, f.player);
    const b = battleOf(f);
    let chosen = false;
    for (const mode of ["shoot", "melee"]) {
      const actions = rules.tacticalActions(
        f.content,
        b,
        actor.id,
        mode,
        f.world,
      );
      const target = b.tactical.units.find((u) => actions.attacks.has(u.id));
      if (target) {
        order(f, target.x, target.y, mode);
        chosen = true;
        break;
      }
    }
    if (chosen) continue;
    const enemies = b.tactical.units.filter(
      (u) => u.side !== actor.side && men(u) > 0 && u.morale > 8,
    );
    const moves = [
      ...rules.tacticalActions(f.content, b, actor.id, "move", f.world).moves,
    ]
      .map(([key, cost]) => {
        const [x, y] = key.split(",").map(Number);
        return {
          x,
          y,
          cost,
          gap: Math.min(...enemies.map((u) => rules.hexDistance({ x, y }, u))),
        };
      })
      .sort((a, b) => a.gap - b.gap || a.cost - b.cost);
    if (moves[0]) order(f, moves[0].x, moves[0].y, "move");
    else order(f, actor.x, actor.y, "guard");
  }
  assert.ok(
    commands < 2500,
    "six mixed regiments must reach a natural outcome",
  );
  assert.equal(battleOf(f).tactical.phase, "finished");
  assert.equal(seen.size, 6, "each regiment received independent activations");
  assert.ok(battleOf(f).tactical.activation > 6);
  assert.equal(f.world.military.day, startDay);
  assert.deepEqual(f.world.date, startDate);
  f.world = rules.finishManualBattle(f.content, f.world, f.battleId, f.player);
  assert.equal(f.world.military.day, startDay + 1);
  assert.equal(battleOf(f).phase, "resolved");
});

test("频繁充条只复制战术分支，原世界及其他战役不受副作用", () => {
  const f = schedulerFixture();
  const source = f.world;
  source.military.battles.other = {
    ...structuredClone(battleOf(f)),
    id: "other",
  };
  const before = structuredClone(source);
  for (let i = 0; i < 5; i++) advance(f, 0.05);
  assert.deepEqual(source, before);
  assert.notEqual(f.world, source);
  assert.notEqual(
    battleOf(f).tactical,
    source.military.battles[f.battleId].tactical,
  );
  near(battleOf(f).tactical.clock, 0.25);
  near(unitOf(f).actionProgress, 25);
  for (const key of ["nations", "settlements", "research", "civic", "date"])
    assert.equal(
      f.world[key],
      source[key],
      `${key} is an unchanged shared branch`,
    );
  assert.equal(f.world.military.armies, source.military.armies);
  assert.equal(f.world.military.battles.other, source.military.battles.other);
  const nextSnapshot = structuredClone(f.world);
  assert.throws(() => advance(f, -1));
  assert.deepEqual(f.world, nextSnapshot);
  assert.deepEqual(source, before);
});

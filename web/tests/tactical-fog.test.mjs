import { atWar } from "./fixtures/war-world.mjs";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundle = await build({
  stdin: {
    contents: `
      export * from './src/simulation/military.ts';
      export * from './src/simulation/military-tactics.ts';
      export * from './src/simulation/state.ts';
      export * from './src/definitions/validate.ts';
      export * from './src/game/tactical-view.ts';
      export { TacticalBattle } from './src/game/TacticalBattle.tsx';
      export { TacticalTimeline } from './src/game/TacticalTimeline.tsx';
      export { TacticalEffects } from './src/game/TacticalEffects.tsx';
      export { createElement } from 'react';
      export { renderToStaticMarkup } from 'react-dom/server';
    `,
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  loader: { ".css": "empty" },
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(process.cwd() + '/package.json');",
  },
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

// Start a real prepared battle, then fix just positions and the current actor.
// Clear terrain effects by default so distance tests do not accidentally test LOS too.
function fixture() {
  const content = structuredClone(baseContent);
  Object.assign(content.tactics.visibility, {
    enabled: true,
    baseRange: 4,
    cavalryRange: 5,
    concealmentRange: 1,
    concealmentTerrains: [],
    blockingTerrains: [],
  });
  content.tactics.plainMoveCost = 1;
  content.tactics.roughMoveCost = 1;
  let world = atWar(rules.createWorld(content));
  world.playerNationId = "qi";
  const attacker = Object.values(world.military.armies).find(
    (army) => army.nationId === "qi",
  );
  const defender = Object.values(world.military.armies).find(
    (army) => army.nationId === "lu",
  );
  world = rules.startAttack(content, world, "qi", [attacker.id], "qufu");
  const battleId = Object.keys(world.military.battles)[0];
  world = rules.assignBattleDefenders(content, world, battleId, "lu", [
    defender.id,
  ]);
  for (let day = 0; day < content.warfare.preparationDays; day++)
    rules.tickMilitaryDay(content, world);
  world.military.battles[battleId].garrison = 0;
  world = rules.startManualBattle(content, world, battleId, "qi");
  const battle = world.military.battles[battleId];
  const unit = battle.tactical.units.find((item) => item.side === "attacker");
  const enemy = battle.tactical.units.find((item) => item.side === "defender");
  battle.tactical.units = [unit, enemy];
  Object.assign(unit, {
    x: 0,
    y: 1,
    typeId: "infantry",
    cadre: 100,
    levy: 900,
    actionPoints: 5,
    maxActionPoints: 5,
  });
  Object.assign(enemy, {
    x: 11,
    y: 7,
    typeId: "heavy_infantry",
    actionPoints: 2,
    maxActionPoints: 2,
  });
  Object.assign(battle.tactical, {
    phase: "combat",
    activeUnitId: unit.id,
    selectedId: unit.id,
    activeSide: "attacker",
    log: [],
    observedLog: { attacker: [], defender: [] },
  });
  return { content, world, battle, unit, enemy };
}
const sight = (f, side = "attacker") =>
  rules.tacticalVisibility(f.content, f.battle, side);
const visible = (f, unit = f.enemy, side = "attacker") =>
  rules.isTacticalUnitVisible(f.content, f.battle, unit, side);
const moves = (f) =>
  rules.tacticalActions(f.content, f.battle, f.unit.id, "move", f.world);
function addFriendly(f, x, y) {
  const scout = { ...structuredClone(f.unit), id: "friendly-scout", x, y };
  f.battle.tactical.units.push(scout);
  return scout;
}
function activate(f, unit) {
  Object.assign(f.battle.tactical, {
    activeUnitId: unit.id,
    activeSide: unit.side,
  });
  unit.actionPoints = unit.maxActionPoints;
}

test("旧内容补入默认迷雾规则，定义拒绝未知字段、非法距离与重复或未知地形", () => {
  const old = structuredClone(raw);
  delete old.tactics.visibility;
  const defaults = rules.validateContent(old).tactics.visibility;
  assert.deepEqual(defaults, {
    enabled: true,
    baseRange: 4,
    cavalryRange: 5,
    concealmentRange: 1,
    concealmentTerrains: ["forest", "hill"],
    blockingTerrains: ["forest", "hill"],
  });
  assert.equal(old.tactics.visibility, undefined, "校验不能修改输入内容包");
  for (const [key, value] of [
    ["enabled", "yes"],
    ["baseRange", 0],
    ["cavalryRange", 1.5],
    ["concealmentRange", 101],
    ["blockingTerrains", ["ocean"]],
    ["concealmentTerrains", ["forest", "forest"]],
    ["unknownRule", true],
  ]) {
    const pack = structuredClone(raw);
    pack.tactics.visibility[key] = value;
    assert.throws(() => rules.validateContent(pack), undefined, key);
  }
  for (const vision of [0, -1, 1.5, 101, "4"]) {
    const pack = structuredClone(raw);
    pack.units[0].vision = vision;
    assert.throws(
      () => rules.validateContent(pack),
      undefined,
      `units[].vision=${vision}`,
    );
  }
  const custom = structuredClone(raw);
  custom.units[0].vision = 7;
  assert.equal(rules.validateContent(custom).units[0].vision, 7);
});

test("共享视野按六角距离截断，兵种视野可覆盖步兵及骑兵默认值", () => {
  const f = fixture();
  assert.equal(rules.tacticalVisionRange(f.content, f.unit), 4);
  Object.assign(f.enemy, { x: 0, y: 5 });
  assert.equal(visible(f), true);
  assert.ok(sight(f).tiles.has("0,5"));
  f.enemy.y = 6;
  assert.equal(visible(f), false);
  f.unit.typeId = "cavalry";
  assert.equal(rules.tacticalVisionRange(f.content, f.unit), 5);
  assert.equal(visible(f), true);
  f.content.units.find((type) => type.id === "cavalry").vision = 2;
  assert.equal(rules.tacticalVisionRange(f.content, f.unit), 2);
  assert.equal(visible(f), false);
});

test("己方共享侦察，溃退或全灭部队不能提供视野；离开视野的敌军重新隐藏", () => {
  const f = fixture();
  assert.equal(visible(f), false);
  const scout = addFriendly(f, 10, 7);
  assert.equal(visible(f), true);
  assert.ok(sight(f).unitIds.has(scout.id));
  scout.morale = 8;
  assert.equal(visible(f), false);
  scout.morale = 70;
  scout.cadre = scout.levy = 0;
  assert.equal(visible(f), false);
  scout.cadre = 100;
  assert.equal(visible(f), true);
  scout.x = 0;
  assert.equal(visible(f), false);
});

test("林地和丘陵可隐蔽敌军，但相邻时必定发现", () => {
  for (const [terrain, x, y] of [
    ["forest", 3, 2],
    ["hill", 4, 1],
  ]) {
    const f = fixture();
    Object.assign(f.content.tactics.visibility, {
      concealmentTerrains: [terrain],
    });
    Object.assign(f.enemy, { x, y });
    Object.assign(f.unit, { x, y: y + 2 });
    assert.equal(rules.tacticalTerrain(f.content, f.battle, x, y), terrain);
    assert.equal(visible(f), false, terrain);
    f.unit.y = y + 1;
    assert.equal(visible(f), true, terrain);
    assert.ok(sight(f).tiles.has(`${x},${y}`));
  }
});

test("林丘阻挡越过它们的视线，公开地形不等于可发现其后的敌军", () => {
  for (const [terrain, x, startY, targetY] of [
    ["forest", 3, 0, 3],
    ["hill", 4, 0, 2],
  ]) {
    const f = fixture();
    Object.assign(f.unit, { x, y: startY });
    Object.assign(f.enemy, { x, y: targetY });
    assert.equal(visible(f), true);
    f.content.tactics.visibility.blockingTerrains = [terrain];
    assert.equal(visible(f), false, terrain);
    assert.equal(
      rules.tacticalTerrain(f.content, f.battle, x, targetY),
      "plain",
    );
  }
});

test("双方遵守相同的视野规则，当前可见结果是纯查询", () => {
  const f = fixture();
  const before = structuredClone(f.world);
  assert.equal(visible(f), false);
  assert.equal(visible(f, f.unit, "defender"), false);
  Object.assign(f.enemy, { x: 0, y: 2 });
  const adjacent = structuredClone(f.world);
  assert.equal(visible(f), true);
  assert.equal(visible(f, f.unit, "defender"), true);
  assert.deepEqual(f.world, adjacent);
  assert.equal(before.military.battles[f.battle.id].tactical.units[1].x, 11);
});

test("隐藏敌军的位置和控制区不改变可达预览与所示路径", () => {
  const f = fixture();
  f.content.tactics.visibility.baseRange = 1;
  Object.assign(f.enemy, { x: 0, y: 3 });
  assert.equal(visible(f), false);
  const hiddenMoves = moves(f);
  const hiddenPath = rules.tacticalMovementPath(
    f.content,
    f.battle,
    f.unit,
    0,
    4,
  );
  assert.ok(hiddenMoves.moves.has("0,3"), "隐藏占位不可成为探雷器");
  assert.ok(hiddenMoves.moves.has("0,4"), "隐藏控制区不可截断预览");
  Object.assign(f.enemy, { x: 11, y: 7 });
  assert.deepEqual(hiddenMoves, moves(f));
  assert.deepEqual(
    hiddenPath,
    rules.tacticalMovementPath(f.content, f.battle, f.unit, 0, 4),
  );
});

test("真实移动逐格侦察，突然接敌就停下且只支付实际走过的行动力", () => {
  const f = fixture();
  f.content.tactics.visibility.baseRange = 1;
  Object.assign(f.enemy, { x: 0, y: 3 });
  assert.ok(moves(f).moves.has("0,4"));
  rules.tacticalMove(f.content, f.battle, f.unit, 0, 4);
  assert.deepEqual({ x: f.unit.x, y: f.unit.y }, { x: 0, y: 2 });
  assert.equal(f.unit.actionPoints, 4);
  assert.equal(visible(f), true);
  assert.deepEqual(f.battle.tactical.lastAction.path, [
    { x: 0, y: 1, cost: 0 },
    { x: 0, y: 2, cost: 1 },
  ]);
  assert.equal(moves(f).engaged, true);
  assert.equal(moves(f).moves.size, 0);
});

test("隐藏占位使部署一步也未移动时，拒绝命令且不改坚守、AP、日志和动作序号", () => {
  const f = fixture();
  f.content.tactics.visibility.baseRange = 1;
  f.battle.tactical.phase = "deployment";
  f.unit.guarding = true;
  Object.assign(f.enemy, { x: 0, y: 5 });
  assert.equal(visible(f), false);
  assert.ok(moves(f).moves.has("0,5"));
  const before = structuredClone(f.world);
  assert.throws(
    () => rules.tacticalMove(f.content, f.battle, f.unit, 0, 5),
    /行进受阻/,
  );
  assert.deepEqual(f.world, before);
});

test("射程覆盖未发现敌军时也不能射击或施计，非法命令不扣费不消耗随机数", () => {
  const f = fixture();
  f.content.tactics.visibility.baseRange = 1;
  f.unit.typeId = "crossbow";
  f.content.units.find((type) => type.id === "crossbow").range = 5;
  Object.assign(f.enemy, { x: 0, y: 4 });
  const strategy = f.content.tactics.strategies.find(
    (item) => item.effect === "doubt",
  );
  strategy.range = 5;
  delete strategy.requires;
  assert.equal(visible(f), false);
  assert.equal(
    rules
      .tacticalActions(f.content, f.battle, f.unit.id, "shoot", f.world)
      .targets.has(f.enemy.id),
    false,
  );
  assert.equal(
    rules
      .tacticalActions(f.content, f.battle, f.unit.id, strategy.id, f.world)
      .targets.has(f.enemy.id),
    false,
  );
  const before = structuredClone(f.world);
  assert.throws(() =>
    rules.tacticalAttack(
      f.content,
      f.world,
      f.battle,
      f.unit,
      f.enemy,
      "shoot",
    ),
  );
  assert.throws(() =>
    rules.tacticalStrategy(
      f.content,
      f.world,
      f.battle,
      f.unit,
      f.enemy,
      strategy.id,
    ),
  );
  assert.deepEqual(f.world, before);
});

test("AI 没有发现敌军时搜索公开阵线，不因隐藏敌军改换坐标而改变决策", () => {
  const first = fixture();
  first.content.tactics.visibility.baseRange = 1;
  Object.assign(first.enemy, { x: 10, y: 3 });
  Object.assign(first.unit, { x: 0, y: 0 });
  activate(first, first.enemy);
  const second = structuredClone(first);
  second.unit.y = 7;
  assert.equal(visible(first, first.unit, "defender"), false);
  assert.equal(visible(second, second.unit, "defender"), false);
  rules.tacticalAutomationStep(
    first.content,
    first.world,
    first.battle,
    "attacker",
  );
  rules.tacticalAutomationStep(
    second.content,
    second.world,
    second.battle,
    "attacker",
  );
  assert.deepEqual(
    first.battle.tactical.lastAction,
    second.battle.tactical.lastAction,
  );
  assert.deepEqual(first.enemy, second.enemy);
  assert.equal(first.world.military.rng, second.world.military.rng);
  assert.equal(first.battle.tactical.lastAction.kind, "move");
  assert.ok(first.enemy.x < 10, "搜索应向对方公开阵线推进");
});

test("战报权限在事件发生时固定，之后发现敌军不补发旧的隐蔽行动", () => {
  const f = fixture();
  f.content.units.find((type) => type.id === "heavy_infantry").name =
    "秘密长戈军";
  activate(f, f.enemy);
  rules.tacticalHold(f.content, f.world, f.battle, f.enemy, "guard");
  assert.ok(f.battle.tactical.log.some((line) => line.includes("秘密长戈军")));
  assert.ok(
    f.battle.tactical.observedLog.defender.some((line) =>
      line.includes("秘密长戈军"),
    ),
  );
  assert.equal(
    f.battle.tactical.observedLog.attacker.some((line) =>
      line.includes("秘密长戈军"),
    ),
    false,
  );
  assert.deepEqual(f.battle.tactical.lastAction.visibleTo, ["defender"]);
  addFriendly(f, 10, 7);
  assert.equal(visible(f), true);
  assert.equal(
    rules
      .tacticalView(f.content, f.battle, "attacker")
      .log.some((line) => line.includes("秘密长戈军")),
    false,
  );
  activate(f, f.enemy);
  rules.tacticalHold(f.content, f.world, f.battle, f.enemy, "wait");
  assert.ok(
    rules
      .tacticalView(f.content, f.battle, "attacker")
      .log.some((line) => line.includes("秘密长戈军")),
  );
});

test("被挑衅的部队无法定位已经退出视野的施术者，不能追踪隐蔽坐标", () => {
  const first = fixture();
  Object.assign(first.enemy, { x: 10, y: 3 });
  first.enemy.statuses = [
    { kind: "provoke", remainingActivations: 1, sourceId: first.unit.id },
  ];
  activate(first, first.enemy);
  const second = structuredClone(first);
  second.unit.y = 7;
  const origin = { x: first.enemy.x, y: first.enemy.y };
  for (const f of [first, second]) {
    assert.equal(visible(f, f.unit, "defender"), false);
    rules.tacticalAutomationStep(f.content, f.world, f.battle, "attacker");
    assert.deepEqual({ x: f.enemy.x, y: f.enemy.y }, origin);
    assert.equal(f.battle.tactical.lastAction.kind, "skip");
    assert.equal(f.enemy.statuses.length, 0);
  }
  assert.deepEqual(
    first.battle.tactical.lastAction,
    second.battle.tactical.lastAction,
  );
});

test("隐蔽射手可借友军共享视野射击，受击方只收到自身伤亡而不知射手身份", () => {
  const f = fixture();
  f.content.tactics.visibility.baseRange = 1;
  f.content.units.find((type) => type.id === "crossbow").name = "隐蔽弩队";
  Object.assign(f.enemy, { x: 0, y: 4, typeId: "crossbow" });
  f.battle.tactical.units.push({
    ...structuredClone(f.enemy),
    id: "defender-scout",
    x: 1,
    y: 0,
    typeId: "infantry",
  });
  activate(f, f.enemy);
  assert.equal(visible(f), false);
  assert.equal(visible(f, f.unit, "defender"), true);
  const before = f.unit.cadre + f.unit.levy;
  rules.tacticalAttack(f.content, f.world, f.battle, f.enemy, f.unit, "shoot");
  assert.ok(f.unit.cadre + f.unit.levy < before);
  assert.ok(
    f.battle.tactical.observedLog.defender.some((line) =>
      line.includes("隐蔽弩队"),
    ),
  );
  assert.ok(
    f.battle.tactical.observedLog.attacker.some((line) =>
      line.includes("未发现敌军攻击"),
    ),
  );
  assert.equal(
    f.battle.tactical.observedLog.attacker.some((line) =>
      line.includes("隐蔽弩队"),
    ),
    false,
  );
});

test("可见部队的控制状态保留效果，但不携带未发现施术者的身份", () => {
  const f = fixture();
  f.enemy.id = "secret-source-id";
  f.unit.statuses = [
    { kind: "provoke", remainingActivations: 2, sourceId: f.enemy.id },
  ];
  const view = rules.tacticalView(f.content, f.battle, "attacker");
  assert.deepEqual(view.units.find((unit) => unit.id === f.unit.id).statuses, [
    { kind: "provoke", remainingActivations: 2 },
  ]);
  assert.equal(JSON.stringify(view).includes(f.enemy.id), false);
  assert.equal(
    f.unit.statuses[0].sourceId,
    f.enemy.id,
    "展示剥离不能修改实际控制来源",
  );
});

test("界面投影只包含可见部队、已发现兵力和已知单位预测，隐藏行动者不可定位", () => {
  const f = fixture();
  Object.assign(f.enemy, {
    id: "secret-regiment-id",
    cadre: 23456,
    levy: 54321,
    actionProgress: 99,
  });
  f.content.units.find((type) => type.id === "heavy_infantry").initiative =
    20000;
  activate(f, f.enemy);
  f.battle.tactical.selectedId = f.enemy.id;
  const view = rules.tacticalView(f.content, f.battle, "attacker");
  assert.deepEqual(
    view.units.map((unit) => unit.id),
    [f.unit.id],
  );
  assert.equal(view.active == null, true);
  assert.equal(view.selected == null, true);
  assert.deepEqual(view.men, { attacker: 1000, defender: 0 });
  assert.ok(view.timeline.every((entry) => entry.unitId === f.unit.id));
  assert.equal(
    view.forecast.length,
    6,
    "预测应从已知集合计算，而非过滤全知预测后留下空位",
  );
  assert.ok(view.forecast.every((entry) => entry.unitId === f.unit.id));
  assert.equal(JSON.stringify(view).includes(f.enemy.id), false);
  assert.equal(JSON.stringify(view).includes("23456"), false);
});

test("旧战斗没有观测日志时不回退到全知原始战报", () => {
  const f = fixture();
  delete f.battle.tactical.observedLog;
  f.battle.tactical.log = ["秘密长戈军移动到 L8，兵力 77777"];
  assert.deepEqual(rules.tacticalView(f.content, f.battle, "attacker").log, []);
});

test("移动动画仅用已走到的格子更新视野，不提前借用终点侦察敌军", () => {
  const f = fixture();
  f.content.tactics.visibility.baseRange = 1;
  Object.assign(f.enemy, { x: 0, y: 4 });
  const frame = {
    before: f.world,
    after: structuredClone(f.world),
    progress: 0.99,
    action: {
      sequence: 1,
      kind: "move",
      unitId: f.unit.id,
      path: [
        { x: 0, y: 1, cost: 0 },
        { x: 0, y: 2, cost: 1 },
        { x: 0, y: 3, cost: 1 },
      ],
    },
  };
  const before = structuredClone(f.world);
  const almostThere = rules.tacticalPlaybackSnapshot(f.battle, frame);
  assert.equal(
    rules
      .tacticalView(f.content, almostThere, "attacker")
      .units.some((unit) => unit.id === f.enemy.id),
    false,
  );
  frame.progress = 1;
  const arrived = rules.tacticalPlaybackSnapshot(f.battle, frame);
  assert.equal(
    rules
      .tacticalView(f.content, arrived, "attacker")
      .units.some((unit) => unit.id === f.enemy.id),
    true,
  );
  assert.deepEqual(f.world, before, "展示不能改动真实位置或规则状态");
});

test("敌军跨越迷雾边界时只播放两端均可见的路段，未见出发格不泄漏", () => {
  const f = fixture();
  f.content.tactics.visibility.baseRange = 1;
  Object.assign(f.enemy, { x: 0, y: 4 });
  const frame = {
    before: f.world,
    after: structuredClone(f.world),
    progress: 0.2,
    action: {
      sequence: 1,
      kind: "move",
      unitId: f.enemy.id,
      path: [
        { x: 0, y: 4, cost: 0 },
        { x: 0, y: 3, cost: 1 },
        { x: 0, y: 2, cost: 1 },
        { x: 1, y: 1, cost: 1 },
      ],
    },
  };
  assert.equal(
    rules.tacticalMovementVisible(f.content, f.battle, "attacker", frame),
    false,
  );
  frame.progress = 0.5;
  assert.equal(
    rules.tacticalMovementVisible(f.content, f.battle, "attacker", frame),
    false,
  );
  assert.equal(
    rules.tacticalActionObserved(f.content, f.battle, "attacker", frame),
    false,
  );
  frame.progress = 0.8;
  assert.equal(
    rules.tacticalMovementVisible(f.content, f.battle, "attacker", frame),
    true,
  );
  assert.equal(
    rules.tacticalActionObserved(f.content, f.battle, "attacker", frame),
    true,
  );
});

test("未发现射手的攻击只展示已知伤亡，不绘制暴露射手位置的箭迹", () => {
  const f = fixture();
  const after = structuredClone(f.world);
  after.military.battles[f.battle.id].tactical.units.find(
    (unit) => unit.id === f.unit.id,
  ).levy -= 10;
  const frame = {
    before: f.world,
    after,
    progress: 0.5,
    action: {
      sequence: 1,
      kind: "shoot",
      unitId: f.enemy.id,
      targetId: f.unit.id,
      visibleTo: ["defender"],
    },
  };
  assert.equal(
    rules.tacticalActionObserved(f.content, f.battle, "attacker", frame),
    false,
  );
  const html = rules.renderToStaticMarkup(
    rules.createElement(rules.TacticalEffects, {
      content: f.content,
      frame,
      battleId: f.battle.id,
      side: "attacker",
      columns: 12,
      rows: 8.5,
    }),
  );
  assert.match(html, /−10/);
  assert.doesNotMatch(html, /tactical-arrow|tactical-projectile|秘密长戈军/);
  f.content.tactics.visibility.enabled = false;
  frame.action.visibleTo = ["attacker", "defender"];
  const observed = rules.renderToStaticMarkup(
    rules.createElement(rules.TacticalEffects, {
      content: f.content,
      frame,
      battleId: f.battle.id,
      side: "attacker",
      columns: 12,
      rows: 8.5,
    }),
  );
  assert.match(
    observed,
    /tactical-projectile/,
    "可见攻击在同一动画时刻应有箭迹",
  );
});

test("真实战场与行动顺序 HTML 不泄漏隐藏敌军的名称、ID、兵力或行动格", () => {
  const f = fixture();
  f.content.units.find((type) => type.id === "heavy_infantry").name =
    "秘密长戈军";
  Object.assign(f.enemy, {
    id: "secret-regiment-id",
    cadre: 23456,
    levy: 54321,
  });
  activate(f, f.enemy);
  f.battle.tactical.selectedId = f.enemy.id;
  const previousDocument = globalThis.document;
  globalThis.document = { hidden: false };
  try {
    const html = rules.renderToStaticMarkup(
      rules.createElement(rules.TacticalBattle, {
        content: f.content,
        world: f.world,
        nationId: "qi",
        battle: f.battle,
        onWorld() {},
      }),
    );
    const timeline = rules.renderToStaticMarkup(
      rules.createElement(rules.TacticalTimeline, {
        content: f.content,
        battle: f.battle,
        side: "attacker",
        onClose() {},
        onInspect() {},
      }),
    );
    for (const output of [html, timeline]) {
      for (const secret of [
        "秘密长戈军",
        "secret-regiment-id",
        "23456",
        "54321",
        "77777",
        "77,777",
      ])
        assert.equal(output.includes(secret), false, secret);
    }
    assert.equal(
      timeline.includes("L8"),
      false,
      "行动顺序不可公开未知敌军的格位",
    );
    assert.match(html, /L8/, "地形格的公开坐标应继续可用");
    assert.match(html, /当前部队/);
    assert.match(
      html,
      /disabled=""[^>]*title="将当前行动或选中的部队移到视口中央"/,
    );
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

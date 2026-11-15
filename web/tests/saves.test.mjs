import { atWar } from "./fixtures/war-world.mjs";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
const bundle = await build({
  stdin: {
    contents: `export * from './src/platform/saves.ts'; export * from './src/simulation/state.ts'; export * from './src/definitions/validate.ts'; export * from './src/simulation/research.ts'; export * from './src/simulation/time.ts'; export * from './src/simulation/military.ts'; export * from './src/simulation/military-battles.ts'; export * from './src/simulation/military-tactics.ts';`,
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
      "warfare",
      "tactics",
    ].map(async (name) => [
      name,
      JSON.parse(await readFile(`public/content/base/${name}.json`, "utf8")),
    ]),
  ),
);
// Stable six-country fixture isolates rules from changes to the shipped historical starts.
raw.scenario = JSON.parse(
  await readFile("tests/fixtures/legacy-scenario.json", "utf8"),
);
const content = rules.validateContent(raw);
const save = (world = atWar(rules.createWorld(content))) => ({
  version: 7,
  savedAt: "2026-11-10T12:00:00.000Z",
  content: structuredClone(content),
  world,
});
function bad(mutator) {
  const s = save();
  mutator(s.world);
  assert.throws(() => rules.parseSave(JSON.stringify(s)), /存档字段无效/);
}

test("存档完整保留内容包、科研投入和世界状态，读回后可继续逐日模拟", () => {
  let world = atWar(rules.createWorld(content));
  const leader = Object.values(world.research.talents).find(
    (t) => t.nationId === "qi" && t.role === "research",
  );
  world = rules.startResearch(content, world, "qi", "iron_1", leader.id);
  world = rules.advanceDays(content, world, 65);
  const loaded = rules.parseSave(JSON.stringify(save(world)));
  assert.deepEqual(loaded.content, content);
  assert.deepEqual(loaded.world, world);
  const continued = rules.advanceDays(loaded.content, loaded.world, 1);
  assert.notDeepEqual(continued.date, world.date);
});
test("手动战斗的部队、回合与暂停状态可完整读回", () => {
  let world = atWar(rules.createWorld(content));
  const attacker = Object.values(world.military.armies).find(
    (a) => a.nationId === "qi",
  );
  const defender = Object.values(world.military.armies).find(
    (a) => a.nationId === "lu",
  );
  world = rules.startAttack(
    content,
    world,
    "qi",
    [attacker.id],
    defender.cityId,
  );
  for (let i = 0; i < content.warfare.preparationDays; i++)
    rules.tickMilitaryDay(content, world);
  const battle = Object.values(world.military.battles)[0];
  rules.beginTactical(content, world, battle);
  const loaded = rules.parseSave(JSON.stringify(save(world)));
  assert.equal(loaded.world.military.activeBattleId, battle.id);
  assert.deepEqual(
    loaded.world.military.battles[battle.id].tactical,
    battle.tactical,
  );
});

function tacticalSave() {
  let world = atWar(rules.createWorld(content));
  const attacker = Object.values(world.military.armies).find(
    (army) => army.nationId === "qi",
  );
  const defender = Object.values(world.military.armies).find(
    (army) => army.nationId === "lu",
  );
  world = rules.startAttack(
    content,
    world,
    "qi",
    [attacker.id],
    defender.cityId,
  );
  for (let day = 0; day < content.warfare.preparationDays; day++)
    rules.tickMilitaryDay(content, world);
  rules.beginTactical(content, world, Object.values(world.military.battles)[0]);
  return save(world);
}

test("战斗迷雾的双方战报与动作观测权限随存档保留", () => {
  const s = tacticalSave();
  const tactical = Object.values(s.world.military.battles)[0].tactical;
  tactical.observedLog = {
    attacker: ["己方步卒正在待机。"],
    defender: ["己方弩兵正在坚守。"],
  };
  tactical.lastAction = {
    sequence: 1,
    kind: "guard",
    unitId: tactical.units[0].id,
    visibleTo: ["attacker"],
  };
  const loaded = rules.parseSave(JSON.stringify(s));
  assert.deepEqual(loaded.world, s.world);
});

test("未记录观测战报时保持默认迷雾，不暴露全知日志", () => {
  const s = tacticalSave();
  const tactical = Object.values(s.world.military.battles)[0].tactical;
  delete s.content.tactics.visibility;
  delete tactical.observedLog;
  tactical.log = ["未侦察到的敌军秘密行动。"];
  tactical.lastAction = {
    sequence: 1,
    kind: "wait",
    unitId: tactical.units[0].id,
  };
  const loaded = rules.parseSave(JSON.stringify(s));
  assert.deepEqual(
    loaded.content.tactics.visibility,
    content.tactics.visibility,
  );
  assert.equal(
    Object.values(loaded.world.military.battles)[0].tactical.observedLog,
    undefined,
  );
});

test("存档拒绝伪造的迷雾日志结构与观测方", () => {
  for (const mutate of [
    (t) => {
      t.observedLog = { attacker: [], defender: [42] };
    },
    (t) => {
      t.observedLog = { attacker: [] };
    },
    (t) => {
      t.lastAction = {
        sequence: 1,
        kind: "wait",
        unitId: t.units[0].id,
        visibleTo: ["all"],
      };
    },
    (t) => {
      t.lastAction = {
        sequence: 1,
        kind: "wait",
        unitId: t.units[0].id,
        visibleTo: ["attacker", "attacker"],
      };
    },
  ]) {
    const s = tacticalSave();
    mutate(Object.values(s.world.military.battles)[0].tactical);
    assert.throws(() => rules.parseSave(JSON.stringify(s)), /存档字段无效/);
  }
});

test("当前存档保留行动条、时钟、已花费行动力与控制状态", () => {
  const s = tacticalSave();
  const tactical = Object.values(s.world.military.battles)[0].tactical;
  tactical.phase = "combat";
  const source = tactical.units.find((unit) => unit.side === "attacker");
  const target = tactical.units.find((unit) => unit.side === "defender");
  tactical.activeUnitId = source.id;
  tactical.activeSide = source.side;
  tactical.clock = 1.25;
  tactical.activation = 3;
  source.actionProgress = content.tactics.actionThreshold;
  source.activationCount = 2;
  target.actionProgress = 47.5;
  source.actionPoints = 1;
  tactical.lastAction = {
    sequence: 4,
    kind: "strategy",
    unitId: source.id,
    targetId: target.id,
    strategyId: "provoke",
  };
  source.strategyUsed = true;
  source.guarding = true;
  target.statuses = [
    { kind: "provoke", remainingActivations: 1, sourceId: source.id },
  ];
  const loaded = rules.parseSave(JSON.stringify(s));
  assert.equal(loaded.version, 7);
  assert.deepEqual(loaded.world, s.world);
  assert.deepEqual(loaded.content.tactics, s.content.tactics);
});

test("存档拒绝越界行动力、未知或重复控制状态、失效的挑衅来源", () => {
  for (const mutate of [
    (t) => {
      t.clock = -1;
    },
    (t) => {
      t.activation = 0.5;
    },
    (t) => {
      t.activeUnitId = "missing";
    },
    (t) => {
      t.units[0].actionProgress = -1;
    },
    (t) => {
      t.units[0].actionProgress = content.tactics.actionThreshold + 1;
    },
    (t) => {
      t.units[0].activationCount = -1;
    },
    (t) => {
      t.units[0].x = 12;
    },
    (t) => {
      t.units[0].y = 999;
    },
    (t) => {
      t.lastAction = {
        sequence: 1,
        kind: "move",
        unitId: t.units[0].id,
        path: [
          { x: 0, y: 0, cost: 0 },
          { x: 999, y: 0, cost: 1 },
        ],
      };
    },
    (t) => {
      t.lastAction = {
        sequence: 1,
        kind: "move",
        unitId: t.units[0].id,
        path: [],
      };
    },
    (t) => {
      t.lastAction = {
        sequence: 1,
        kind: "shoot",
        unitId: t.units[0].id,
        targetId: "missing",
      };
    },
    (t) => {
      t.units[0].actionPoints = t.units[0].maxActionPoints + 1;
    },
    (t) => {
      t.units[0].actionPoints = 1.5;
    },
    (t) => {
      delete t.activeSide;
    },
    (t) => {
      t.units[0].statuses = [{ kind: "magic", remainingActivations: 1 }];
    },
    (t) => {
      t.units[0].statuses = [{ kind: "doubt", remainingActivations: 0 }];
    },
    (t) => {
      t.units[0].statuses = [
        { kind: "doubt", remainingActivations: 1 },
        { kind: "doubt", remainingActivations: 2 },
      ];
    },
    (t) => {
      t.units[0].statuses = [
        { kind: "provoke", remainingActivations: 1, sourceId: "missing" },
      ];
    },
  ]) {
    const s = tacticalSave();
    mutate(Object.values(s.world.military.battles)[0].tactical);
    assert.throws(() => rules.parseSave(JSON.stringify(s)), /存档字段无效/);
  }
});

test("动作刚耗尽 AP 时保存，读档可结束该队并继续充条；结束快照也可读回", () => {
  const s = tacticalSave();
  const id = s.world.military.activeBattleId;
  s.world = rules.endTacticalTurn(content, s.world, id, "qi");
  s.world = rules.advanceTacticalTime(content, s.world, id, 100);
  const t = s.world.military.battles[id].tactical;
  const active = t.units.find((unit) => unit.id === t.activeUnitId);
  active.actionPoints = 0;
  active.acted = true;
  t.lastAction = { sequence: 1, kind: "wait", unitId: active.id };
  const loaded = rules.parseSave(JSON.stringify(s));
  const next = rules.stepTacticalAutomation(
    loaded.content,
    loaded.world,
    id,
    "qi",
  );
  assert.equal(next.military.battles[id].tactical.activeUnitId, null);
  assert.equal(
    next.military.battles[id].tactical.units.find(
      (unit) => unit.id === active.id,
    ).actionProgress,
    0,
  );
  s.world = next;
  s.world.military.battles[id].tactical.phase = "finished";
  s.world.military.battles[id].tactical.winner = "attacker";
  assert.deepEqual(rules.parseSave(JSON.stringify(s)).world, s.world);
});

test("战争规则由内容包保存，排队、返程与单位疲劳读回后不丢失", () => {
  let world = atWar(rules.createWorld(content));
  const army = Object.values(world.military.armies).find(
    (a) => a.nationId === "qi",
  );
  army.units[0].lastBattleDay = 0;
  const target = content.scenario.settlements.find((c) => c.owner === "lu");
  world = rules.startAttack(content, world, "qi", [army.id], target.id);
  const battle = Object.values(world.military.battles)[0];
  world = rules.withdrawBattle(content, world, battle.id, "qi");
  const loaded = rules.parseSave(JSON.stringify(save(world)));
  assert.deepEqual(loaded.world, world);
  assert.deepEqual(loaded.content.warfare, content.warfare);
  assert.equal(loaded.world.military.armies[army.id].status, "returning");
  assert.ok(
    loaded.world.military.armies[army.id].units[0].offensiveFatigue > 0,
  );
});

test("拒绝非法战争参数、疲劳与重复占用军团", () => {
  for (const [key, value] of [
    ["preparationDays", 0],
    ["queuedProgressCap", 1],
    ["expeditionUpkeepMultiplier", 0.5],
    ["maximumOffensiveFatigue", 1],
    ["fatigueRecoveryDays", -1],
  ]) {
    assert.throws(
      () =>
        rules.validateContent({
          ...raw,
          warfare: { ...content.warfare, [key]: value },
        }),
      /warfare/,
    );
  }
  bad(
    (w) => (Object.values(w.military.armies)[0].units[0].offensiveFatigue = 2),
  );
  bad((w) => (Object.values(w.military.armies)[0].status = "returning"));
  let world = atWar(rules.createWorld(content));
  const army = Object.values(world.military.armies).find(
    (a) => a.nationId === "qi",
  );
  const target = content.scenario.settlements.find((c) => c.owner === "lu");
  world = rules.startAttack(content, world, "qi", [army.id], target.id);
  const battle = Object.values(world.military.battles)[0];
  world.military.battles.duplicate = {
    ...battle,
    id: "duplicate",
    order: battle.order + 100,
  };
  assert.throws(
    () => rules.parseSave(JSON.stringify(save(world))),
    /存档字段无效/,
  );
});
test("拒绝缺失子系统、损坏数字、非法日期和越级建筑", () => {
  bad((w) => delete w.research.nations);
  bad((w) => (w.date.month = "1"));
  bad((w) => (w.nations.qi.operatingCoverage.research = null));
  bad((w) => (w.nations.qi.manpower = -1));
  bad((w) => (w.settlements.linzi.buildings.warehouse.effectiveLevel = 99));
  const invalid = save();
  invalid.world.nations.qi.treasury = 123456789;
  assert.throws(
    () =>
      rules.parseSave(
        JSON.stringify(invalid).replace(
          '"treasury":123456789',
          '"treasury":1e999',
        ),
      ),
    /存档字段无效/,
  );
});
test("拒绝未知引用与人才重复兼职", () => {
  bad((w) => (Object.values(w.military.armies)[0].cityId = "missing_city"));
  bad(
    (w) =>
      (Object.values(w.military.armies)[0].units[0].typeId = "missing_unit"),
  );
  bad(
    (w) =>
      (Object.values(w.military.armies)[0].generalId = Object.values(
        w.research.talents,
      ).find((t) => t.role === "advisor").id),
  );
  bad((w) => w.research.nations.qi.enacted.push("missing_idea"));
});
test("本地保存与载入共用校验，未保存时返回null", () => {
  const values = new Map();
  globalThis.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  assert.equal(rules.loadGame(), null);
  const world = atWar(rules.createWorld(content));
  rules.saveGame(content, world);
  assert.deepEqual(rules.loadGame().world, world);
  delete globalThis.localStorage;
});

test("只读取当前格式，导出与本地保存使用同一构造器", () => {
  const world = atWar(rules.createWorld(content));
  const exported = rules.createSave(content, world);
  assert.equal(exported.version, 7);
  assert.deepEqual(rules.parseSave(JSON.stringify(exported)).world, world);
  for (const version of [2, 3, 4, 5, 6, 8]) {
    assert.throws(
      () => rules.parseSave(JSON.stringify({ ...exported, version })),
      /不支持的存档格式/,
    );
  }
});

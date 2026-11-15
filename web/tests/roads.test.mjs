import { atWar } from "./fixtures/war-world.mjs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { containsPoint } from "../scripts/lib/map-geometry.mjs";

const bundle = await build({
  stdin: {
    contents: `
      export * from './src/definitions/roads.ts';
      export * from './src/definitions/validate.ts';
      export * from './src/simulation/geography.ts';
      export * from './src/simulation/state.ts';
      export * from './src/simulation/military-commands.ts';
      export * from './src/simulation/military-ai.ts';
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
const readJSON = async (file) => JSON.parse(await readFile(file, "utf8"));
const manifest = await readJSON("public/content/base/manifest.json");
const raw = Object.fromEntries(
  await Promise.all(
    Object.entries(manifest)
      .filter(([, file]) => typeof file === "string" && file.endsWith(".json"))
      .map(async ([name, file]) => [
        name,
        await readJSON(`public/content/base/${file}`),
      ]),
  ),
);
const content = rules.validateContent(raw);
const reachable = (cities, roads) => {
  const seen = new Set([cities[0].id]);
  for (let pass = 0; pass < cities.length; pass++)
    for (const road of roads) {
      if (seen.has(road.from)) seen.add(road.to);
      if (seen.has(road.to)) seen.add(road.from);
    }
  return seen;
};

test("双剧本道路连接全部96城，共享可编辑路网，绕行点避开湖海", async () => {
  const later = await readJSON("public/content/base/warring-states.json");
  assert.deepEqual(content.scenario.roads, later.roads);
  const roads = rules.scenarioRoads(content.scenario);
  assert.equal(reachable(content.scenario.settlements, roads).size, 96);
  const cities = new Map(
    content.scenario.settlements.map((city) => [city.id, city]),
  );
  const mask = await readJSON("map-source/land-mask.json");
  const rings = (path) =>
    path
      .split("M")
      .filter(Boolean)
      .map((ring) =>
        ring
          .replace(/Z$/, "")
          .split("L")
          .map((point) => point.split(",").map(Number)),
      );
  const land = rings(mask.landPath),
    water = rings(mask.waterPath);
  const inside = (polygons, point) =>
    polygons.filter((polygon) => containsPoint(polygon, point)).length % 2 ===
    1;
  for (const road of roads) {
    const points = [
      cities.get(road.from).map,
      ...(road.via ?? []),
      cities.get(road.to).map,
    ];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
      const steps = Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) / 2);
      for (let step = 0; step <= steps; step++) {
        const t = step / Math.max(1, steps);
        const p = [a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t];
        assert.ok(
          inside(land, p) && !inside(water, p),
          `${road.from}—${road.to} 不能穿湖海`,
        );
      }
    }
  }
});

test("道路定义拒绝悬空、重复、自环和无效绕行点；反向道路连同绕行点规范化", () => {
  const ids = new Set(["a", "b"]);
  for (const roads of [
    [{ from: "a", to: "missing" }],
    [{ from: "a", to: "a" }],
    [
      { from: "a", to: "b" },
      { from: "b", to: "a" },
    ],
    [{ from: "a", to: "b", via: [{ x: Infinity, y: 4 }] }],
    [{ from: "a", to: "b", via: [{ x: 4, y: -1 }] }],
  ])
    assert.throws(() => rules.validateRoads(roads, ids));
  assert.deepEqual(
    rules.validateRoads(
      [
        {
          from: "b",
          to: "a",
          via: [
            { x: 5, y: 6 },
            { x: 1, y: 2 },
          ],
        },
      ],
      ids,
    ),
    [
      {
        from: "a",
        to: "b",
        via: [
          { x: 1, y: 2 },
          { x: 5, y: 6 },
        ],
      },
    ],
  );
});

test("旧内容缺道路得到稳定连通近邻图，显式空路网不会擅自连路", () => {
  const legacy = structuredClone(content.scenario);
  delete legacy.roads;
  const roads = rules.scenarioRoads(legacy);
  assert.equal(
    reachable(legacy.settlements, roads).size,
    legacy.settlements.length,
  );
  legacy.settlements.reverse();
  assert.deepEqual(rules.scenarioRoads(structuredClone(legacy)), roads);
  assert.deepEqual(rules.scenarioRoads({ ...legacy, roads: [] }), []);
});

const frontierContent = {
  ...content,
  scenario: {
    ...content.scenario,
    roads: [
      { from: "linzi", to: "qufu" },
      { from: "qufu", to: "ying" },
    ],
  },
};

test("进攻只允许当前国土直接接壤目标，夺取和失去连接城立即改变边界", () => {
  const world = atWar(rules.createWorld(frontierContent));
  assert.ok(rules.canAttackCity(frontierContent, world, "qi", "qufu"));
  assert.equal(
    rules.canAttackCity(frontierContent, world, "qi", "ying"),
    false,
  );
  assert.equal(
    rules.canAttackCity(frontierContent, world, "qi", "linzi"),
    false,
  );
  assert.equal(
    rules.canAttackCity(frontierContent, world, "missing", "qufu"),
    false,
  );
  world.settlements.qufu.owner = "qi";
  assert.ok(rules.canAttackCity(frontierContent, world, "qi", "ying"));
  world.settlements.qufu.owner = "lu";
  world.settlements.linzi.owner = "lu";
  assert.equal(
    rules.canAttackCity(frontierContent, world, "qi", "qufu"),
    false,
  );
});

test("军令底层拒绝越界进攻，旧调动入口同样不能绕过；拒绝不改变世界", () => {
  const world = atWar(rules.createWorld(frontierContent));
  const army = Object.values(world.military.armies).find(
    (item) => item.nationId === "qi",
  );
  const before = JSON.stringify(world);
  assert.throws(
    () => rules.startAttack(frontierContent, world, "qi", [army.id], "ying"),
    /相邻/,
  );
  assert.throws(
    () => rules.marchArmy(frontierContent, world, "qi", army.id, "ying"),
    /相邻/,
  );
  assert.equal(JSON.stringify(world), before);
  const next = rules.startAttack(
    frontierContent,
    world,
    "qi",
    [army.id],
    "qufu",
  );
  assert.equal(Object.values(next.military.battles)[0].cityId, "qufu");
});

test("非险恶关系即使接壤也不是进攻目标", () => {
  const world = atWar(rules.createWorld(frontierContent));
  const relation = world.diplomacy.relations.find(
    (r) => r.nations.includes("qi") && r.nations.includes("lu"),
  );
  for (const value of [-100, -1, 0, 20, 99, 100, 200]) {
    relation.value = value;
    assert.equal(
      rules.canAttackCity(frontierContent, world, "qi", "qufu"),
      false,
    );
  }
  relation.value = -101;
  assert.ok(rules.canAttackCity(frontierContent, world, "qi", "qufu"));
});

test("AI 使用同一邻接规则，孤立路网不会产生远征", () => {
  const prepare = () => {
    const world = atWar(rules.createWorld(frontierContent));
    world.playerNationId = "zhou";
    world.date.day = 10;
    world.military.day = 40;
    for (const army of Object.values(world.military.armies)) {
      if (!army.units.length) continue;
      while (army.units.length < 4) {
        const unit = structuredClone(army.units[0]);
        unit.id = `test-${army.id}-${army.units.length}`;
        army.units.push(unit);
      }
      for (const unit of army.units) {
        unit.levy = 1000;
        unit.morale = 100;
      }
    }
    return world;
  };
  const world = prepare();
  rules.tickMilitaryAI(frontierContent, world);
  const campaigns = Object.values(world.military.battles);
  assert.ok(campaigns.length > 0);
  for (const battle of campaigns)
    assert.ok(
      rules.canAttackCity(
        frontierContent,
        world,
        battle.attackerId,
        battle.cityId,
      ),
    );
  const isolated = prepare();
  rules.tickMilitaryAI(
    {
      ...frontierContent,
      scenario: { ...frontierContent.scenario, roads: [] },
    },
    isolated,
  );
  assert.equal(Object.keys(isolated.military.battles).length, 0);
});

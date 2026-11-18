import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundle = await build({
  stdin: {
    contents: `
      export * from './src/simulation/diplomacy.ts';
      export * from './src/simulation/state.ts';
      export * from './src/definitions/validate.ts';
      export * from './src/platform/saves.ts';
      export * from './src/simulation/research.ts';
      export * from './src/simulation/time.ts';
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
const content = rules.validateContent(
  Object.fromEntries(
    await Promise.all(
      Object.entries(manifest)
        .filter(
          ([, file]) => typeof file === "string" && file.endsWith(".json"),
        )
        .map(async ([key, file]) => [
          key,
          JSON.parse(await readFile(`public/content/base/${file}`, "utf8")),
        ]),
    ),
  ),
);
const load = (world, version = rules.SAVE_VERSION) =>
  rules.parseSave(
    JSON.stringify({
      version,
      savedAt: "2026-11-15T12:00:00.000Z",
      content,
      world,
    }),
  );
const value = (world, a = "qi", b = "lu") =>
  rules.relationValue(content, world, a, b);
const missionWorld = () => {
  let world = rules.createWorld(content);
  const talent = Object.values(world.research.talents).find(
    (t) => t.nationId === "qi" && t.recruitedMonth !== null,
  );
  world = rules.assignTalent(world, "qi", talent.id, "envoy");
  return rules.startDiplomaticMission(
    content,
    world,
    "qi",
    "lu",
    "gift",
    talent.id,
  );
};

test("新局全部关系20且对称，当前存档保留全国家关系", () => {
  const world = rules.createWorld(content);
  const restored = load(world);
  assert.equal(restored.version, 10);
  assert.deepEqual(restored.world, world);
  for (const nation of content.scenario.nations) {
    assert.equal(
      rules.diplomaticRelation(content, world, "qi", nation.id),
      nation.id === "qi" ? "self" : "friendly",
    );
    if (nation.id !== "qi") assert.equal(value(world, "qi", nation.id), 20);
  }
  rules.changeRelation(content, world, "qi", "lu", -150);
  assert.equal(value(load(world).world, "lu", "qi"), -130);
});

test("当前存档必须提供完整外交状态", () => {
  const world = rules.createWorld(content);
  delete world.diplomacy;
  assert.throws(() => load(world), /diplomacy/);
  world.diplomacy = { relations: [] };
  assert.throws(() => load(world), /diplomacy/);
});

test("出使中途保存保留占用与余日，读取后只结算一次", () => {
  let world = missionWorld();
  const envoyId = world.diplomacy.missions[0].envoyId;
  world = rules.advanceDays(content, world, 12);
  assert.equal(world.diplomacy.missions[0].remainingDays, 18);
  const restored = load(world).world;
  assert.deepEqual(restored, world);
  assert.equal(restored.research.talents[envoyId].busy, true);
  world = rules.advanceDays(content, restored, 18);
  assert.equal(value(world), 70);
  assert.equal(world.diplomacy.missions.length, 0);
  assert.equal(world.research.talents[envoyId].busy, false);
  world = rules.advanceDays(content, load(world).world, 2);
  assert.equal(value(world), 70);
});

test("存档拒绝缺失/重复关系、越界值和未知国家", () => {
  for (const mutate of [
    (d) => d.relations.pop(),
    (d) =>
      d.relations.push({
        ...d.relations[0],
        nations: [...d.relations[0].nations].reverse(),
      }),
    (d) => (d.relations[0].value = 201),
    (d) => (d.relations[0].value = -200.5),
    (d) => (d.relations[0].nations[0] = "missing"),
    (d) => (d.relations[0].nations[0] = d.relations[0].nations[1]),
  ]) {
    const world = rules.createWorld(content);
    mutate(world.diplomacy);
    assert.throws(() => load(world), /diplomacy/);
  }
});

test("存档拒绝任务重复占用、非法人选、任务计时与失效引用", () => {
  for (const mutate of [
    (w) => w.diplomacy.missions.push({ ...w.diplomacy.missions[0] }),
    (w) => (w.diplomacy.missions[0].remainingDays = 31),
    (w) => (w.diplomacy.missions[0].remainingDays = 0),
    (w) => (w.diplomacy.missions[0].actionId = "missing"),
    (w) => (w.diplomacy.missions[0].targetNationId = "missing"),
    (w) => (w.diplomacy.missions[0].envoyId = "missing"),
    (w) => (w.diplomacy.nextId = 1),
    (w) => (w.research.talents[w.diplomacy.missions[0].envoyId].busy = false),
    (w) =>
      (w.research.talents[w.diplomacy.missions[0].envoyId].role = "advisor"),
    (w) => (w.diplomacy.missions = []),
  ]) {
    const world = missionWorld();
    mutate(world);
    assert.throws(() => load(world), /diplomacy/);
  }
});

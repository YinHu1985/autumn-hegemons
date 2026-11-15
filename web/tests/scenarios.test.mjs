import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundle = await build({
  stdin: {
    contents: `
      export * from './src/definitions/scenarios.ts';
      export * from './src/definitions/load.ts';
      export * from './src/definitions/validate.ts';
      export * from './src/simulation/state.ts';
      export * from './src/simulation/time.ts';
      export * from './src/simulation/military.ts';
      export * from './src/simulation/economy.ts';
      export * from './src/platform/saves.ts';
      export * from './src/platform/validate-save.ts';
    `,
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  define: { "import.meta.env.BASE_URL": JSON.stringify("/autumn-hegemons/") },
});
const rules = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);
const root = "public/content/base/";
const readJSON = async (name) =>
  JSON.parse(await readFile(root + name, "utf8"));
const manifest = await readJSON("manifest.json");
const catalogue = rules.parseScenarioCatalogue(
  await readJSON("scenarios.json"),
);
const contentNames = Object.keys(manifest).filter(
  (key) => typeof manifest[key] === "string" && manifest[key].endsWith(".json"),
);
const raw = Object.fromEntries(
  await Promise.all(
    contentNames.map(async (key) => [key, await readJSON(manifest[key])]),
  ),
);
const starts = await Promise.all(
  catalogue.entries.map(async (entry) =>
    rules.validateContent({ ...raw, scenario: await readJSON(entry.file) }),
  ),
);
const base = starts.find(
  (content) => content.scenario.id === catalogue.defaultScenario,
);
const builtins = starts.map((content) => content.scenario);
const sortedGeometry = (scenario) =>
  scenario.settlements
    .map(({ id, map }) => ({ id, map }))
    .sort((a, b) => a.id.localeCompare(b.id));
const saveText = (content, world) =>
  JSON.stringify({
    version: 7,
    savedAt: "2026-11-15T12:00:00.000Z",
    content,
    world,
  });

test("两个时代各有 80–100 城，共用城市 ID 与坐标，所有诸侯都可开局", () => {
  assert.equal(starts.length, 2);
  assert.ok(base);
  assert.deepEqual(sortedGeometry(builtins[0]), sortedGeometry(builtins[1]));
  for (const content of starts) {
    const { scenario } = content;
    assert.ok(
      scenario.settlements.length >= 80 && scenario.settlements.length <= 100,
    );
    assert.equal(
      new Set(scenario.settlements.map((city) => city.id)).size,
      scenario.settlements.length,
    );
    assert.equal(
      new Set(scenario.settlements.map((city) => `${city.map.x},${city.map.y}`))
        .size,
      scenario.settlements.length,
    );
    assert.ok(scenario.recommendedNations.length > 0);
    for (const nation of scenario.nations) {
      assert.ok(
        scenario.settlements.some((city) => city.owner === nation.id),
        `${scenario.id}/${nation.id} must own a city`,
      );
      const world = rules.createWorld(content);
      world.playerNationId = nation.id;
      assert.equal(
        rules.validateSavedWorld(world, content).playerNationId,
        nation.id,
      );
      assert.ok(
        Object.values(world.military.armies).some(
          (army) => army.nationId === nation.id,
        ),
      );
    }
  }
});

test("春秋保留晋与诸小国，战国体现韩赵魏，剧本归属互不污染", () => {
  const [early, late] = [...starts].sort(
    (a, b) => a.scenario.start.year - b.scenario.start.year,
  );
  assert.ok(early.scenario.start.year < -700);
  assert.ok(late.scenario.start.year > -500 && late.scenario.start.year < -300);
  assert.ok(early.scenario.nations.some((nation) => nation.name === "晋"));
  for (const name of ["韩", "赵", "魏"])
    assert.ok(late.scenario.nations.some((nation) => nation.name === name));
  assert.ok(early.scenario.nations.length > late.scenario.nations.length);
  const before = structuredClone(starts);
  const a = rules.createWorld(early),
    b = rules.createWorld(late);
  const changed = early.scenario.settlements.find(
    (city) => b.settlements[city.id].owner !== city.owner,
  );
  assert.ok(changed, "the era switch must change territorial ownership");
  assert.equal(a.settlements[changed.id].owner, changed.owner);
  a.settlements[changed.id].owner = "test-unrelated-owner";
  assert.equal(
    b.settlements[changed.id].owner,
    late.scenario.settlements.find((city) => city.id === changed.id).owner,
  );
  assert.deepEqual(starts, before);
});

test("v7 存档保留剧本元数据、年代和任选国家，再读回仍对应原剧本", () => {
  for (const content of starts) {
    const world = rules.createWorld(content);
    world.playerNationId = content.scenario.nations.at(-1).id;
    const loaded = rules.parseSave(saveText(content, world));
    assert.equal(loaded.version, 7);
    assert.deepEqual(loaded.content.scenario, content.scenario);
    assert.deepEqual(loaded.world.date, content.scenario.start);
    assert.equal(loaded.world.playerNationId, world.playerNationId);
    assert.deepEqual(loaded.world.settlements, world.settlements);
  }
});

test("剧本目录拒绝重复 ID、越界路径、未知默认项，推荐国家必须属于该剧本", () => {
  for (const mutate of [
    (value) => value.entries.push(structuredClone(value.entries[0])),
    (value) => {
      value.entries[0].file = "../scenario.json";
    },
    (value) => {
      value.entries[0].file = "https://example.invalid/scenario.json";
    },
    (value) => {
      value.defaultScenario = "missing";
    },
  ]) {
    const invalid = structuredClone(catalogue);
    mutate(invalid);
    assert.throws(() => rules.parseScenarioCatalogue(invalid), /剧本目录/);
  }
  for (const recommendations of [["missing"], ["qi", "qi"], [1]]) {
    const invalid = structuredClone(base);
    invalid.scenario.recommendedNations = recommendations;
    assert.throws(() => rules.validateContent(invalid), /推荐国家/);
  }
  const legacy = structuredClone(base);
  for (const key of ["id", "name", "description", "recommendedNations"])
    delete legacy.scenario[key];
  assert.doesNotThrow(() => rules.validateContent(legacy));
});

test("内容相同沿用内置选项，规则或剧本被修改时保留自定义选项且不改原件", () => {
  const before = structuredClone({ base, builtins });
  assert.deepEqual(
    rules.setupScenarios(base, builtins, structuredClone(base)),
    builtins,
  );
  for (const mutate of [
    (value) => {
      value.scenario.settlements[0].scale += 1;
    },
    (value) => {
      value.buildings[0].levels[0].cost += 5;
    },
  ]) {
    const modified = structuredClone(base);
    mutate(modified);
    const original = structuredClone(modified);
    const options = rules.setupScenarios(base, builtins, modified);
    assert.equal(options.length, builtins.length + 1);
    assert.equal(options.at(-1).id, "custom-current");
    assert.equal(modified.scenario.id, base.scenario.id);
    assert.deepEqual(options.at(-1).settlements, modified.scenario.settlements);
    assert.deepEqual(modified, original);
  }
  assert.deepEqual({ base, builtins }, before);
});

const fileNames = [
  ...new Set([
    "manifest.json",
    "scenarios.json",
    ...contentNames.map((key) => manifest[key]),
    ...catalogue.entries.map((entry) => entry.file),
  ]),
];
const files = new Map(
  await Promise.all(
    fileNames.map(async (file) => [file, await readFile(root + file, "utf8")]),
  ),
);
function mockFiles(t, overrides = {}) {
  const requested = [];
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = String(input);
    requested.push(url);
    assert.ok(url.startsWith("/autumn-hegemons/content/base/"), url);
    const file = url.slice("/autumn-hegemons/content/base/".length);
    const text = Object.hasOwn(overrides, file)
      ? overrides[file]
      : files.get(file);
    return new Response(text ?? "Not found", {
      status: text === undefined || text === null ? 404 : 200,
    });
  });
  return requested;
}

test("Pages 加载器读取两剧本并按目录默认项生成 content 与可编辑文本", async (t) => {
  const alternate = catalogue.entries.find(
    (entry) => entry.id !== catalogue.defaultScenario,
  );
  const changed = { ...catalogue, defaultScenario: alternate.id };
  const requested = mockFiles(t, { "scenarios.json": JSON.stringify(changed) });
  const loaded = await rules.loadBaseContent();
  assert.deepEqual(loaded.scenarios, builtins);
  assert.equal(loaded.content.scenario.id, alternate.id);
  assert.deepEqual(JSON.parse(loaded.texts.scenario), loaded.content.scenario);
  for (const entry of catalogue.entries)
    assert.equal(
      requested.filter((url) => url.endsWith(`/${entry.file}`)).length,
      1,
    );
});

test("缺失备用剧本时加载明确失败，避免显示无法开始的剧本", async (t) => {
  const alternate = catalogue.entries.find(
    (entry) => entry.file !== manifest.scenario,
  );
  mockFiles(t, { [alternate.file]: null });
  await assert.rejects(rules.loadBaseContent(), /无法读取剧本.*404/);
});

test("目录与实际剧本 ID 不符时拒绝加载", async (t) => {
  const alternate = catalogue.entries.find(
    (entry) => entry.file !== manifest.scenario,
  );
  const invalid = JSON.parse(files.get(alternate.file));
  invalid.id = "wrong-era";
  mockFiles(t, { [alternate.file]: JSON.stringify(invalid) });
  await assert.rejects(rules.loadBaseContent(), /ID 与目录不符/);
});

function finiteNumbers(value) {
  if (typeof value === "number") assert.ok(Number.isFinite(value));
  else if (value && typeof value === "object")
    for (const child of Object.values(value)) finiteNumbers(child);
}
const dayNumber = ({ year, month, day }) => year * 360 + (month - 1) * 30 + day;

for (const content of starts) {
  const cityCount = (id) =>
    content.scenario.settlements.filter((city) => city.owner === id).length;
  const small = [...content.scenario.nations]
    .filter((nation) => nation.id !== "qi")
    .sort((a, b) => cityCount(a.id) - cityCount(b.id))[0];
  for (const player of ["qi", small.id]) {
    test(`${content.scenario.name}：${player} 连续 360 日经营战争与每月存读无异常`, () => {
      let world = rules.createWorld(content);
      world.playerNationId = player;
      const start = dayNumber(world.date);
      let decisions = 0,
        months = 0;
      while (dayNumber(world.date) - start < 360) {
        const pending = Object.values(world.military.battles).find(
          (battle) =>
            battle.phase === "ready" &&
            [battle.attackerId, battle.defenderId].includes(player),
        );
        const before = dayNumber(world.date);
        if (pending) {
          world = rules.resolveBattleNow(content, world, pending.id, player);
          decisions++;
        } else world = rules.advanceDays(content, world, 1);
        assert.ok(
          dayNumber(world.date) > before,
          "pending battle must not stall the year",
        );
        if (world.date.day === 1) {
          const loaded = rules.parseSave(saveText(content, world));
          assert.deepEqual(loaded.world, world);
          world = loaded.world;
          for (const nation of content.scenario.nations)
            finiteNumbers(rules.calculateEconomy(content, world, nation.id));
          months++;
        }
      }
      assert.ok(months >= 12);
      assert.equal(dayNumber(world.date) - start, 360);
      assert.doesNotThrow(() => rules.validateSavedWorld(world, content));
      assert.ok(decisions < 360);
    });
  }
}

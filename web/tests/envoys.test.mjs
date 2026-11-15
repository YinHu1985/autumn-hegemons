import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundle = await build({
  stdin: {
    contents: `
      export * from './src/simulation/research.ts';
      export * from './src/simulation/research-state.ts';
      export * from './src/simulation/state.ts';
      export * from './src/simulation/diplomacy.ts';
      export * from './src/definitions/validate.ts';
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
        .map(async ([name, file]) => [
          name,
          JSON.parse(await readFile(`public/content/base/${file}`, "utf8")),
        ]),
    ),
  ),
);
const advisorId = (world) =>
  Object.values(world.research.talents).find(
    (talent) => talent.nationId === "qi" && talent.role === "advisor",
  ).id;

test("使者与其他职务共用人才池，未招募或外国人才不能调任", () => {
  const world = rules.createWorld(content);
  const id = advisorId(world);
  const next = rules.assignTalent(world, "qi", id, "envoy");
  assert.equal(world.research.talents[id].role, "advisor");
  assert.equal(next.research.talents[id].role, "envoy");
  assert.equal(
    rules.assignTalent(next, "qi", id, "general").research.talents[id].role,
    "general",
  );
  const candidate = Object.values(world.research.talents).find(
    (talent) => talent.nationId === "qi" && talent.recruitedMonth === null,
  );
  assert.throws(
    () => rules.assignTalent(world, "qi", candidate.id, "envoy"),
    /招募/,
  );
  assert.throws(() => rules.assignTalent(world, "lu", id, "envoy"), /招募/);
  assert.throws(
    () => rules.assignTalent(world, "qi", id, "unknown"),
    /未知人才职务/,
  );
});

test("出使期间不能改任，取消任务后使者重新空闲", () => {
  let world = rules.createWorld(content);
  const id = advisorId(world);
  world = rules.assignTalent(world, "qi", id, "envoy");
  world = rules.startDiplomaticMission(content, world, "qi", "lu", "gift", id);
  assert.equal(world.research.talents[id].busy, true);
  assert.throws(
    () => rules.assignTalent(world, "qi", id, "advisor"),
    /执行任务/,
  );
  world = rules.cancelDiplomaticMission(
    world,
    "qi",
    world.diplomacy.missions[0].id,
  );
  assert.equal(world.research.talents[id].busy, false);
  assert.equal(
    rules.assignTalent(world, "qi", id, "advisor").research.talents[id].role,
    "advisor",
  );
});

test("任务中使者谢世在同次月结清理外交引用，不结算未完成的关系效果", () => {
  let world = rules.createWorld(content);
  const id = advisorId(world);
  world = rules.assignTalent(world, "qi", id, "envoy");
  world = rules.startDiplomaticMission(
    content,
    world,
    "qi",
    "lu",
    "denounce",
    id,
  );
  const month = rules.absoluteMonth(world.date);
  // Avoid candidate refresh rolls; only this veteran is eligible for a death roll.
  for (const state of Object.values(world.research.nations))
    state.lastRefresh = month;
  world.research.talents[id].recruitedMonth = month - 240;
  world.research.seed = 1972;
  rules.tickResearchMonth(content, world);
  assert.equal(world.research.talents[id], undefined);
  assert.equal(world.diplomacy.missions.length, 0);
  assert.equal(
    rules.relationValue(content, world, "qi", "lu"),
    content.diplomacy.center,
  );
  assert.ok(
    world.research.nations.qi.notices.some((notice) => notice.includes("谢世")),
  );
});

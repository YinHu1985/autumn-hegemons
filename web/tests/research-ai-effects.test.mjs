import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundle = await build({
  stdin: {
    contents: `export * from './src/definitions/validate.ts'; export * from './src/simulation/state.ts'; export * from './src/simulation/research-ai.ts'; export * from './src/simulation/events/index.ts'; export * from './src/simulation/modifier-clock.ts';`,
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
      .filter(([key]) => key !== "version")
      .map(async ([key, filename]) => [
        key,
        JSON.parse(await readFile(`public/content/base/${filename}`, "utf8")),
      ]),
  ),
);

function setup() {
  const data = structuredClone(raw);
  const idea = data.ideas[0];
  idea.enactEffects = [
    { type: "grain", amount: 100 },
    { type: "manpower", amount: 120 },
    { type: "governance", amount: 0.05 },
    { type: "add_modifier", modifierId: "visiting_scholars", durationDays: 90 },
    { type: "set_flag", flagId: "ai_reform_started", value: true },
    { type: "schedule_event", eventId: "ai_reform_report", delayDays: 2 },
  ];
  data.events.push({
    id: "ai_reform_report",
    title: "改革回报",
    description: "后续报告。",
    weight: 1,
    duration: 30,
    triggers: [],
    options: [
      {
        id: "receive",
        label: "收悉",
        description: "获得5粮食。",
        effects: [{ type: "grain", amount: 5 }],
      },
    ],
  });
  const content = rules.validateContent(data);
  const world = rules.createWorld(content);
  world.playerNationId = "qi";
  for (const nation of Object.values(world.nations)) nation.treasury = 0;
  for (const nationId of ["qi", "lu", "qin"]) {
    world.research.nations[nationId].unlockedIdeas = [idea.id];
    world.nations[nationId].manpower = 0;
    for (const city of Object.values(world.settlements))
      if (city.owner === nationId) city.governance = 0.4;
  }
  return { content, world, ideaId: idea.id };
}

test("AI挂载理念完整提交局部收益、持续效果、标记及后续事件，其他国家提交不会覆盖它", () => {
  const { content, world, ideaId } = setup();
  rules.tickResearchAI(content, world, "qi");
  for (const nationId of ["lu", "qin"]) {
    assert.ok(world.research.nations[nationId].enacted.includes(ideaId));
    assert.equal(world.nations[nationId].manpower, 120);
    assert.ok(
      Object.values(world.settlements)
        .filter((city) => city.owner === nationId)
        .every((city) => city.governance === 0.45),
    );
    assert.equal(
      world.modifiers.instances.filter(
        (effect) =>
          effect.definitionId === "visiting_scholars" &&
          effect.target.id === nationId,
      ).length,
      1,
    );
    assert.equal(
      rules.getEventFlag(world, { nationId }, "ai_reform_started"),
      true,
    );
    assert.equal(
      world.civic.scheduled.filter(
        (event) =>
          event.definitionId === "ai_reform_report" &&
          event.context.nationId === nationId,
      ).length,
      1,
    );
    // The grain reward is visible immediately to subsequent AI decisions: hire and start two teams.
    assert.equal(world.nations[nationId].treasury, 90);
    assert.equal(world.research.nations[nationId].groups.length, 2);
    assert.equal(
      new Set(
        world.research.nations[nationId].groups.map((group) => group.leaderId),
      ).size,
      2,
    );
  }
  assert.deepEqual(world.research.nations.qi.enacted, []);
  assert.equal(world.nations.qi.manpower, 0);
  assert.equal(world.modifiers.instances.length, 2);
  assert.equal(world.civic.scheduled.length, 2);
});

test("AI后续事件实际可结算，后续科研决策不重复执行理念一次性动作", () => {
  const { content, world } = setup();
  rules.tickResearchAI(content, world, "qi");
  const scheduledIds = world.civic.scheduled.map((event) => event.id);
  const modifiers = structuredClone(world.modifiers);
  rules.tickResearchAI(content, world, "qi");
  assert.deepEqual(
    world.civic.scheduled.map((event) => event.id),
    scheduledIds,
  );
  assert.deepEqual(world.modifiers, modifiers);
  world.date = rules.dateFromGameDay(rules.gameDay(world.date) + 2);
  rules.tickEventsDay(content, world);
  rules.resolveAIEvents(content, world);
  assert.equal(world.civic.scheduled.length, 0);
  assert.equal(world.civic.events.length, 0);
  for (const nationId of ["lu", "qin"]) {
    assert.equal(world.nations[nationId].treasury, 95);
    assert.equal(world.nations[nationId].manpower, 120);
    assert.equal(
      world.civic.history.filter(
        (event) =>
          event.definitionId === "ai_reform_report" &&
          event.nationId === nationId &&
          event.status === "resolved",
      ).length,
      1,
    );
  }
});

import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { atWar } from "./fixtures/war-world.mjs";

const bundle = await build({
  stdin: {
    contents: [
      "simulation/state",
      "simulation/events/index",
      "simulation/time",
      "simulation/research",
      "simulation/commands",
      "simulation/diplomacy",
      "simulation/military",
      "simulation/military-battles",
      "simulation/modifier-clock",
      "definitions/validate",
      "platform/saves",
    ]
      .map((name) => `export * from './src/${name}.ts';`)
      .join("\n"),
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
      .map(async ([key, file]) => [
        key,
        JSON.parse(await readFile(`public/content/base/${file}`, "utf8")),
      ]),
  ),
);
raw.scenario = JSON.parse(
  await readFile("tests/fixtures/legacy-scenario.json", "utf8"),
);
const base = rules.validateContent(raw);
const event = (id, extra = {}) => ({
  id,
  title: id,
  description: "测试事实触发",
  weight: 1,
  duration: 30,
  triggers: [],
  options: [{ id: "ok", label: "收悉", description: "记录", effects: [] }],
  ...extra,
});
function setup(events) {
  const content = {
    ...structuredClone(base),
    events,
    eventPools: [{ id: "test_pool", name: "测试池", chance: 1 }],
  };
  const world = rules.createWorld(content);
  world.playerNationId = "qi";
  return { content, world };
}
const count = (world, eventId, nationId = "qi") =>
  world.civic.occurrences[rules.occurrenceKey(eventId, "nation", { nationId })]
    ?.count ?? 0;
const load = (content, world) =>
  rules.parseSave(JSON.stringify(rules.createSave(content, world))).world;

test("research completion facts see the committed technology and only fire once", () => {
  let { content, world } = setup([
    event("new_metal", {
      triggers: [
        { type: "fact", fact: "research_completed", subjectId: "iron_1" },
      ],
      condition: { type: "technology", technologyId: "iron_1" },
    }),
  ]);
  const leaderId = Object.values(world.research.talents).find(
    (entry) => entry.nationId === "qi" && entry.role === "research",
  ).id;
  world = rules.startResearch(content, world, "qi", "iron_1", leaderId);
  const research = world.research.nations.qi;
  research.progress.iron_1 =
    content.technologies.find((entry) => entry.id === "iron_1").cost - 0.001;
  research.groups[0].fundedInvestment = 5;
  world.date.day = 30;
  world = rules.advanceDays(content, world, 1);
  assert.ok(world.research.nations.qi.unlocked.includes("iron_1"));
  assert.equal(count(world, "new_metal"), 1);
  const active = world.civic.events.find(
    (entry) => entry.definitionId === "new_metal",
  );
  assert.equal(active.createdAt, rules.gameDay(world.date));
  world = rules.chooseEvent(content, world, active.id, "ok");
  world = rules.advanceDays(content, load(content, world), 30);
  assert.equal(count(world, "new_metal"), 1);
});

test("completed construction triggers on the actual city after its building commits", () => {
  let { content, world } = setup([
    event("new_workshop", {
      triggers: [
        { type: "fact", fact: "construction_completed", subjectId: "bowyer" },
      ],
      target: {
        kind: "settlement",
        condition: {
          type: "building",
          buildingId: "bowyer",
          compare: "gte",
          value: 1,
        },
      },
    }),
  ]);
  world.research.nations.qi.unlocked.push("bows_1");
  world = rules.startConstruction(content, world, "linzi", "bowyer");
  world.settlements.linzi.construction.remainingDays = 1;
  world = rules.advanceDays(content, world, 1);
  assert.equal(world.settlements.linzi.buildings.bowyer.level, 1);
  const active = world.civic.events.find(
    (entry) => entry.definitionId === "new_workshop",
  );
  assert.equal(active.context.settlementId, "linzi");
  world = rules.chooseEvent(content, world, active.id, "ok");
  world = rules.advanceDays(content, world, 2);
  assert.equal(count(world, "new_workshop"), 1);
});

test("battle resolution emits capture and battle facts after ownership changes, never on a second resolution", () => {
  let { content, world } = setup([
    event("captured", {
      triggers: [{ type: "fact", fact: "settlement_captured" }],
      target: { kind: "settlement" },
      condition: {
        type: "metric",
        metric: "settlement.governance",
        compare: "eq",
        value: 0.25,
      },
    }),
    event("battle_done", {
      triggers: [{ type: "fact", fact: "battle_resolved" }],
    }),
  ]);
  world = atWar(world);
  const armyId = Object.values(world.military.armies).find(
    (entry) => entry.nationId === "qi",
  ).id;
  world = rules.startAttack(content, world, "qi", [armyId], "qufu");
  const battle = Object.values(world.military.battles).at(-1);
  for (let day = 0; day < content.warfare.preparationDays; day++)
    rules.tickMilitaryDay(content, world);
  assert.equal(battle.phase, "ready");
  rules.finishBattle(content, world, battle, "attacker", false);
  rules.flushEventFacts(content, world);
  assert.equal(world.settlements.qufu.owner, "qi");
  assert.equal(
    world.civic.events.find((entry) => entry.definitionId === "captured")
      .context.settlementId,
    "qufu",
  );
  assert.equal(count(world, "captured"), 1);
  assert.equal(count(world, "battle_done"), 1);
  assert.equal(count(world, "battle_done", "lu"), 1);
  const before = structuredClone(world.civic);
  rules.finishBattle(content, world, battle, "defender", true);
  rules.flushEventFacts(content, world);
  assert.deepEqual(world.civic, before);
});

test("a completed diplomatic task binds the correct country and sees the updated relation", () => {
  let { content, world } = setup([
    event("gift_received", {
      triggers: [
        { type: "fact", fact: "diplomacy_completed", subjectId: "gift" },
      ],
      target: { kind: "related_nation" },
      condition: { type: "relation", compare: "gte", value: 70 },
    }),
  ]);
  const talentId = Object.values(world.research.talents).find(
    (entry) =>
      entry.nationId === "qi" && entry.recruitedMonth !== null && !entry.busy,
  ).id;
  world = rules.assignTalent(world, "qi", talentId, "envoy");
  world = rules.startDiplomaticMission(
    content,
    world,
    "qi",
    "lu",
    "gift",
    talentId,
  );
  world = rules.advanceDays(
    content,
    world,
    content.diplomacy.actions.find((entry) => entry.id === "gift").days,
  );
  const active = world.civic.events.find(
    (entry) => entry.definitionId === "gift_received",
  );
  assert.deepEqual(active.context, { nationId: "qi", relatedNationId: "lu" });
  assert.equal(world.diplomacy.missions.length, 0);
  assert.equal(world.research.talents[talentId].busy, false);
  world = rules.chooseEvent(content, world, active.id, "ok");
  world = rules.advanceDays(content, load(content, world), 2);
  assert.equal(count(world, "gift_received"), 1);
});

test("a monthly event with a one-day decision window stays available on the first displayed day", () => {
  const { content, world } = setup([
    event("short_report", {
      duration: 1,
      triggers: [{ type: "random", poolId: "test_pool" }],
    }),
  ]);
  world.date.day = 30;
  const next = rules.advanceDays(content, world, 1);
  const active = next.civic.events.find((entry) => entry.nationId === "qi");
  assert.ok(active);
  assert.equal(rules.eventDaysLeft(next, active), 1);
  assert.equal(active.createdAt, rules.gameDay(next.date));
  assert.equal(
    next.civic.history.filter((entry) => entry.nationId === "qi").length,
    0,
  );
});

test("an important monthly report stops a multi-day advance at its creation date", () => {
  const { content, world } = setup([
    event("important_report", {
      presentation: { important: true },
      triggers: [{ type: "random", poolId: "test_pool" }],
    }),
  ]);
  world.date.day = 29;
  const next = rules.advanceDays(content, world, 30);
  assert.equal(rules.gameDay(next.date) - rules.gameDay(world.date), 2);
  assert.equal(next.date.day, 1);
  assert.ok(next.civic.events.some((entry) => entry.nationId === "qi"));
});

test("save validation rejects forged event clocks, duplicate IDs, flags and occurrence records", () => {
  const { content, world } = setup([event("saved"), event("followup")]);
  rules.createEventInstance(content, world, "saved", { nationId: "qi" });
  rules.scheduleEvent(world, { nationId: "qi" }, "followup", 3, 2, 6);
  rules.setEventFlag(world, { nationId: "qi" }, "ready", true);
  assert.deepEqual(load(content, world), world);
  const mutations = [
    (state) => state.events.push(structuredClone(state.events[0])),
    (state) => (state.events[0].expiresAt = state.events[0].createdAt),
    (state) => (state.events[0].nationId = "lu"),
    (state) => (state.scheduled[0].retryDays = 0),
    (state) => (state.scheduled[0].dueAt = state.scheduled[0].retryUntil + 1),
    (state) => (state.flags['["nation","missing","ready"]'] = true),
    (state) => (state.flags['["world","world","ready"]'] = true),
    (state) => (Object.values(state.occurrences)[0].count = -1),
    (state) =>
      (Object.values(state.occurrences)[0].lastAt =
        rules.gameDay(world.date) + 1),
  ];
  for (const mutate of mutations) {
    const altered = structuredClone(world);
    mutate(altered.civic);
    assert.throws(() => load(content, altered), /civic/);
  }
});

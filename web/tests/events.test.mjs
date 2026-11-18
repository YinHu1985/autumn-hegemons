import { test, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const temp = await mkdtemp(join(tmpdir(), "spring-events-"));
after(() => rm(temp, { recursive: true, force: true }));
const { outputFiles } = await build({
  stdin: {
    contents: [
      "simulation/events/index",
      "simulation/conditions",
      "simulation/state",
      "simulation/effects",
      "simulation/modifier-clock",
      "definitions/validate",
      "platform/saves",
    ]
      .map((name) => `export * from './src/${name}.ts';`)
      .join("\n"),
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const modulePath = join(temp, "rules.mjs");
await writeFile(modulePath, outputFiles[0].text);
const rules = await import(pathToFileURL(modulePath).href);
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
const base = rules.validateContent(raw);
const option = (id = "accept", effects = [], extra = {}) => ({
  id,
  label: id,
  description: "测试选项",
  effects,
  ...extra,
});
const event = (id = "test_event", extra = {}) => ({
  id,
  title: "{{nation}}纪事",
  description: "发生于{{settlement}}",
  weight: 1,
  duration: 30,
  triggers: [],
  options: [option()],
  ...extra,
});
const setup = (events, extra = {}) => {
  const content = {
    ...structuredClone(base),
    events,
    eventPools: [{ id: "test_pool", name: "测试池", chance: 1 }],
    ...extra,
  };
  const world = rules.createWorld(content);
  world.playerNationId = "qi";
  return { content, world };
};
const ownCity = (world, nationId = "qi") =>
  Object.values(world.settlements).find((city) => city.owner === nationId).id;
const jump = (world, days) => {
  world.date = rules.dateFromGameDay(rules.gameDay(world.date) + days);
};

test("an event binds one eligible city, and inspection never rerolls it", () => {
  const definition = event("city", {
    target: {
      kind: "settlement",
      condition: {
        type: "metric",
        metric: "settlement.scale",
        compare: "gte",
        value: 1,
      },
    },
  });
  const { content, world } = setup([definition]);
  const active = rules.createEventInstance(content, world, "city", {
    nationId: "qi",
  });
  assert.ok(active.context.settlementId);
  const before = JSON.stringify(world);
  for (let index = 0; index < 3; index++) {
    assert.ok(
      rules.getEventOptionStatus(content, world, active, definition.options[0])
        .available,
    );
    assert.ok(
      rules
        .renderEventText(content, world, active, definition.description)
        .includes(
          content.scenario.settlements.find(
            (entry) => entry.id === active.context.settlementId,
          ).name,
        ),
    );
  }
  assert.equal(JSON.stringify(world), before);
});

test("costs are checked in full, and a rejected decision cannot spend or advance RNG", () => {
  const definition = event("cost", {
    options: [
      option("decline"),
      option("pay", [{ type: "grain", amount: 500 }], { cost: { grain: 100 } }),
    ],
  });
  const { content, world } = setup([definition]);
  world.nations.qi.treasury = 20;
  const active = rules.createEventInstance(content, world, "cost", {
    nationId: "qi",
  });
  const before = JSON.stringify(world);
  assert.equal(
    rules.getEventOptionStatus(content, world, active, definition.options[1])
      .available,
    false,
  );
  assert.throws(
    () => rules.chooseEvent(content, world, active.id, "pay"),
    /粮食不足/,
  );
  assert.equal(JSON.stringify(world), before);
});

test("spending and effects are atomic even if a later effect fails", () => {
  const { content, world } = setup([
    event("atomic", {
      options: [
        option("decline"),
        option(
          "pay",
          [
            { type: "grain", amount: 200 },
            { type: "add_modifier", modifierId: "missing_definition" },
          ],
          { cost: { grain: 10 } },
        ),
      ],
    }),
  ]);
  const active = rules.createEventInstance(content, world, "atomic", {
    nationId: "qi",
  });
  const before = JSON.stringify(world);
  assert.throws(() => rules.chooseEvent(content, world, active.id, "pay"));
  assert.equal(JSON.stringify(world), before);
});

test("a choice requires its recipient and cannot be repeated; receipts include actual payment", () => {
  const { content, world } = setup([
    event("one_choice", {
      options: [
        option("decline"),
        option("pay", [{ type: "grain", amount: 8 }], { cost: { grain: 10 } }),
      ],
    }),
  ]);
  const active = rules.createEventInstance(content, world, "one_choice", {
    nationId: "qi",
  });
  assert.throws(
    () => rules.chooseEvent(content, world, active.id, "pay", "lu"),
    /其他国家/,
  );
  const chosen = rules.chooseEvent(content, world, active.id, "pay");
  assert.equal(chosen.nations.qi.treasury, world.nations.qi.treasury - 2);
  assert.equal(chosen.civic.history[0].results[0].type, "cost_grain");
  assert.equal(
    chosen.civic.history[0].results[0].before -
      chosen.civic.history[0].results[0].after,
    10,
  );
  assert.throws(
    () => rules.chooseEvent(content, chosen, active.id, "pay"),
    /已处理/,
  );
});

test("deadline is absolute game time and resolves exactly the first choice", () => {
  const { content, world } = setup([
    event("timeout", {
      duration: 3,
      options: [
        option("first", [{ type: "grain", amount: 10 }]),
        option("second", [{ type: "grain", amount: 99 }], { aiWeight: 1000 }),
      ],
    }),
  ]);
  const active = rules.createEventInstance(content, world, "timeout", {
    nationId: "qi",
  });
  const treasury = world.nations.qi.treasury;
  for (let index = 0; index < 3; index++) rules.tickEventsDay(content, world);
  assert.equal(rules.eventDaysLeft(world, active), 3);
  jump(world, 2);
  rules.tickEventsDay(content, world);
  assert.equal(world.civic.events.length, 1);
  jump(world, 1);
  rules.tickEventsDay(content, world);
  assert.equal(world.civic.events.length, 0);
  assert.equal(world.nations.qi.treasury, treasury + 10);
  assert.equal(world.civic.history[0].optionId, "first");
});

test("a lost bound city cancels instead of silently moving the benefit", () => {
  const { content, world } = setup([
    event("bound", {
      target: { kind: "settlement" },
      options: [option("reward", [{ type: "grain", amount: 100 }])],
    }),
  ]);
  const active = rules.createEventInstance(content, world, "bound", {
    nationId: "qi",
  });
  world.settlements[active.context.settlementId].owner = "lu";
  const treasury = world.nations.qi.treasury;
  rules.tickEventsDay(content, world);
  assert.equal(world.civic.events.length, 0);
  assert.equal(world.civic.history[0].status, "cancelled");
  assert.match(world.civic.history[0].reason, /不属于/);
  assert.equal(world.nations.qi.treasury, treasury);
});

test("a malformed local event cannot turn its local effect into a nationwide reward", () => {
  const definition = event("local_governance", {
    target: { kind: "settlement" },
    options: [option("reward", [{ type: "governance", amount: 0.1 }])],
  });
  const { content, world } = setup([definition]);
  const active = rules.createEventInstance(content, world, definition.id, {
    nationId: "qi",
  });
  delete active.context.settlementId;
  const before = structuredClone(world);
  assert.equal(
    rules.getEventOptionStatus(content, world, active, definition.options[0])
      .available,
    false,
  );
  assert.throws(
    () => rules.chooseEvent(content, world, active.id, "reward"),
    /必须绑定.*城镇/,
  );
  assert.deepEqual(world, before);
});

test("once/cooldown keys separate countries and cities, with durable counts beyond history", () => {
  const definition = event("once", {
    target: { kind: "settlement" },
    repeat: { scope: "settlement", once: true },
  });
  let { content, world } = setup([definition]);
  const qiCities = Object.values(world.settlements).filter(
    (city) => city.owner === "qi",
  );
  assert.ok(qiCities.length > 1);
  const first = rules.createEventInstance(content, world, "once", {
    nationId: "qi",
    settlementId: qiCities[0].id,
  });
  world = rules.chooseEvent(content, world, first.id, "accept");
  world.civic.history = [];
  assert.equal(
    rules.createEventInstance(content, world, "once", {
      nationId: "qi",
      settlementId: qiCities[0].id,
    }),
    undefined,
  );
  assert.ok(
    rules.createEventInstance(content, world, "once", {
      nationId: "qi",
      settlementId: qiCities[1].id,
    }),
  );
  assert.ok(
    rules.createEventInstance(content, world, "once", {
      nationId: "lu",
      settlementId: ownCity(world, "lu"),
    }),
  );
  assert.equal(
    world.civic.occurrences[
      rules.occurrenceKey("once", "world", { nationId: "qi" })
    ].count,
    3,
  );
});

test("cooldowns and shared group cooldowns gate creation until their expiry", () => {
  const definitions = ["a", "b"].map((id) =>
    event(id, {
      repeat: {
        scope: "nation",
        cooldownDays: 8,
        group: "reforms",
        groupCooldownDays: 5,
      },
    }),
  );
  let { content, world } = setup(definitions);
  const active = rules.createEventInstance(content, world, "a", {
    nationId: "qi",
  });
  world = rules.chooseEvent(content, world, active.id, "accept");
  assert.equal(
    rules.createEventInstance(content, world, "b", { nationId: "qi" }),
    undefined,
  );
  jump(world, 5);
  assert.ok(rules.createEventInstance(content, world, "b", { nationId: "qi" }));
  assert.equal(
    rules.createEventInstance(content, world, "a", { nationId: "qi" }),
    undefined,
  );
  jump(world, 5);
  assert.ok(rules.createEventInstance(content, world, "a", { nationId: "qi" }));
});

test("each random pool issues at most one event per nation independent of content count", () => {
  const definitions = Array.from({ length: 80 }, (_, index) =>
    event(`random_${index}`, {
      triggers: [{ type: "random", poolId: "test_pool" }],
    }),
  );
  const { content, world } = setup(definitions);
  rules.tickEventsMonth(content, world);
  for (const nationId of Object.keys(world.nations))
    assert.ok(
      world.civic.events.filter((entry) => entry.nationId === nationId)
        .length <= 1,
    );
  assert.equal(
    world.civic.events.filter((entry) => entry.nationId === "qi").length,
    1,
  );
});

test("different same-day city facts both trigger; extra fact objects are not dependencies", () => {
  const { content, world } = setup([
    event("city_fact", {
      target: { kind: "settlement" },
      triggers: [
        {
          type: "fact",
          fact: "construction_completed",
          subjectId: "warehouse",
        },
      ],
    }),
    event("victory", { triggers: [{ type: "fact", fact: "battle_resolved" }] }),
  ]);
  const cities = Object.values(world.settlements).filter(
    (city) => city.owner === "qi",
  );
  for (const city of cities.slice(0, 2))
    rules.emitEventFact(world, {
      type: "construction_completed",
      nationId: "qi",
      settlementId: city.id,
      subjectId: "warehouse",
    });
  rules.emitEventFact(world, {
    type: "battle_resolved",
    nationId: "qi",
    relatedNationId: "missing",
    settlementId: "foreign",
    talentId: "dead",
  });
  rules.flushEventFacts(content, world);
  assert.equal(
    world.civic.events.filter((entry) => entry.definitionId === "city_fact")
      .length,
    2,
  );
  assert.deepEqual(
    world.civic.events.find((entry) => entry.definitionId === "victory")
      .context,
    { nationId: "qi" },
  );
  assert.equal(world.civic.facts.length, 0);
});

test("a winner's national event still fires after the opposing country loses its last city", () => {
  const { content, world } = setup([
    event("victory", { triggers: [{ type: "fact", fact: "battle_resolved" }] }),
  ]);
  const enemyCity = ownCity(world, "lu");
  for (const city of Object.values(world.settlements))
    if (city.owner === "lu") city.owner = "qi";
  rules.emitEventFact(world, {
    type: "battle_resolved",
    nationId: "qi",
    relatedNationId: "lu",
    settlementId: enemyCity,
    outcome: "victory",
  });
  rules.flushEventFacts(content, world);
  assert.equal(world.civic.events.length, 1);
  assert.deepEqual(world.civic.events[0].context, { nationId: "qi" });
});

test("scheduled follow-up keeps its city and removes an effect created by another event", () => {
  const effect = {
    id: "reform_pain",
    name: "改革阵痛",
    description: "测试",
    scope: "settlement",
    effects: { production: -0.1 },
    stacking: "refresh",
  };
  const definitions = [
    event("begin", {
      target: { kind: "settlement" },
      options: [
        option("begin", [
          { type: "add_modifier", modifierId: effect.id, durationDays: 100 },
          { type: "schedule_event", eventId: "finish", delayDays: 3 },
        ]),
      ],
    }),
    event("finish", {
      target: { kind: "settlement" },
      options: [
        option("finish", [
          { type: "remove_modifier", modifierId: effect.id },
          { type: "grain", amount: 15 },
        ]),
      ],
    }),
  ];
  let { content, world } = setup(definitions, {
    modifierDefinitions: [...base.modifierDefinitions, effect],
  });
  const begin = rules.createEventInstance(content, world, "begin", {
    nationId: "qi",
  });
  world = rules.chooseEvent(content, world, begin.id, "begin");
  assert.equal(world.modifiers.instances.length, 1);
  assert.equal(
    world.civic.scheduled[0].context.settlementId,
    begin.context.settlementId,
  );
  jump(world, 3);
  rules.tickEventsDay(content, world);
  const finish = world.civic.events.find(
    (entry) => entry.definitionId === "finish",
  );
  assert.equal(finish.context.settlementId, begin.context.settlementId);
  world = rules.chooseEvent(content, world, finish.id, "finish");
  assert.equal(world.modifiers.instances.length, 0);
  assert.equal(world.civic.scheduled.length, 0);
});

test("delayed conditions retry only inside the saved deadline, then cancel visibly", () => {
  const { content, world } = setup([
    event("later", { condition: { type: "flag", flagId: "ready" } }),
  ]);
  const scheduled = rules.scheduleEvent(
    world,
    { nationId: "qi" },
    "later",
    1,
    2,
    4,
  );
  jump(world, 1);
  rules.tickEventsDay(content, world);
  assert.equal(world.civic.scheduled[0].dueAt, scheduled.createdAt + 3);
  jump(world, 4);
  rules.tickEventsDay(content, world);
  assert.equal(world.civic.scheduled.length, 0);
  assert.equal(world.civic.history[0].status, "cancelled");
  assert.match(world.civic.history[0].reason, /ready/);
});

test("delayed trigger does not pick a substitute after the original target is captured", () => {
  const { content, world } = setup([
    event("later_city", { target: { kind: "settlement" } }),
  ]);
  const cityId = ownCity(world);
  rules.scheduleEvent(
    world,
    { nationId: "qi", settlementId: cityId },
    "later_city",
    2,
  );
  world.settlements[cityId].owner = "lu";
  jump(world, 2);
  rules.tickEventsDay(content, world);
  assert.equal(world.civic.events.length, 0);
  assert.equal(world.civic.history[0].context.settlementId, cityId);
  assert.equal(world.civic.history[0].status, "cancelled");
});

test("a national follow-up does not inherit a city dependency it never declared", () => {
  const { content, world } = setup([event("national_followup")]);
  const cityId = ownCity(world);
  rules.scheduleEvent(
    world,
    { nationId: "qi", settlementId: cityId },
    "national_followup",
    2,
  );
  world.settlements[cityId].owner = "lu";
  jump(world, 2);
  rules.tickEventsDay(content, world);
  assert.equal(world.civic.events.length, 1);
  assert.deepEqual(world.civic.events[0].context, { nationId: "qi" });
  assert.equal(world.civic.history.length, 0);
});

test("AI uses only legal options and normalizes even extremely large weights", () => {
  const definition = event("ai", {
    options: [
      option("safe", [{ type: "grain", amount: 2 }], { aiWeight: 1e308 }),
      option("rich", [{ type: "grain", amount: 999 }], {
        cost: { grain: 100000 },
        aiWeight: 1e308,
      }),
    ],
  });
  const { content, world } = setup([definition]);
  world.nations.lu.treasury = 1;
  rules.createEventInstance(content, world, "ai", { nationId: "lu" });
  rules.resolveAIEvents(content, world);
  assert.equal(world.nations.lu.treasury, 3);
  assert.equal(world.civic.history[0].optionId, "safe");
  const seen = new Set();
  for (let index = 0; index < 20; index++)
    seen.add(
      rules.pickWeighted(world, [
        { value: "a", weight: 1e308 },
        { value: "b", weight: 1e308 },
      ]),
    );
  assert.deepEqual([...seen].sort(), ["a", "b"]);
});

test("invalid context stays false under negation; conditions and flags are object scoped", () => {
  const { content, world } = setup([]);
  const invalid = rules.evaluateCondition(
    content,
    world,
    { nationId: "qi" },
    {
      not: {
        type: "metric",
        metric: "settlement.scale",
        compare: "gt",
        value: 0,
      },
    },
  );
  assert.equal(invalid.passed, false);
  assert.equal(invalid.valid, false);
  const cityId = ownCity(world);
  rules.setEventFlag(
    world,
    { nationId: "qi", settlementId: cityId },
    "reform",
    true,
    { kind: "settlement" },
  );
  assert.equal(
    rules.evaluateCondition(
      content,
      world,
      { nationId: "qi", settlementId: cityId },
      { type: "flag", flagId: "reform", target: { kind: "settlement" } },
    ).passed,
    true,
  );
  assert.equal(
    rules.evaluateCondition(
      content,
      world,
      { nationId: "qi" },
      { type: "flag", flagId: "reform" },
    ).passed,
    false,
  );
});

test("date triggers check once per nation and date, independent of history pruning", () => {
  const { content, world } = setup([
    event("dated", { triggers: [{ type: "date", date: base.scenario.start }] }),
  ]);
  rules.tickEventsDay(content, world);
  const count = world.civic.events.length;
  assert.ok(count > 0);
  const active = world.civic.events.find((entry) => entry.nationId === "qi");
  const chosen = rules.chooseEvent(content, world, active.id, "accept");
  chosen.civic.history = [];
  rules.tickEventsDay(content, chosen);
  assert.equal(
    chosen.civic.events.filter((entry) => entry.nationId === "qi").length,
    0,
  );
  assert.equal(chosen.civic.events.length, count - 1);
});

test("saved pending, scheduling, counters and random decisions replay deterministically without awards on load", () => {
  const definitions = [
    event("saved", {
      options: [
        option("roll", [], {
          outcomes: [
            { id: "a", weight: 1, effects: [{ type: "grain", amount: 7 }] },
            { id: "b", weight: 1, effects: [{ type: "grain", amount: 13 }] },
          ],
        }),
      ],
    }),
    event("later"),
  ];
  const { content, world } = setup(definitions);
  const active = rules.createEventInstance(content, world, "saved", {
    nationId: "qi",
  });
  rules.scheduleEvent(world, { nationId: "qi" }, "later", 60);
  const restored = rules.parseSave(
    JSON.stringify(rules.createSave(content, world)),
  ).world;
  assert.equal(restored.nations.qi.treasury, world.nations.qi.treasury);
  assert.deepEqual(
    rules.chooseEvent(content, restored, active.id, "roll"),
    rules.chooseEvent(content, world, active.id, "roll"),
  );
  const decided = rules.chooseEvent(content, restored, active.id, "roll");
  const afterLoad = rules.parseSave(
    JSON.stringify(rules.createSave(content, decided)),
  ).world;
  assert.deepEqual(afterLoad.civic, decided.civic);
  assert.equal(afterLoad.nations.qi.treasury, decided.nations.qi.treasury);
});

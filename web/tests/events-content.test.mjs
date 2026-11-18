import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
const bundle = await build({
  stdin: {
    contents: `export * from './src/definitions/validate.ts'; export * from './src/definitions/conditions.ts'; export * from './src/definitions/events.ts'; export * from './src/definitions/effects.ts';`,
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
const base = Object.fromEntries(
  await Promise.all(
    Object.entries(manifest)
      .filter(([key]) => key !== "version")
      .map(async ([key, filename]) => [
        key,
        JSON.parse(await readFile(`public/content/base/${filename}`, "utf8")),
      ]),
  ),
);
function validate(change) {
  const content = structuredClone(base);
  change(content);
  return rules.validateContent(content);
}

test("事件数据包含独立概率池、稳定选项和绑定城镇后续", () => {
  const content = rules.validateContent(base);
  assert.equal(content.eventPools[0].chance, 0.22);
  const trial = content.events.find((e) => e.id === "foundry_trial");
  assert.equal(trial.target.kind, "settlement");
  assert.deepEqual(trial.options[1].cost, { grain: 60 });
  const later = trial.options[1].effects.find(
    (e) => e.type === "schedule_event",
  );
  assert.equal(later.delayDays, 90);
  const result = content.events.find((e) => e.id === later.eventId);
  assert.equal(
    result.options[0].effects[0].modifierId,
    "foundry_trial_disruption",
  );
  assert.deepEqual(result.options[0].effects[0].target, { kind: "settlement" });
  assert.deepEqual(result.triggers, []);
});
test("未知条件、任意对象路径、无绑定城镇均在导入时拒绝", () => {
  for (const condition of [
    { type: "metric", metric: "nation.password", compare: "gt", value: 0 },
    { type: "javascript", body: "return true" },
    { all: [] },
    { type: "metric", metric: "settlement.scale", compare: "gte", value: 1 },
    { type: "building", buildingId: "warehouse", compare: "gte", value: 1 },
  ])
    assert.throws(() =>
      validate((c) => {
        c.events[0].condition = condition;
      }),
    );
});
test("递归条件和跨文件引用都通过共同校验", () => {
  const condition = {
    all: [
      { type: "technology", technologyId: "copper_1" },
      {
        any: [
          {
            type: "metric",
            metric: "nation.treasury",
            compare: "gte",
            value: 60,
          },
          { not: { type: "flag", flagId: "test_flag" } },
        ],
      },
    ],
  };
  assert.deepEqual(
    validate((c) => {
      c.events[0].condition = condition;
    }).events[0].condition,
    condition,
  );
  assert.throws(
    () =>
      validate((c) => {
        c.events[0].condition = { type: "technology", technologyId: "missing" };
      }),
    /未知科技/,
  );
  assert.throws(
    () =>
      validate((c) => {
        c.events[0].condition = {
          type: "event_count",
          eventId: "missing",
          scope: "nation",
          compare: "gt",
          value: 0,
        };
      }),
    /未知事件/,
  );
});
test("超时首选项必须不受条件或支付能力限制", () => {
  assert.throws(
    () =>
      validate((c) => {
        c.events[0].options[0].cost = { grain: 10 };
      }),
    /首选项/,
  );
  assert.throws(
    () =>
      validate((c) => {
        c.events[0].options[0].condition = { type: "flag", flagId: "eligible" };
      }),
    /首选项/,
  );
  assert.throws(
    () =>
      validate((c) => {
        c.events[0].options[1].cost = { grain: -1 };
      }),
    /不得为负/,
  );
  assert.throws(
    () =>
      validate((c) => {
        c.events[0].options[1].id = c.events[0].options[0].id;
      }),
    /ID 重复/,
  );
});
test("概率池与所有事实触发引用在导入时验证", () => {
  assert.throws(
    () =>
      validate((c) => {
        c.eventPools[0].chance = 1.1;
      }),
    /0 到 1/,
  );
  assert.throws(
    () =>
      validate((c) => {
        c.events[0].triggers[0].poolId = "missing";
      }),
    /未知事件池/,
  );
  assert.throws(
    () =>
      validate((c) => {
        c.events[0].triggers = [
          { type: "fact", fact: "research_completed", subjectId: "missing" },
        ];
      }),
    /未知科技/,
  );
  assert.throws(
    () =>
      validate((c) => {
        c.events[0].triggers = [
          { type: "fact", fact: "diplomacy_completed", subjectId: "missing" },
        ];
      }),
    /未知外交行动/,
  );
  assert.throws(
    () =>
      validate((c) => {
        c.events[0].triggers = [
          { type: "date", date: { year: 0, month: 1, day: 1 } },
        ];
      }),
    /日期无效/,
  );
});
test("后续事件必须继承所需对象，未知ID与不完整重试策略拒绝", () => {
  const action = {
    type: "schedule_event",
    eventId: "foundry_trial_result",
    delayDays: 90,
  };
  assert.throws(
    () =>
      validate((c) => {
        c.events[0].options[0].effects = [action];
      }),
    /继承已绑定对象/,
  );
  assert.throws(
    () =>
      validate((c) => {
        c.events[0].options[0].effects = [{ ...action, eventId: "missing" }];
      }),
    /未知后续事件/,
  );
  assert.throws(
    () => rules.validateEffectActions([{ ...action, delayDays: 0 }], "test"),
    /正整数/,
  );
  assert.throws(
    () => rules.validateEffectActions([{ ...action, retryDays: 10 }], "test"),
    /同时设置/,
  );
  assert.throws(
    () =>
      rules.validateEffectActions(
        [{ ...action, retryDays: 20, retryUntilDays: 10 }],
        "test",
      ),
    /首次重试/,
  );
});
test("效果移除仅按定义ID与对象，旧来源过滤字段必须报错", () => {
  assert.throws(
    () =>
      rules.validateEffectActions(
        [
          {
            type: "remove_modifier",
            modifierId: "canal_repair",
            sourceOnly: true,
          },
        ],
        "test",
      ),
    /未知字段 sourceOnly/,
  );
  const action = {
    type: "remove_modifier",
    modifierId: "canal_repair",
    target: { kind: "nation", id: "lu" },
  };
  assert.deepEqual(rules.validateEffectActions([action], "test"), [action]);
});
test("局部修正、外交动作和概率结果均校验实际引用", () => {
  assert.throws(
    () =>
      validate((c) => {
        c.events.find(
          (e) => e.id === "foundry_trial_result",
        ).options[0].effects[0].target = { kind: "nation" };
      }),
    /作用域不符/,
  );
  assert.throws(
    () =>
      validate((c) => {
        c.events[0].options[0].effects = [{ type: "relation", amount: 10 }];
      }),
    /绑定相关国家/,
  );
  assert.throws(
    () =>
      validate((c) => {
        c.events.find(
          (e) => e.id === "gift_reception",
        ).options[1].outcomes[0].effects = [
          { type: "unlock_idea", ideaId: "missing" },
        ];
      }),
    /未知理念/,
  );
});

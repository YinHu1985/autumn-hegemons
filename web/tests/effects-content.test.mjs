import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
const bundle = await build({
  stdin: {
    contents: `export * from './src/definitions/validate.ts'; export * from './src/definitions/effects.ts'; export * from './src/definitions/modifier-values.ts'; export * from './src/definitions/modifiers.ts'; export * from './src/definitions/modifier-definitions.ts';`,
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
function contentWith(change) {
  const raw = structuredClone(base);
  change(raw);
  return rules.validateContent(raw);
}
const sample = {
  id: "test_supply",
  name: "军备整顿",
  description: "暂定测试效果",
  scope: "nation",
  effects: { "army.attack": 0.1 },
  stacking: "refresh",
};

test("基础包载入命名效果，现有事件保留一次收益", () => {
  const content = rules.validateContent(base);
  assert.ok(content.modifierDefinitions.length >= 3);
  const option = content.events.find((entry) => entry.id === "good_harvest")
    .options[1];
  assert.deepEqual(option.effects[0], { type: "grain", amount: 10 });
  assert.equal(option.effects[2].type, "add_modifier");
  assert.equal(option.effects[2].durationDays, 180);
});
test("科技、理念挂载卸下、事件共用动作语法", () => {
  const actions = [
    {
      type: "grain",
      amount: { op: "min", args: [10, { metric: "nation.treasury" }] },
    },
    { type: "manpower", amount: 20 },
    { type: "governance", amount: 0.01 },
    { type: "research", amount: 5, targetId: base.technologies[0].id },
    { type: "unlock_idea", ideaId: base.ideas[0].id },
    { type: "add_modifier", modifierId: sample.id, durationDays: 30 },
    { type: "remove_modifier", modifierId: sample.id },
  ];
  const content = contentWith((raw) => {
    raw.modifierDefinitions.push(sample);
    raw.technologies[0].completionEffects = actions;
    raw.ideas[0].enactEffects = actions;
    raw.ideas[0].repealEffects = actions;
    raw.events[0].options[0].effects = actions;
  });
  for (const value of [
    content.technologies[0].completionEffects,
    content.ideas[0].enactEffects,
    content.ideas[0].repealEffects,
    content.events[0].options[0].effects,
  ])
    assert.deepEqual(value, actions);
});
test("持续词条支持数字、表达式和显式运算，保持旧数值语义", () => {
  const content = contentWith((raw) => {
    raw.technologies[0].effects = {
      income: { operation: "multiply", value: 1.1 },
      research_scale: {
        operation: "add",
        value: { metric: "nation.budget.research" },
      },
      "army.limit": 1,
    };
    raw.ideas[0].showInAdministration = true;
  });
  assert.equal(content.technologies[0].effects["army.limit"], 1);
  assert.equal(content.ideas[0].showInAdministration, true);
  for (const [key, op] of Object.entries({
    income: "add_percent",
    governance_cap: "add",
    "army.cadre_ratio": "add",
    research_scale: "add",
  }))
    assert.equal(rules.modifierDefaultOperation(key), op);
});
test("作用范围和城镇指标上下文严格校验", () => {
  const local = {
    ...sample,
    id: "local_wall",
    scope: "settlement",
    effects: { fortification: { metric: "settlement.scale" } },
  };
  const content = contentWith((raw) => {
    raw.modifierDefinitions.push(local);
    raw.technologies[0].completionEffects = [
      {
        type: "add_modifier",
        modifierId: local.id,
        target: { kind: "settlement", id: raw.scenario.settlements[0].id },
      },
    ];
  });
  assert.equal(content.modifierDefinitions.at(-1).scope, "settlement");
  assert.throws(
    () => rules.validateModifierDefinitions([{ ...local, scope: "nation" }]),
    /作用域/,
  );
  assert.throws(
    () =>
      rules.validateModifierDefinitions([
        { ...local, effects: { "army.attack": 0.1 } },
      ]),
    /作用域/,
  );
  assert.throws(
    () =>
      rules.validateModifierTerms(
        { income: { metric: "settlement.scale" } },
        "test",
      ),
    /上下文/,
  );
  assert.throws(
    () =>
      contentWith((raw) => {
        raw.modifierDefinitions.push(local);
        raw.events[0].options[0].effects = [
          { type: "add_modifier", modifierId: local.id },
        ];
      }),
    /明确目标城镇/,
  );
});
test("modifier、理念、研究、目标和生产路线都检查跨文件引用", () => {
  for (const action of [
    { type: "add_modifier", modifierId: "missing" },
    { type: "remove_modifier", modifierId: "missing" },
    { type: "unlock_idea", ideaId: "missing" },
    { type: "research", amount: 1, targetId: "missing" },
    {
      type: "add_modifier",
      modifierId: "canal_repair",
      target: { kind: "nation", id: "missing" },
    },
    {
      type: "add_modifier",
      modifierId: "canal_repair",
      target: { kind: "settlement", id: base.scenario.settlements[0].id },
    },
  ])
    assert.throws(
      () =>
        contentWith((raw) => {
          raw.events[0].options[0].effects = [action];
        }),
      /未知|作用域/,
    );
  for (const group of ["technologies", "ideas", "modifierDefinitions"])
    assert.throws(
      () =>
        contentWith((raw) => {
          raw[group][0].effects = { "production.missing_route": 0.1 };
        }),
      /生产路线/,
    );
});
test("拒绝未知字段动作运算、旧事件kind和无效目标", () => {
  for (const action of [
    { kind: "grain", amount: 5 },
    { type: "run_script", script: "anything" },
    { type: "unlock_idea", ideaId: "x", amount: 1 },
    { type: "grain", amount: 5, targetId: "x" },
    { type: "add_modifier", modifierId: "x", target: { kind: "army" } },
    {
      type: "add_modifier",
      modifierId: "x",
      target: { kind: "nation", typo: "x" },
    },
    { type: "remove_modifier", modifierId: "x", sourceOnly: 1 },
  ])
    assert.throws(() => rules.validateEffectActions([action], "test"));
  assert.throws(
    () =>
      rules.validateModifierTerms(
        { income: { operation: "overwrite", value: 1 } },
        "test",
      ),
    /运算/,
  );
  assert.throws(
    () => rules.validateModifierDefinitions([{ ...sample, mysterious: true }]),
    /未知字段/,
  );
  assert.throws(
    () =>
      contentWith((raw) => {
        raw.technologies[0].showInAdministration = "yes";
      }),
    /布尔/,
  );
  assert.throws(
    () =>
      contentWith((raw) => {
        raw.ideas[0].technology = raw.technologies[0].id;
      }),
    /理念不得依赖/,
  );
});
test("期限支持永久默认与绝对日序，拒绝冲突或非整数", () => {
  for (const duration of [
    {},
    { durationDays: 30 },
    { expiresAt: 1000 },
    { expiresAt: -1 },
  ])
    assert.equal(
      rules.validateEffectActions(
        [{ type: "add_modifier", modifierId: "x", ...duration }],
        "test",
      )[0].type,
      "add_modifier",
    );
  for (const duration of [
    { durationDays: 1, expiresAt: 1000 },
    { durationDays: 0 },
    { durationDays: -1 },
    { durationDays: 1.5 },
    { expiresAt: Infinity },
    { expiresAt: Number.MAX_SAFE_INTEGER + 1 },
  ])
    assert.throws(() =>
      rules.validateEffectActions(
        [{ type: "add_modifier", modifierId: "x", ...duration }],
        "test",
      ),
    );
});
test("表达式受指标白名单、深度、节点和有限数约束", () => {
  for (const expression of [
    { metric: "nation.income" },
    { metric: "toString" },
    { metric: "nation.treasury", eval: "x" },
    { op: "random", args: [1, 2] },
    { op: "subtract", args: [1] },
    { op: "clamp", args: [0, 2, 1] },
    { op: "divide", args: [1, 0] },
    { op: "divide", args: [1, { op: "subtract", args: [1, 1] }] },
    { op: "multiply", args: [1e308, 1e308] },
    NaN,
    Infinity,
  ])
    assert.throws(() => rules.validateExpression(expression, "test"));
  let deep = 1;
  for (let index = 0; index < 15; index++)
    deep = { op: "add", args: [deep, 1] };
  assert.throws(() => rules.validateExpression(deep, "test"), /限制/);
  assert.throws(
    () =>
      rules.validateExpression({ op: "add", args: Array(130).fill(1) }, "test"),
    /限制/,
  );
  const valid = { op: "clamp", args: [{ metric: "nation.budget.army" }, 0, 1] };
  assert.deepEqual(rules.validateExpression(valid, "test"), valid);
});
test("词条格式区分百分比、百分点、绝对增减和乘数", () => {
  assert.equal(rules.formatModifier("income", 0.1), "粮食收入 +10%");
  assert.equal(
    rules.formatModifier("income", { operation: "add", value: -10 }),
    "粮食收入 -1000个百分点",
  );
  assert.equal(
    rules.formatModifier("income", { operation: "add", value: 0.1 }),
    "粮食收入 +10个百分点",
  );
  assert.equal(
    rules.formatModifier("research_scale", { operation: "add", value: -10 }),
    "研究组规模 -10",
  );
  assert.equal(
    rules.formatModifier("research_scale", {
      operation: "add_percent",
      value: 0.1,
    }),
    "研究组规模 +10%",
  );
  assert.equal(
    rules.formatModifier("governance_cap", 0.1),
    "治理上限 +10个百分点",
  );
  assert.equal(
    rules.formatModifier("income", { operation: "multiply", value: 1.2 }),
    "粮食收入 ×1.2",
  );
  assert.match(
    rules.formatModifier("income", {
      metric: "nation.operatingCoverage.buildings",
    }),
    /本期产业维护覆盖/,
  );
});

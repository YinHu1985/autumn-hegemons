import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";

const bundle = await build({
  stdin: {
    contents: `
      export * from './src/simulation/state.ts';
      export * from './src/simulation/modifier-instances.ts';
      export * from './src/simulation/modifier-query.ts';
      export * from './src/simulation/modifier-clock.ts';
      export * from './src/simulation/economy.ts';
      export * from './src/definitions/validate.ts';
      export * from './src/game/effects/effect-labels.ts';
      export { EconomyModifiers } from './src/game/economy/EconomyModifiers.tsx';
      export { ResourceCalculation } from './src/game/economy/ResourceCalculation.tsx';
      export { EconomySupply } from './src/game/economy/EconomySupply.tsx';
      export { ResearchOutcomes } from './src/game/research/ResearchOutcomes.tsx';
      export { createElement } from 'react';
      export { renderToStaticMarkup } from 'react-dom/server';
    `,
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  loader: { ".css": "empty" },
  define: { "import.meta.env.BASE_URL": JSON.stringify("/") },
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(process.cwd() + '/package.json');",
  },
});
const ui = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);
const manifest = JSON.parse(
  await readFile("public/content/base/manifest.json", "utf8"),
);
const raw = Object.fromEntries(
  await Promise.all(
    Object.entries(manifest)
      .filter(([, path]) => typeof path === "string" && path.endsWith(".json"))
      .map(async ([key, path]) => [
        key,
        JSON.parse(await readFile(`public/content/base/${path}`, "utf8")),
      ]),
  ),
);
const baseContent = ui.validateContent(raw);
function fixture() {
  const content = structuredClone(baseContent);
  const world = ui.createWorld(content);
  return { content, world, nationId: "qi" };
}
const render = (component, props) =>
  ui.renderToStaticMarkup(ui.createElement(component, props));
const source = { kind: "event", id: "test_event", name: "治水奏报" };

test("内政只展示可见且未到期的额外状态，并包含本国城镇目标", () => {
  const props = fixture();
  props.content.modifierDefinitions.push({
    id: "local_test",
    name: "临淄徭役",
    description: "当地动员。",
    scope: "settlement",
    effects: { income: -0.1 },
    stacking: "refresh",
  });
  const city = props.content.scenario.settlements.find(
    (entry) => entry.owner === "qi",
  );
  const context = { nationId: "qi", settlementId: city.id, source };
  ui.addModifier(props.content, props.world, context, {
    modifierId: "canal_repair",
    durationDays: 90,
  });
  ui.addModifier(props.content, props.world, context, {
    modifierId: "local_test",
    durationDays: 60,
  });
  const hidden = ui.addModifier(props.content, props.world, context, {
    modifierId: "visiting_scholars",
    durationDays: 30,
  });
  hidden.showInAdministration = false;
  let html = render(ui.EconomyModifiers, props);
  assert.match(html, /渠堰整修/);
  assert.match(html, /临淄徭役/);
  assert.ok(html.includes(city.name));
  assert.match(html, /剩余 90 日/);
  assert.match(html, /来源：治水奏报/);
  assert.doesNotMatch(html, /游士讲学/);
  const known = props.content.technologies.find((entry) =>
    props.world.research.nations.qi.unlocked.includes(entry.id),
  );
  assert.ok(!html.includes(known.name));
  props.world.date = ui.dateFromGameDay(ui.gameDay(props.world.date) + 90);
  html = render(ui.EconomyModifiers, props);
  assert.match(html, /当前没有额外生效/);
  assert.doesNotMatch(html, /渠堰整修|临淄徭役/);
});

test("额外状态显示动态数值；修改计划预算不假装改变本期实付覆盖", () => {
  const props = fixture();
  ui.addModifier(
    props.content,
    props.world,
    { nationId: "qi", source },
    { modifierId: "canal_repair", durationDays: 90 },
  );
  props.world.nations.qi.operatingCoverage.buildings = 0.5;
  assert.match(render(ui.EconomyModifiers, props), /产量 \+2.5%/);
  props.world.nations.qi.budget.buildings = 0;
  assert.match(render(ui.EconomyModifiers, props), /产量 \+2.5%/);
  props.world.nations.qi.operatingCoverage.buildings = 1;
  assert.match(render(ui.EconomyModifiers, props), /产量 \+5%/);
});

test("实际收入明细展示隐藏科技、理念及额外状态贡献，并复用计算结果", () => {
  const props = fixture();
  const technology = props.content.technologies[0];
  technology.effects.income = 0.2;
  props.world.research.nations.qi.unlocked.push(technology.id);
  const idea = props.content.ideas[0];
  idea.effects.income = 0.1;
  props.world.research.nations.qi.enacted.push(idea.id);
  ui.addModifier(
    props.content,
    props.world,
    { nationId: "qi", source },
    { modifierId: "local_relief_burden", durationDays: 90 },
  );
  const economy = ui.calculateEconomy(props.content, props.world, "qi");
  const line = economy.lines.find((entry) =>
    entry.calculation?.steps.some((step) => step.stat?.key === "income"),
  );
  assert.ok(line);
  const html = render(ui.ResourceCalculation, {
    calculation: line.calculation,
    label: line.source,
  });
  assert.ok(html.includes(technology.name));
  assert.ok(html.includes(idea.name));
  assert.match(html, /地方赈济负担/);
  assert.match(html, /粮食收入 \+20%/);
  assert.match(html, /粮食收入 -5%/);
  assert.match(html, /实际产出/);
  assert.match(html, /popover="auto"/);
  assert.match(html, /role="dialog"/);
  assert.match(html, /popoverTargetAction="hide"/i);
  assert.doesNotMatch(html, /<details/);
  assert.equal(line.calculation.value, line.amount);
});

test("各产出明细使用唯一浮窗目标，入口和标题包含资源名", () => {
  const props = fixture();
  const economy = ui.calculateEconomy(props.content, props.world, "qi");
  const names = ["粮食", "木材"];
  const calculation = { base: 100, steps: [], value: 100 };
  economy.lines = names.map((name) => ({
    source: "共用作坊",
    resourceId: props.content.goods.find((good) => good.name === name).id,
    amount: 100,
    calculation,
  }));
  const html = render(ui.EconomySupply, { content: props.content, economy });
  for (const name of names) {
    assert.ok(html.includes(`aria-label="查看共用作坊 · ${name}计算明细"`));
    assert.ok(html.includes(`>共用作坊 · ${name}</h3>`));
  }
  const ids = [...html.matchAll(/id="([^"]+)" popover="auto"/g)].map(
    (match) => match[1],
  );
  assert.equal(ids.length, 2);
  assert.equal(new Set(ids).size, 2);
  for (const id of ids)
    assert.ok(
      html.includes(`popoverTarget="${id}"`) ||
        html.includes(`popovertarget="${id}"`),
    );
});

test("科技的一次动作可完整说明，独立add_modifier不会误显示效果待定", () => {
  const props = fixture();
  const subject = {
    ...props.content.technologies[0],
    effects: {},
    completionEffects: [
      { type: "add_modifier", modifierId: "canal_repair", durationDays: 120 },
    ],
  };
  const html = render(ui.ResearchOutcomes, { content: props.content, subject });
  assert.match(html, /研究完成时/);
  assert.match(html, /渠堰整修/);
  assert.match(html, /120 日/);
  assert.match(html, /本期产业维护覆盖/);
  assert.doesNotMatch(html, /效果待定|NaN|\[object Object\]/);
  assert.match(
    ui.describeEffectAction(props.content, {
      type: "governance",
      amount: -0.1,
    }),
    /-10 个百分点/,
  );
  assert.match(
    ui.describeEffectAction(props.content, {
      type: "unlock_idea",
      ideaId: props.content.ideas[0].id,
    }),
    /解锁理念/,
  );
  assert.match(
    ui.describeEffectAction(props.content, {
      type: "remove_modifier",
      modifierId: "canal_repair",
    }),
    /移除「渠堰整修」/,
  );
});

test("动作预览明确启发上限与按对象移除效果", () => {
  const { content } = fixture();
  const technology = content.technologies[0];
  const research = ui.describeEffectAction(content, {
    type: "research",
    amount: 50,
    targetId: technology.id,
  });
  assert.match(research, /研究启发 \+50/);
  assert.match(research, /受启发上限限制/);
  assert.ok(research.includes(technology.name));
  assert.doesNotMatch(research, /研究进度/);
  assert.match(
    ui.describeEffectAction(content, {
      type: "remove_modifier",
      modifierId: "canal_repair",
    }),
    /移除「渠堰整修」/,
  );
  assert.match(
    ui.describeEffectAction(content, {
      type: "governance",
      amount: 0.05,
    }),
    /各城镇治理 \+5 个百分点/,
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";

const bundle = await build({
  stdin: {
    contents: `
      export * from './src/simulation/state.ts';
      export * from './src/simulation/events/index.ts';
      export * from './src/simulation/modifier-clock.ts';
      export * from './src/definitions/validate.ts';
      export * from './src/game/effects/effect-labels.ts';
      export * from './src/game/events/event-view.ts';
      export { EventsPanel } from './src/game/EventsPanel.tsx';
      export { EventDossier } from './src/game/events/EventDossier.tsx';
      export { EventPopup } from './src/game/events/EventPopup.tsx';
      export { EventHistory } from './src/game/events/EventHistory.tsx';
      export { newEventDefinition } from './src/editor/EventAuthoringGuide.tsx';
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
  define: { "import.meta.env.BASE_URL": JSON.stringify("/preview/") },
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
const base = ui.validateContent(raw);
const render = (component, props) =>
  ui.renderToStaticMarkup(ui.createElement(component, props));
function fixture() {
  const content = structuredClone(base);
  const world = ui.createWorld(content);
  const nationId = "qi";
  const city = content.scenario.settlements.find(
    (entry) => entry.owner === nationId,
  );
  const definition = {
    id: "ui_test",
    title: "{{settlement}}来报",
    description: "{{nation}}的{{settlement}}呈上新议。",
    weight: 1,
    duration: 30,
    triggers: [],
    target: { kind: "settlement" },
    presentation: {
      image: "assets/technology/bronze_foundry.jpg",
      speaker: "工正",
    },
    options: [
      { id: "wait", label: "暂缓施行", description: "沿用旧法。", effects: [] },
      {
        id: "invest",
        label: "拨粮改良",
        description: "拨付粮食，试行新法。",
        cost: { grain: 100 },
        effects: [{ type: "governance", amount: 0.05 }],
      },
    ],
  };
  content.events.push(definition);
  const event = {
    id: "event-900",
    definitionId: definition.id,
    nationId,
    context: { nationId, settlementId: city.id },
    createdAt: ui.gameDay(world.date),
    expiresAt: ui.gameDay(world.date) + 30,
  };
  world.civic.events = [event];
  return {
    content,
    world,
    nationId,
    city,
    definition,
    event,
    onWorld: () => {},
    onOpenEvent: () => {},
  };
}

test("一份奏报展示绑定城镇、期限和叙述者，资源不足的付费选项提供原因", () => {
  const props = fixture();
  props.world.nations.qi.treasury = 20;
  const html = render(ui.EventDossier, props);
  assert.ok(html.includes(`${props.city.name}来报`));
  assert.ok(html.includes(`齐的${props.city.name}呈上新议。`));
  assert.match(html, /工正/);
  assert.match(html, /尚余 <b>30<\/b> 日/);
  assert.match(html, /逾期默认/);
  assert.match(html, /支出 粮食 100/);
  assert.match(html, /disabled=""/);
  assert.match(html, /粮食不足|国库粮食不足/);
  assert.ok(html.includes(`${props.city.name}治理 +5 个百分点`));
  assert.doesNotMatch(html, /\{\{settlement\}\}|\{\{nation\}\}/);
  assert.match(html, /src="\/preview\/assets\/technology\/bronze_foundry.jpg"/);
});

test("纪事只展示待议列表，决策正文在独立非模态小窗中阅览", () => {
  const props = fixture();
  const important = {
    ...props.definition,
    id: "ui_important",
    title: "急奏",
    presentation: { important: true },
    options: [
      { id: "ok", label: "采纳急议", description: "急事先行。", effects: [] },
    ],
  };
  props.content.events.push(important);
  props.world.civic.events.push({
    ...props.event,
    id: "event-901",
    definitionId: important.id,
  });
  const html = render(ui.EventsPanel, props);
  assert.match(html, /急奏/);
  assert.ok(html.includes(`${props.city.name}来报`));
  assert.doesNotMatch(html, /event-dossier|采纳急议|拨粮改良/);
  assert.equal((html.match(/阅览奏报 ›/g) ?? []).length, 2);
  const popup = render(ui.EventPopup, {
    ...props,
    event: props.world.civic.events[1],
    visible: true,
    count: 2,
    index: 1,
    onClose: () => {},
    onStep: () => {},
    onResolved: () => {},
  });
  assert.equal((popup.match(/class="event-dossier"/g) ?? []).length, 1);
  assert.match(popup, /class="event-popup"/);
  assert.match(popup, /role="dialog"/);
  assert.match(popup, /采纳急议/);
  assert.match(popup, /2 \/ 2 份待议/);
  assert.match(popup, /稍后处理奏报/);
  assert.doesNotMatch(
    popup,
    /government-window|window-heading|aria-modal|拨粮改良/,
  );
});

test("战术与系统交互遮蔽奏报时保留内容，但隐藏整个小窗", () => {
  const props = fixture();
  const html = render(ui.EventPopup, {
    ...props,
    visible: false,
    count: 1,
    index: 0,
    onClose: () => {},
    onStep: () => {},
    onResolved: () => {},
  });
  assert.match(html, /class="event-popup" hidden=""/);
  assert.match(html, /aria-label="上一份奏报"/);
  assert.match(html, /aria-label="下一份奏报"/);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
  assert.match(html, /拨粮改良/);
});

test("概率结果按权重展示，并替换后续奏报标题中的绑定名称", () => {
  const props = fixture();
  props.definition.options[1].outcomes = [
    { id: "good", weight: 3, effects: [{ type: "grain", amount: 50 }] },
    { id: "none", weight: 1, effects: [] },
  ];
  props.definition.options[1].effects.push({
    type: "schedule_event",
    eventId: props.definition.id,
    delayDays: 90,
  });
  const html = render(ui.EventDossier, props);
  assert.match(html, /75%/);
  assert.match(html, /25%/);
  assert.match(html, /国库粮食 \+50/);
  assert.match(html, /没有额外变化/);
  assert.ok(html.includes(`90 日后呈上后续奏报「${props.city.name}来报」`));
});

test("处置记录显示实际扣粮，而非可能超过国库的配置值", () => {
  const props = fixture();
  props.world.nations.qi.treasury = 20;
  props.definition.options[0].effects = [{ type: "grain", amount: -100 }];
  props.world = ui.chooseEvent(
    props.content,
    props.world,
    props.event.id,
    "wait",
    props.nationId,
  );
  const result = props.world.civic.history[0].results.find(
    (entry) => entry.type === "grain",
  );
  assert.equal(result.before, 20);
  assert.equal(result.after, 0);
  const html = render(ui.EventHistory, props);
  assert.ok(html.includes(result.description));
  assert.doesNotMatch(html, /-100/);
  assert.match(html, /暂缓施行/);
});

test("对象已经易主时所有选项禁用，界面不会为奏报重新选择城镇", () => {
  const props = fixture();
  props.world.settlements[props.city.id].owner = "lu";
  const html = render(ui.EventDossier, props);
  assert.equal(
    (html.match(/disabled=""/g) ?? []).length,
    props.definition.options.length,
  );
  assert.match(html, /城镇已不属于本国/);
  assert.ok(html.includes(`${props.city.name}来报`));
});

test("移除效果说明绑定对象；关系预览指向关联国家，不暴露来源筛选", () => {
  const props = fixture();
  props.content.modifierDefinitions.push({
    id: "ui_local",
    name: "改革阵痛",
    description: "试行新法。",
    scope: "settlement",
    stacking: "refresh",
    effects: { production: -0.1 },
  });
  const label = ui.describeEffectAction(
    props.content,
    { type: "remove_modifier", modifierId: "ui_local" },
    props.event.context,
  );
  assert.ok(label.includes(`${props.city.name} · 移除「改革阵痛」`));
  assert.doesNotMatch(label, /本来源|所有来源/);
  assert.match(
    ui.describeEffectAction(
      props.content,
      { type: "relation", amount: 10 },
      { relatedNationId: "lu" },
    ),
    /与鲁关系 \+10/,
  );
});

test("新建事件模板可直接校验，首选项无费用并使用未占用的稳定ID", () => {
  const event = ui.newEventDefinition(["new_event_1", "new_event_2"]);
  assert.equal(event.id, "new_event_3");
  assert.deepEqual(event.triggers, []);
  assert.equal(event.options[0].cost, undefined);
  assert.equal(event.options[0].condition, undefined);
  assert.doesNotThrow(() =>
    ui.validateContent({ ...raw, events: [...raw.events, event] }),
  );
});

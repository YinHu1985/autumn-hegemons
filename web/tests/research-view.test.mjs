import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";

const bundle = await build({
  stdin: {
    contents: `
      export * from './src/game/research/technology-routes.ts';
      export * from './src/game/research/research-attributes.ts';
      export * from './src/simulation/research.ts';
      export * from './src/simulation/state.ts';
      export * from './src/definitions/validate.ts';
      export * from './src/definitions/modifiers.ts';
      export { ResearchPanel } from './src/game/ResearchPanel.tsx';
      export { IdeasPanel } from './src/game/IdeasPanel.tsx';
      export { ResearchDetailDock } from './src/game/research/ResearchDetailDock.tsx';
      export { TechnologyRoutes } from './src/game/research/TechnologyRoutes.tsx';
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
const { technologyRoutes } = ui;
const tech = (id, tier, extra = {}) => ({
  id,
  name: id,
  route: "smithing",
  category: "craft",
  tier,
  ...extra,
});
const content = (technologies) => ({
  technologies,
  buildings: [{ route: "smithing", name: "冶金作坊" }],
  goods: [],
  units: [],
});

test("科技路线按声明 route 分组和档位排序，不依赖 ID 命名且不改写内容顺序", () => {
  const definitions = content([
    tech("final_custom", 3),
    tech("anvil", 1),
    tech("middle-X", 2),
  ]);
  const before = structuredClone(definitions);
  const [route] = technologyRoutes(definitions, "craft");
  assert.equal(route.id, "craft:smithing");
  assert.equal(route.label, "冶金作坊");
  assert.deepEqual(
    route.subjects.map((item) => item.id),
    ["anvil", "middle-X", "final_custom"],
  );
  assert.deepEqual(definitions, before);
});

test("稀疏档位及同档多个科技均完整保留，不填造科技或覆盖分支", () => {
  const [route] = technologyRoutes(
    content([tech("late", 3), tech("early-a", 1), tech("early-b", 1)]),
    "craft",
  );
  assert.deepEqual(
    route.subjects.map((item) => [item.id, item.tier]),
    [
      ["early-a", 1],
      ["early-b", 1],
      ["late", 3],
    ],
  );
});

test("不同科研类别同名 route 不合并，类别筛选仍只返回对应内容", () => {
  const definitions = content([
    tech("craft-a", 1),
    tech("military-a", 1, { category: "military" }),
    tech("craft-b", 2),
  ]);
  const rows = technologyRoutes(definitions, "craft");
  assert.deepEqual(
    rows.map((row) => row.id),
    ["craft:smithing"],
  );
  assert.deepEqual(
    rows[0].subjects.map((item) => item.id),
    ["craft-a", "craft-b"],
  );
  const military = technologyRoutes(definitions, "military");
  assert.equal(military.length, 1);
  assert.equal(military[0].id, "military:smithing");
  assert.deepEqual(
    military[0].subjects.map((item) => item.id),
    ["military-a"],
  );
  assert.deepEqual(technologyRoutes(definitions, "civil"), []);
});

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
const render = (component, props) =>
  ui.renderToStaticMarkup(ui.createElement(component, props));
const fixture = () => {
  const definitions = structuredClone(baseContent);
  const world = ui.createWorld(definitions);
  return { content: definitions, world, nationId: "qi", onWorld() {} };
};
const detail = (props, subject) =>
  render(ui.ResearchDetailDock, {
    ...props,
    subject,
    leaderId: "",
    onLeaderChange() {},
    onSelectSubject() {},
  });

test("百家作为普通科研分类显示，六学派使用路线名，独立成本档不绘制前置箭头", () => {
  const props = fixture();
  const screen = render(ui.ResearchPanel, props);
  assert.match(screen, /百家<small>18<\/small>/);
  assert.doesNotMatch(screen, /理念研究见/);
  const routes = technologyRoutes(props.content, "humanities");
  assert.deepEqual(
    routes.map((route) => route.label),
    ["儒家", "法家", "墨家", "道家", "兵家", "农家"],
  );
  const catalogue = render(ui.TechnologyRoutes, {
    ...props,
    routes,
    selectedId: "",
    onSelect() {},
  });
  assert.equal((catalogue.match(/class="technology-node /g) ?? []).length, 18);
  assert.doesNotMatch(catalogue, /has-prerequisite|前置未成/);
});

test("科技详情分别展示永久效果和理念解锁；普通百家科技不依赖理念存在", () => {
  const props = fixture();
  const subject = props.content.technologies.find(
    (item) => item.category === "humanities",
  );
  const html = detail(props, subject);
  assert.match(html, /解锁理念/);
  assert.match(html, /实行后：/);
  assert.match(html, /不会自动实行/);
  assert.doesNotMatch(html, /效果待定|研究后生效/);
  const independent = {
    ...subject,
    id: "test_humanities_knowledge",
    name: "百家校勘",
    route: "textual_studies",
    routeName: "典籍",
    completionEffects: [],
    effects: { research_efficiency: 0.1 },
  };
  props.content.technologies.push(independent);
  const standalone = detail(props, independent);
  assert.match(standalone, /研究后生效/);
  assert.ok(standalone.includes(ui.formatModifier("research_efficiency", 0.1)));
  assert.doesNotMatch(standalone, /解锁理念|实行后：/);
  assert.equal(
    technologyRoutes(props.content, "humanities").at(-1).label,
    "典籍",
  );
});

test("百家只有理念选择和实行：不显示费用进度或研究组操作，独立解锁状态决定可实行", () => {
  const props = fixture();
  const idea = props.content.ideas[0];
  const technology = props.content.technologies.find((item) =>
    item.completionEffects?.some(
      (effect) => effect.type === "unlock_idea" && effect.ideaId === idea.id,
    ),
  );
  const locked = render(ui.IdeasPanel, props);
  assert.match(locked, /尚未解锁/);
  assert.ok(locked.includes(technology.name));
  assert.doesNotMatch(
    locked,
    /成立研究组|课题负责人|研究进度|单位投入|知识启发|type="range"/,
  );
  props.world.research.nations.qi.unlocked.push(technology.id);
  assert.doesNotMatch(render(ui.IdeasPanel, props), /安排实行该理念/);
  props.world.research.nations.qi.unlockedIdeas.push(idea.id);
  const available = render(ui.IdeasPanel, props);
  assert.match(available, /安排实行该理念/);
  assert.doesNotMatch(available, /停止实行该理念/);
  props.world.research.nations.qi.enacted.push(idea.id);
  assert.match(render(ui.IdeasPanel, props), /停止实行该理念/);
});

test("没有科技解锁途径的理念仍可由独立状态实行，不假造科研关联", () => {
  const props = fixture();
  const idea = props.content.ideas[0];
  for (const technology of props.content.technologies)
    technology.completionEffects = technology.completionEffects?.filter(
      (effect) => effect.type !== "unlock_idea" || effect.ideaId !== idea.id,
    );
  const locked = render(ui.IdeasPanel, props);
  assert.match(locked, /此理念尚未解锁/);
  assert.doesNotMatch(locked, /掌握上述任一科技/);
  props.world.research.nations.qi.unlockedIdeas.push(idea.id);
  assert.match(render(ui.IdeasPanel, props), /安排实行该理念/);
});

test("科技能力倾向、选人及科技组展示按课题权重变化，保留治政与专长的区分", () => {
  const props = fixture();
  const talent = Object.values(props.world.research.talents).find(
    (item) => item.nationId === "qi" && item.role === "research",
  );
  Object.assign(talent, { administration: 80, scholarship: 20, command: 60 });
  const subject = props.content.technologies.find(
    (item) => item.category === "civil",
  );
  subject.attributeWeights = { administration: 1, scholarship: 0.25 };
  assert.equal(
    ui.researchAttributeWeightsLabel(subject),
    "治政 ×1 · 学识 ×0.25",
  );
  assert.equal(
    ui.researchTalentAttributesLabel(talent, subject),
    "治政 80 · 学识 20",
  );
  assert.match(ui.researchLeaderOption(subject, talent), /能力 ×1.35/);
  const html = detail(props, subject);
  assert.match(html, /能力倾向 · 治政 ×1 · 学识 ×0.25/);
  assert.match(html, /治政 80 · 学识 20 · 能力 ×1.35/);
  assert.match(html, /负责人加成/);
  assert.match(html, /专长 ×/);
  const panel = render(ui.ResearchPanel, props);
  assert.match(panel, /治政 80 · 学识 20/);
  subject.attributeWeights = { command: 1 };
  assert.equal(ui.researchTalentAttributesLabel(talent, subject), "统率 60");
  assert.match(
    ui.researchLeaderOption(subject, talent),
    /统率 60 · 能力 ×1.10/,
  );
});

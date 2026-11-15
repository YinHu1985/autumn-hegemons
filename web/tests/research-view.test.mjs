import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["src/game/research/technology-routes.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const { technologyRoutes } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);
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

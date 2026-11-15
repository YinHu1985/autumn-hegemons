import { readFile } from "node:fs/promises";
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { containsPoint } from "../scripts/lib/map-geometry.mjs";

const bundle = await build({
  entryPoints: ["src/game/map/nationLabels.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const { nationLabelPositions } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);
const scenario = JSON.parse(
  await readFile("public/content/base/scenario.json", "utf8"),
);
const warringStates = JSON.parse(
  await readFile("public/content/base/warring-states.json", "utf8"),
);
const geometry = JSON.parse(
  await readFile("public/map/territories.json", "utf8"),
);
const rings = (path) =>
  path
    .split("M")
    .filter(Boolean)
    .map((ring) =>
      ring
        .replace(/Z$/, "")
        .split("L")
        .map((point) => point.split(",").map(Number)),
    );
const inside = (path, point) =>
  rings(path).filter((ring) => containsPoint(ring, point)).length % 2 === 1;

test("国名放在本国陆地，避开湖泊，失城后重排到剩余辖区", () => {
  for (const currentScenario of [scenario, warringStates]) {
    const owners = Object.fromEntries(
      currentScenario.settlements.map((city) => [city.id, city.owner]),
    );
    for (let pass = 0; pass < 2; pass++) {
      const positions = nationLabelPositions(
        geometry,
        currentScenario.settlements,
        owners,
      );
      assert.equal(positions.length, new Set(Object.values(owners)).size);
      for (const position of positions) {
        const point = [position.x, position.y];
        assert.ok(
          geometry.cells.some(
            (cell) =>
              owners[cell.cityId] === position.nationId &&
              containsPoint(cell.points, point),
          ),
          position.nationId,
        );
        assert.ok(
          inside(geometry.landPath, point),
          `${position.nationId} 在陆地`,
        );
        assert.ok(
          !inside(geometry.waterPath, point),
          `${position.nationId} 不在湖泊`,
        );
      }
      owners.linzi = "lu";
      owners.jimo = "lu";
      owners.yingqiu = "lu";
      owners.jinyang = "yan";
    }
  }
});

test("没有可用陆地时隐藏国名，不落到水面；同样输入位置固定", () => {
  const owners = Object.fromEntries(
    scenario.settlements.map((city) => [city.id, city.owner]),
  );
  assert.deepEqual(
    nationLabelPositions(
      { ...geometry, landPath: "" },
      scenario.settlements,
      owners,
    ),
    [],
  );
  assert.deepEqual(
    nationLabelPositions(geometry, scenario.settlements, owners),
    nationLabelPositions(geometry, scenario.settlements, owners),
  );
});

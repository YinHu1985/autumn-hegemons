import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const temporary = await mkdtemp(join(tmpdir(), "autumn-map-camera-"));
after(() => rm(temporary, { recursive: true, force: true }));
const bundled = await build({
  entryPoints: ["src/game/map/camera.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const entry = join(temporary, "camera.mjs");
await writeFile(entry, bundled.outputFiles[0].text);
const {
  zoomCamera,
  screenToWorld,
  fitCamera,
  cameraTranslation,
  clampCamera,
  focusCamera,
  overlayMapInsets,
} = await import(pathToFileURL(entry).href);

const viewport = { width: 1000, height: 650 };
const world = { width: 1800, height: 1500 };

test("cursor zoom preserves the world location under the cursor", () => {
  const original = { x: 930, y: 670, zoom: 1.1 };
  const anchor = { x: 745, y: 225 };
  const before = screenToWorld(anchor, original, viewport);
  const zoomed = zoomCamera(original, 1.3, anchor, viewport, world);
  const after = screenToWorld(anchor, zoomed, viewport);
  assert.ok(Math.abs(before.x - after.x) < 1e-9);
  assert.ok(Math.abs(before.y - after.y) < 1e-9);
  assert.ok(Math.abs(zoomed.zoom - 1.43) < 1e-9);
});

test("fitting cities reserves room for the map title and bottom controls", () => {
  const points = [
    { x: 535, y: 462 },
    { x: 1269, y: 115 },
    { x: 886, y: 727 },
  ];
  const fitted = fitCamera(points, viewport, world);
  const { tx, ty } = cameraTranslation(fitted, viewport);
  for (const point of points) {
    const x = tx + point.x * fitted.zoom;
    const y = ty + point.y * fitted.zoom;
    assert.ok(x > 36 && x < viewport.width - 36);
    assert.ok(y > 76 && y < viewport.height - 104);
  }
});

test("camera limits keep the map reachable even after extreme input", () => {
  const clamped = clampCamera({ x: -1e9, y: 1e9, zoom: 100 }, viewport, world);
  const { tx, ty } = cameraTranslation(clamped, viewport);
  assert.equal(clamped.zoom, 3);
  assert.ok(tx <= 48);
  assert.ok(ty + world.height * clamped.zoom >= viewport.height - 48);
  for (const value of Object.values(clamped)) assert.ok(Number.isFinite(value));
  const tiny = fitCamera(
    [{ x: 800, y: 500 }],
    { width: 180, height: 180 },
    world,
  );
  assert.ok(tiny.zoom > 0);
  for (const value of Object.values(tiny)) assert.ok(Number.isFinite(value));
});

test("explicit city focus lands between floating province and outliner panels", () => {
  const screen = { width: 1097, height: 900 };
  const insets = overlayMapInsets(screen, true);
  const point = { x: 1168, y: 358 };
  const original = { x: 900, y: 650, zoom: 1.2 };
  const focused = focusCamera(original, point, screen, world, insets);
  const { tx, ty } = cameraTranslation(focused, screen);
  const x = tx + point.x * focused.zoom;
  const y = ty + point.y * focused.zoom;
  assert.equal(focused.zoom, original.zoom);
  assert.ok(x > insets.left && x < screen.width - insets.right);
  assert.ok(y > insets.top && y < screen.height - insets.bottom);
});

const battleWorld = { width: 1152, height: 408 };
const battleViewport = { width: 1000, height: 450 };
const battleInsets = { left: 16, right: 16, top: 16, bottom: 16 };
const battlePolicy = {
  panBounds: "edge-center",
  minFitScale: 0.65,
  maxZoom: 2.5,
  fitPadding: { width: 0, height: 0 },
};
const battleCorners = [
  { x: 0, y: 0 },
  { x: battleWorld.width, y: battleWorld.height },
];

test("battle edges can reach the viewport centre to clear floating windows", () => {
  for (const zoom of [0.7, 1, 2.5]) {
    for (const point of [
      { x: 0, y: 0 },
      { x: 0, y: battleWorld.height },
      { x: battleWorld.width, y: 0 },
      { x: battleWorld.width, y: battleWorld.height },
    ]) {
      const camera = clampCamera(
        { ...point, zoom },
        battleViewport,
        battleWorld,
        battleInsets,
        battlePolicy,
      );
      const { tx, ty } = cameraTranslation(camera, battleViewport);
      assert.equal(tx + point.x * camera.zoom, battleViewport.width / 2);
      assert.equal(ty + point.y * camera.zoom, battleViewport.height / 2);
    }
  }
});

test("battle overscroll and zoom limits keep part of the board reachable", () => {
  for (const sign of [-1, 1]) {
    const camera = clampCamera(
      { x: sign * 1e9, y: sign * 1e9, zoom: 100 },
      battleViewport,
      battleWorld,
      battleInsets,
      battlePolicy,
    );
    assert.equal(camera.zoom, 2.5);
    assert.equal(camera.x, sign < 0 ? 0 : battleWorld.width);
    assert.equal(camera.y, sign < 0 ? 0 : battleWorld.height);
    const { tx, ty } = cameraTranslation(camera, battleViewport);
    assert.ok(tx <= battleViewport.width / 2);
    assert.ok(tx + battleWorld.width * camera.zoom >= battleViewport.width / 2);
    assert.ok(ty <= battleViewport.height / 2);
    assert.ok(
      ty + battleWorld.height * camera.zoom >= battleViewport.height / 2,
    );
  }
  const smallest = clampCamera(
    { x: 576, y: 204, zoom: 0.001 },
    battleViewport,
    battleWorld,
    battleInsets,
    battlePolicy,
  );
  assert.equal(smallest.zoom, 0.65 * Math.min(1000 / 1152, 450 / 408));
});

test("battle zoom preserves its cursor anchor independently of strategic map margins", () => {
  const original = { x: 576, y: 204, zoom: 0.9 };
  const anchor = { x: 735, y: 235 };
  const before = screenToWorld(anchor, original, battleViewport);
  const zoomed = zoomCamera(
    original,
    1.4,
    anchor,
    battleViewport,
    battleWorld,
    battleInsets,
    battlePolicy,
  );
  const after = screenToWorld(anchor, zoomed, battleViewport);
  assert.ok(Math.abs(before.x - after.x) < 1e-9);
  assert.ok(Math.abs(before.y - after.y) < 1e-9);
});

test("battle fit uses logical board bounds and repeated resets never shrink it", () => {
  const expected = fitCamera(
    battleCorners,
    battleViewport,
    battleWorld,
    battleInsets,
    battlePolicy,
  );
  assert.equal(expected.zoom, Math.min(968 / 1152, 418 / 408));
  const { tx, ty } = cameraTranslation(expected, battleViewport);
  assert.ok(tx >= 16 && ty >= 16);
  assert.ok(
    tx + battleWorld.width * expected.zoom <= battleViewport.width - 16,
  );
  assert.ok(
    ty + battleWorld.height * expected.zoom <= battleViewport.height - 16,
  );
  for (let i = 0; i < 5; i++) {
    zoomCamera(
      expected,
      2,
      { x: 800, y: 300 },
      battleViewport,
      battleWorld,
      battleInsets,
      battlePolicy,
    );
    const reset = fitCamera(
      battleCorners,
      battleViewport,
      battleWorld,
      battleInsets,
      battlePolicy,
    );
    assert.deepEqual(reset, expected);
  }
});

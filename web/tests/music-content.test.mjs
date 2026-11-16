import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { build } from "esbuild";

async function importSource(path) {
  const bundle = await build({
    entryPoints: [path],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
  );
}

const [{ parseMusicManifest }, preferences] = await Promise.all([
  importSource("src/definitions/music.ts"),
  importSource("src/platform/music-preferences.ts"),
]);
const manifest = JSON.parse(
  await readFile(new URL("../public/music.json", import.meta.url), "utf8"),
);

// SHA-256 of the shipped A/B/C tracks. The two C WAV tracks were transcoded
// to MP3 on 2026-11-16; see docs/asset-audit.md for source and encoding details.
// This test needs only this repository; it never reads the reference projects.
const shippedHashes = {
  courtyard: "887b7d687323d6b1947178373e2780bfd4eb5d83ad70d0109a88da3729348d11",
  jade_river:
    "2de3b0eaf4428b6951068e17d3db0677ccce7367e4589e222a2364d4f8d47c91",
  crimson_chronicles:
    "2325dc8df28c9e50944597be0178047f85ed23dae5c8efe48ad193fa21deb627",
  jade_banners:
    "ac5a8748a8cf6358d0f961a6ca7e43dbf91bfcd5ddbfa94190d6cb9f28599d4a",
  jiashen: "96ced4d8da0bc5379bc3912efa8f90a8659b6ae92d626eeea7f60c82458538ca",
  battle_banners:
    "2666665488efed70f65042c9b9618aa3eb5515ae0548adaa203604b741fe45b4",
};

test("六首本地音乐保持选曲与已验证音频，菜单主题来自大地图且战斗曲独立", async () => {
  const data = parseMusicManifest(manifest);
  assert.equal(data.mainTheme, "courtyard");
  assert.equal(data.battle, "battle_banners");
  assert.ok(data.strategy.includes(data.mainTheme));
  assert.ok(!data.strategy.includes(data.battle));
  assert.deepEqual(
    data.tracks.map((track) => track.id).sort(),
    Object.keys(shippedHashes).sort(),
  );
  let totalBytes = 0;
  for (const track of data.tracks) {
    const bytes = await readFile(
      new URL(`../public/${track.src}`, import.meta.url),
    );
    totalBytes += bytes.length;
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      shippedHashes[track.id],
      track.id,
    );
  }
  assert.equal(totalBytes, 4_938_931);
});

test("音乐定义拒绝不存在的场景引用、重复曲目 ID 和重复播放列表", () => {
  for (const field of ["mainTheme", "battle"]) {
    assert.throws(() =>
      parseMusicManifest({ ...manifest, [field]: "missing" }),
    );
  }
  assert.throws(() =>
    parseMusicManifest({ ...manifest, strategy: ["missing"] }),
  );
  assert.throws(() =>
    parseMusicManifest({
      ...manifest,
      strategy: [manifest.mainTheme, manifest.mainTheme],
    }),
  );
  assert.throws(() =>
    parseMusicManifest({
      ...manifest,
      tracks: [...manifest.tracks, manifest.tracks[0]],
    }),
  );
});

test("音乐路径限定站内相对音频文件，拒绝目录穿越、远程地址和查询参数", () => {
  const track = manifest.tracks[0];
  for (const src of [
    "../outside.mp3",
    "assets/../outside.mp3",
    "/assets/track.mp3",
    "https://example.com/track.mp3",
    "//example.com/track.mp3",
    "assets\\track.mp3",
    "assets/track.mp3?version=1",
    "assets/track.mp3#fragment",
    "assets/track.txt",
  ]) {
    assert.throws(
      () =>
        parseMusicManifest({
          ...manifest,
          tracks: [{ ...track, src }, ...manifest.tracks.slice(1)],
        }),
      src,
    );
  }
});

test("音乐列表和默认音量缺失或不合法时给出校验错误", () => {
  for (const value of [
    null,
    [],
    {},
    { ...manifest, version: 2 },
    { ...manifest, strategy: [] },
    { ...manifest, tracks: [] },
  ]) {
    assert.throws(() => parseMusicManifest(value));
  }
  for (const defaultVolume of [-0.1, 1.1, NaN, Infinity, "0.3", null]) {
    assert.throws(() => parseMusicManifest({ ...manifest, defaultVolume }));
  }
  for (const defaultVolume of [0, 1]) {
    assert.equal(
      parseMusicManifest({ ...manifest, defaultVolume }).defaultVolume,
      defaultVolume,
    );
  }
});

function withStorage(storage, run) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
  try {
    run();
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  }
}

test("设备音乐偏好兼容损坏或不可读的本地存储，音量限制在有效范围", () => {
  for (const [stored, expected] of [
    [null, { enabled: true, volume: 0.3 }],
    ["{broken", { enabled: true, volume: 0.3 }],
    ['{"enabled":"false","volume":"0.8"}', { enabled: true, volume: 0.3 }],
    ['{"enabled":false,"volume":-1}', { enabled: false, volume: 0 }],
    ['{"enabled":true,"volume":10}', { enabled: true, volume: 1 }],
    ['{"enabled":false,"volume":0}', { enabled: false, volume: 0 }],
    ['{"enabled":true,"volume":0.42}', { enabled: true, volume: 0.42 }],
  ]) {
    withStorage({ getItem: () => stored }, () => {
      assert.deepEqual(preferences.readMusicPreferences(0.3), expected);
    });
  }
  withStorage(
    {
      getItem() {
        throw new Error("storage disabled");
      },
    },
    () => {
      assert.deepEqual(preferences.readMusicPreferences(0.3), {
        enabled: true,
        volume: 0.3,
      });
    },
  );
});

test("音乐偏好仅写专用设备键，存储失败不阻塞游戏", () => {
  const writes = [];
  withStorage({ setItem: (...args) => writes.push(args) }, () => {
    preferences.saveMusicPreferences({ enabled: false, volume: 0.2 });
  });
  assert.deepEqual(writes, [
    [preferences.MUSIC_SETTINGS_KEY, '{"enabled":false,"volume":0.2}'],
  ]);
  withStorage(
    {
      setItem() {
        throw new Error("quota exceeded");
      },
    },
    () => {
      assert.doesNotThrow(() =>
        preferences.saveMusicPreferences({ enabled: true, volume: 0.3 }),
      );
    },
  );
});

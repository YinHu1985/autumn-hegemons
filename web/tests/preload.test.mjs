import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["src/platform/preload-assets.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const { createAssetPreloader, parsePreloadManifest, withLoadTimeout } =
  await import(
    `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
  );
const asset = (path, bytes = 4, kind = "image") => ({
  path,
  bytes,
  kind,
  hash: "1234",
});
const setup = (assets, options = {}) =>
  createAssetPreloader({
    baseUrl: "https://example.com/autumn-hegemons/",
    manifest: { version: 1, assets },
    ...options,
  });
const signal = () => new AbortController().signal;
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("resources retain the Pages subpath and streamed audio finishes before it is reusable", async () => {
  let stream;
  let fetched;
  let audioBlob;
  const progress = [];
  const session = setup([asset("assets/audio/theme.mp3", 6, "audio")], {
    fetcher: async (url, options) => {
      assert.equal(options.cache, "no-cache");
      fetched = url;
      return new Response(
        new ReadableStream({
          start(controller) {
            stream = controller;
          },
        }),
        { headers: { "content-type": "audio/mpeg" } },
      );
    },
    createObjectURL: (blob) => {
      audioBlob = blob;
      return "blob:downloaded-track";
    },
    revokeObjectURL() {},
  });
  const running = session.run(signal(), (next) => progress.push(next));
  await tick();
  stream.enqueue(new Uint8Array([1, 2, 3]));
  await tick();
  assert.equal(
    fetched,
    "https://example.com/autumn-hegemons/assets/audio/theme.mp3",
  );
  assert.equal(progress.at(-1).loadedBytes, 3);
  assert.equal(progress.at(-1).completed, 0);
  assert.equal(session.resolveAudio(fetched), fetched);
  stream.enqueue(new Uint8Array([4, 5, 6]));
  stream.close();
  const result = await running;
  assert.equal(result.completed, 1);
  assert.equal(result.loadedBytes, 6);
  assert.equal(session.resolveAudio(fetched), "blob:downloaded-track");
  assert.equal(audioBlob.size, 6);
  assert.equal(audioBlob.type, "audio/mpeg");
  session.dispose();
});

test("concurrency is bounded and retry downloads only failed files", async () => {
  const calls = [];
  const pending = [];
  const session = setup([asset("a.png"), asset("b.png"), asset("c.png")], {
    concurrency: 2,
    fetcher: (url) => {
      calls.push(url);
      return new Promise((resolve) => pending.push(resolve));
    },
  });
  const running = session.run(signal(), () => {});
  await tick();
  assert.equal(calls.length, 2);
  pending.shift()(new Response(new Uint8Array(4)));
  await tick();
  assert.equal(calls.length, 3);
  pending.shift()(new Response("missing", { status: 404 }));
  pending.shift()(new Response(new Uint8Array(4)));
  const first = await running;
  assert.equal(first.completed, 2);
  assert.deepEqual(
    first.failures.map((failure) => failure.path),
    ["b.png"],
  );
  const retry = session.run(signal(), () => {});
  await tick();
  assert.equal(calls.length, 4);
  assert.ok(calls.at(-1).endsWith("/b.png"));
  pending.shift()(new Response(new Uint8Array(4)));
  const retried = await retry;
  assert.equal(retried.completed, 3);
  assert.equal(retried.loadedBytes, 12);
  assert.deepEqual(retried.failures, []);
});

test("cached responses without Content-Length still complete full byte progress", async () => {
  const session = setup([asset("picture.png", 80)], {
    fetcher: async () => new Response(new Uint8Array(80)),
  });
  const result = await session.run(signal(), () => {});
  assert.equal(result.loadedBytes, 80);
  assert.equal(result.totalBytes, 80);
  assert.equal(result.completed, 1);
  assert.deepEqual(result.failures, []);
});

test("a stalled request times out and can be retried instead of trapping startup", async () => {
  const session = setup([asset("picture.png")], {
    timeoutMs: 15,
    fetcher: () => new Promise(() => {}),
  });
  const result = await session.run(signal(), () => {});
  assert.equal(result.completed, 0);
  assert.match(result.failures[0].message, /超时/);
});

test("timeouts include stalled response bodies and release the stream", async () => {
  let cancelled = false;
  const session = setup([asset("picture.png")], {
    timeoutMs: 15,
    fetcher: async () =>
      new Response(
        new ReadableStream({
          cancel() {
            cancelled = true;
          },
        }),
      ),
  });
  const result = await session.run(signal(), () => {});
  assert.match(result.failures[0].message, /超时/);
  assert.equal(cancelled, true);
});

test("abort cancels startup and disposal releases retained audio", async () => {
  const abort = new AbortController();
  const pending = withLoadTimeout(
    () => new Promise(() => {}),
    abort.signal,
    1000,
  );
  abort.abort();
  await assert.rejects(pending, { name: "AbortError" });
  const released = [];
  const session = setup([asset("track.mp3", 4, "audio")], {
    fetcher: async () => new Response(new Uint8Array(4)),
    createObjectURL: () => "blob:theme",
    revokeObjectURL: (url) => released.push(url),
  });
  await session.run(signal(), () => {});
  session.dispose();
  session.dispose();
  assert.deepEqual(released, ["blob:theme"]);
});

test("asset manifests reject traversal, remote paths and duplicate definitions", () => {
  assert.throws(() =>
    parsePreloadManifest({ version: 1, assets: [asset("../secret.png")] }),
  );
  assert.throws(() =>
    parsePreloadManifest({
      version: 1,
      assets: [asset("https://elsewhere/picture.png")],
    }),
  );
  assert.throws(() =>
    parsePreloadManifest({
      version: 1,
      assets: [asset("a.png"), asset("a.png")],
    }),
  );
  assert.throws(() =>
    parsePreloadManifest({ version: 1, assets: [asset("a.png", -1)] }),
  );
  assert.deepEqual(
    parsePreloadManifest({ version: 1, assets: [asset("assets/a.png")] })
      .assets[0].path,
    "assets/a.png",
  );
});

test("designer asset names support Chinese, spaces and dotted directories safely", async () => {
  const path = "assets/portraits.v2/孔子 晚年.webp";
  const manifest = parsePreloadManifest({ version: 1, assets: [asset(path)] });
  let fetched;
  const session = setup(manifest.assets, {
    fetcher: async (url) => {
      fetched = url;
      return new Response(new Uint8Array(4));
    },
  });
  await session.run(signal(), () => {});
  assert.equal(
    fetched,
    new URL(path, "https://example.com/autumn-hegemons/").href,
  );
  for (const unsafe of [
    "/absolute.png",
    "//remote/a.png",
    "a/./b.png",
    "a//b.png",
    "a/%2e%2e/b.png",
    "a.png?x=1",
    "a.png#fragment",
    "a\\b.png",
    "a\nb.png",
  ])
    assert.throws(
      () => parsePreloadManifest({ version: 1, assets: [asset(unsafe)] }),
      unsafe,
    );
});

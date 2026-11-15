import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["src/platform/music-player.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const { createMusicPlayer } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);

const manifest = {
  version: 1,
  defaultVolume: 0.3,
  mainTheme: "theme",
  battle: "battle",
  strategy: ["theme", "river", "court"],
  tracks: ["theme", "river", "court", "battle"].map((id) => ({
    id,
    title: `${id} title`,
    src: `assets/audio/${id}.mp3`,
  })),
};

class FakeAudio extends EventTarget {
  src = "";
  currentTime = 0;
  volume = 1;
  loop = false;
  preload = "auto";
  paused = true;
  ended = false;
  playCalls = 0;
  loadCalls = 0;
  responses = [];
  play() {
    this.playCalls += 1;
    const response = this.responses.shift();
    if (response) return response();
    this.paused = false;
    this.ended = false;
    this.dispatchEvent(new Event("playing"));
    return Promise.resolve();
  }
  pause() {
    const changed = !this.paused;
    this.paused = true;
    if (changed) this.dispatchEvent(new Event("pause"));
  }
  finish() {
    this.paused = true;
    this.ended = true;
    this.dispatchEvent(new Event("ended"));
  }
  removeAttribute(name) {
    if (name === "src") this.src = "";
  }
  load() {
    this.loadCalls += 1;
  }
}

function setup(options = {}) {
  const audios = [];
  let changes = 0;
  const player = createMusicPlayer({
    manifest,
    baseUrl: "/autumn-hegemons/",
    onChange: () => (changes += 1),
    createAudio: () => {
      const audio = new FakeAudio();
      options.configure?.(audio, audios.length);
      audios.push(audio);
      return audio;
    },
    ...options,
  });
  return { player, audios, changes: () => changes };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));
const namedError = (name) => Object.assign(new Error(name), { name });

test("首次交互前不下载或播放音乐，解锁后主题循环且使用 Pages 资源前缀", async () => {
  const { player, audios } = setup();
  player.setScene("title");
  assert.equal(player.getSnapshot().status, "locked");
  assert.equal(audios.length, 0);
  player.unlock();
  await settle();
  assert.equal(audios[0].src, "/autumn-hegemons/assets/audio/theme.mp3");
  assert.equal(audios[0].preload, "none");
  assert.equal(audios[0].loop, true);
  assert.equal(audios[0].volume, 0.3);
  assert.equal(player.getSnapshot().status, "playing");
  assert.equal(player.getSnapshot().title, "theme title");
  player.dispose();
});

test("主题进入地图可接着播放同一曲，地图曲终顺序切换并循环整个列表", async () => {
  const { player, audios } = setup();
  player.setScene("title");
  player.unlock();
  await settle();
  audios[0].currentTime = 14;
  player.setScene("strategy");
  assert.equal(audios.length, 1);
  assert.equal(audios[0].currentTime, 14);
  assert.equal(audios[0].playCalls, 1);
  assert.equal(audios[0].loop, false);
  audios[0].finish();
  await settle();
  assert.equal(player.getSnapshot().trackId, "river");
  audios[1].finish();
  await settle();
  assert.equal(player.getSnapshot().trackId, "court");
  audios[2].finish();
  await settle();
  assert.equal(player.getSnapshot().trackId, "theme");
  assert.equal(audios[0].currentTime, 0);
  assert.equal(audios.filter((audio) => !audio.paused).length, 1);
  player.dispose();
});

test("战斗使用专曲循环，退出战斗恢复原地图曲位置，同场景更新不重启", async () => {
  const { player, audios } = setup();
  player.setScene("strategy");
  player.unlock();
  player.next();
  await settle();
  const mapAudio = audios[1];
  mapAudio.currentTime = 31;
  player.setScene("battle");
  await settle();
  const battleAudio = audios[2];
  assert.equal(player.getSnapshot().trackId, "battle");
  assert.equal(battleAudio.loop, true);
  assert.equal(mapAudio.paused, true);
  const calls = battleAudio.playCalls;
  player.setScene("battle");
  player.unlock();
  assert.equal(battleAudio.playCalls, calls);
  player.setScene("strategy");
  await settle();
  assert.equal(player.getSnapshot().trackId, "river");
  assert.equal(mapAudio.currentTime, 31);
  assert.equal(mapAudio.paused, false);
  assert.equal(battleAudio.paused, true);
  player.dispose();
});

test("静音、零音量、后台和编辑器暂停，恢复后保持进度", async () => {
  const { player, audios } = setup();
  player.setScene("strategy");
  player.unlock();
  await settle();
  const audio = audios[0];
  audio.currentTime = 17;
  for (const [stop, resume] of [
    [() => player.setEnabled(false), () => player.setEnabled(true)],
    [() => player.setVolume(0), () => player.setVolume(0.45)],
    [() => player.setHidden(true), () => player.setHidden(false)],
    [() => player.setScene(null), () => player.setScene("strategy")],
  ]) {
    stop();
    assert.equal(audio.paused, true);
    assert.equal(player.getSnapshot().status, "paused");
    resume();
    await settle();
    assert.equal(audio.paused, false);
    assert.equal(audio.currentTime, 17);
  }
  player.dispose();
});

test("浏览器拒绝自动播放后保留主题，可在下一次交互重试", async () => {
  const { player, audios } = setup({
    configure: (audio) => {
      audio.responses.push(() => Promise.reject(namedError("NotAllowedError")));
    },
  });
  player.setScene("title");
  player.unlock();
  await settle();
  assert.equal(player.getSnapshot().status, "locked");
  assert.equal(player.getSnapshot().trackId, "theme");
  player.unlock();
  await settle();
  assert.equal(player.getSnapshot().status, "playing");
  assert.equal(audios[0].playCalls, 2);
  player.dispose();
});

test("延迟完成的 play 不会复活已离开的场景，也不覆盖当前状态", async () => {
  let resolveOld;
  const { player, audios } = setup({
    configure: (audio, index) => {
      if (index === 0)
        audio.responses.push(
          () => new Promise((resolve) => (resolveOld = resolve)),
        );
    },
  });
  player.setScene("strategy");
  player.unlock();
  player.setScene("battle");
  await settle();
  audios[0].paused = false;
  resolveOld();
  await settle();
  assert.equal(audios[0].paused, true);
  assert.equal(audios[1].paused, false);
  assert.equal(player.getSnapshot().trackId, "battle");
  assert.equal(player.getSnapshot().status, "playing");
  player.dispose();
});

test("旧 play 的拒绝不会锁住新场景，再返回原曲也不会被旧完成回调暂停", async () => {
  let rejectOld;
  const { player, audios } = setup({
    configure: (audio, index) => {
      if (index === 0)
        audio.responses.push(
          () => new Promise((_, reject) => (rejectOld = reject)),
        );
    },
  });
  player.setScene("strategy");
  player.unlock();
  player.setScene("battle");
  player.setScene("strategy");
  await settle();
  rejectOld(namedError("NotAllowedError"));
  await settle();
  assert.equal(player.getSnapshot().status, "playing");
  assert.equal(audios[0].paused, false);
  assert.equal(audios[1].paused, true);
  player.dispose();
});

test("关闭音乐期间即使旧 play 完成或触发 playing 也会被暂停", async () => {
  let finish;
  const { player, audios } = setup({
    configure: (audio) => {
      audio.responses.push(() => new Promise((resolve) => (finish = resolve)));
    },
  });
  player.setScene("title");
  player.unlock();
  player.setEnabled(false);
  audios[0].paused = false;
  audios[0].dispatchEvent(new Event("playing"));
  finish();
  await settle();
  assert.equal(audios[0].paused, true);
  assert.equal(player.getSnapshot().status, "paused");
  assert.equal(player.getSnapshot().enabled, false);
  player.dispose();
});

test("无效资源顺序跳过，全部损坏后有限停止而不是不断请求", async () => {
  const { player, audios } = setup({
    configure: (audio) => {
      audio.responses.push(() =>
        Promise.reject(namedError("NotSupportedError")),
      );
    },
  });
  player.setScene("strategy");
  player.unlock();
  await settle();
  assert.equal(audios.length, 3);
  assert.equal(
    audios.reduce((sum, audio) => sum + audio.playCalls, 0),
    3,
  );
  assert.equal(player.getSnapshot().status, "error");
  player.unlock();
  player.next();
  await settle();
  assert.equal(
    audios.reduce((sum, audio) => sum + audio.playCalls, 0),
    3,
  );
  player.dispose();
});

test("单曲主题损坏不会误切入地图列表，非当前音轨错误不打断战斗", async () => {
  const { player, audios } = setup();
  player.setScene("title");
  player.unlock();
  await settle();
  audios[0].dispatchEvent(new Event("error"));
  assert.equal(player.getSnapshot().status, "error");
  assert.equal(audios.length, 1);
  player.setScene("battle");
  await settle();
  audios[0].dispatchEvent(new Event("error"));
  assert.equal(player.getSnapshot().status, "playing");
  assert.equal(player.getSnapshot().trackId, "battle");
  player.dispose();
});

test("音量限定合法范围，保存的关闭偏好在首次交互后仍保持关闭", async () => {
  const { player, audios } = setup({
    preferences: { enabled: false, volume: 0.7 },
  });
  player.setScene("title");
  player.unlock();
  assert.equal(audios.length, 0);
  player.setEnabled(true);
  await settle();
  assert.equal(audios[0].volume, 0.7);
  player.setVolume(10);
  assert.equal(audios[0].volume, 1);
  player.setVolume(Number.NaN);
  assert.equal(player.getSnapshot().volume, 1);
  player.setVolume(-1);
  assert.equal(player.getSnapshot().volume, 0);
  assert.equal(audios[0].paused, true);
  player.dispose();
});

test("销毁卸下事件和资源，晚到的 Promise 及外部调用都不能复活播放器", async () => {
  let finish;
  const { player, audios, changes } = setup({
    configure: (audio) => {
      audio.responses.push(() => new Promise((resolve) => (finish = resolve)));
    },
  });
  player.setScene("title");
  player.unlock();
  player.dispose();
  const notices = changes();
  audios[0].paused = false;
  finish();
  await settle();
  audios[0].dispatchEvent(new Event("ended"));
  audios[0].dispatchEvent(new Event("error"));
  player.unlock();
  player.setScene("battle");
  player.next();
  player.dispose();
  assert.equal(audios.length, 1);
  assert.equal(audios[0].paused, true);
  assert.equal(audios[0].src, "");
  assert.equal(audios[0].loadCalls, 1);
  assert.equal(changes(), notices);
});

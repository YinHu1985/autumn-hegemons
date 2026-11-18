import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["src/game/events/event-notifications.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
});
const {
  eventNotificationReducer: reduce,
  initialEventNotifications: initial,
  pendingReports,
} = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);
const report = (id, important = false) => ({
  event: {
    id,
    definitionId: id,
    nationId: "qi",
    context: { nationId: "qi" },
    createdAt: 0,
    expiresAt: 30,
  },
  important,
});
const ordinary = report("harvest");
const important = report("reform", true);
const other = report("warehouse");

test("普通奏报留待议，重要奏报仅提醒一次；关闭不处置任何事件", () => {
  assert.equal(
    reduce(initial, { type: "sync", pending: [ordinary], blocked: false }),
    initial,
  );
  const pending = [ordinary, important];
  const before = structuredClone(pending);
  let state = reduce(initial, { type: "sync", pending, blocked: false });
  assert.equal(state.selectedId, important.event.id);
  state = reduce(state, { type: "close", pending });
  assert.equal(state.selectedId, null);
  assert.equal(reduce(state, { type: "sync", pending, blocked: false }), state);
  assert.deepEqual(pending, before);
  state = reduce(state, { type: "open", pending, id: ordinary.event.id });
  assert.equal(state.selectedId, ordinary.event.id);
});

test("关闭一批重要奏报可真正暂缓；后续新到的重要奏报仍会提醒", () => {
  const nextImportant = report("new-law", true);
  const pending = [ordinary, important, nextImportant];
  let state = reduce(initial, { type: "sync", pending, blocked: false });
  state = reduce(state, { type: "close", pending });
  assert.equal(reduce(state, { type: "sync", pending, blocked: false }), state);
  const fresh = report("fresh-report", true);
  state = reduce(state, {
    type: "sync",
    pending: [...pending, fresh],
    blocked: false,
  });
  assert.equal(state.selectedId, fresh.event.id);
});

test("战术、系统菜单与地图点选不抢焦点，恢复后再展示未提醒事件", () => {
  const pending = [ordinary, important];
  let state = reduce(initial, { type: "sync", pending, blocked: true });
  assert.equal(state, initial);
  state = reduce(state, { type: "sync", pending, blocked: false });
  assert.equal(state.selectedId, important.event.id);
  assert.equal(reduce(state, { type: "sync", pending, blocked: true }), state);
});

test("在阅览普通奏报时新来的重要奏报不会替换当前选择", () => {
  const state = reduce(initial, { type: "open", pending: [ordinary] });
  assert.equal(
    reduce(state, {
      type: "sync",
      pending: [ordinary, important],
      blocked: false,
    }),
    state,
  );
});

test("处置后按当前队列顺序继续，末尾循环到剩余首项，全部处理后关闭", () => {
  const pending = [ordinary, important, other];
  let state = reduce(initial, {
    type: "open",
    pending,
    id: important.event.id,
  });
  state = reduce(state, {
    type: "resolved",
    pending,
    nextPending: [ordinary, other],
  });
  assert.equal(state.selectedId, other.event.id);
  state = reduce(state, {
    type: "resolved",
    pending: [ordinary, other],
    nextPending: [ordinary],
  });
  assert.equal(state.selectedId, ordinary.event.id);
  state = reduce(state, {
    type: "resolved",
    pending: [ordinary],
    nextPending: [],
  });
  assert.equal(state.selectedId, null);
});

test("前后切换仅改变呈现选择，不改变队列", () => {
  const pending = [ordinary, important, other];
  let state = reduce(initial, { type: "open", pending, id: ordinary.event.id });
  state = reduce(state, { type: "step", pending, direction: -1 });
  assert.equal(state.selectedId, other.event.id);
  state = reduce(state, { type: "step", pending, direction: 1 });
  assert.equal(state.selectedId, ordinary.event.id);
  assert.deepEqual(
    pending.map((entry) => entry.event.id),
    ["harvest", "reform", "warehouse"],
  );
});

test("世界结算使已选事件失效时清空选择，无效链接不会开启其他事件", () => {
  const state = reduce(initial, {
    type: "open",
    pending: [ordinary, important],
    id: ordinary.event.id,
  });
  assert.equal(
    reduce(state, { type: "sync", pending: [other], blocked: false })
      .selectedId,
    null,
  );
  assert.equal(
    reduce(state, { type: "sync", pending: [important], blocked: true })
      .selectedId,
    null,
  );
  assert.equal(
    reduce(initial, { type: "open", pending: [ordinary], id: "missing" }),
    initial,
  );
});

test("待议队列过滤其他国家与缺失定义，切换国家后不保留旧国家选择", () => {
  const foreign = report("foreign", true);
  foreign.event.nationId = "lu";
  const content = {
    events: [ordinary, important, foreign].map((entry) => ({
      id: entry.event.definitionId,
      presentation: { important: entry.important },
    })),
  };
  const world = {
    playerNationId: "qi",
    civic: {
      events: [
        ordinary.event,
        important.event,
        foreign.event,
        report("missing-definition").event,
      ],
    },
  };
  const pending = pendingReports(content, world);
  assert.deepEqual(
    pending.map((entry) => entry.event.id),
    ["harvest", "reform"],
  );
  let state = reduce(initial, { type: "open", pending, id: ordinary.event.id });
  const nextPending = pendingReports(content, {
    ...world,
    playerNationId: "lu",
  });
  assert.deepEqual(
    nextPending.map((entry) => entry.event.id),
    ["foreign"],
  );
  state = reduce(state, { type: "sync", pending: nextPending, blocked: false });
  assert.equal(state.selectedId, foreign.event.id);
});

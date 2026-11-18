# 事件系统：内容、触发与结算

2026-11-18 实施。事件定义在 `web/public/content/base/events.json`，月度随机池在 `event-pools.json`。两者由内容清单加载，也能在内容工坊编辑。持续效果仍使用 `modifier-definitions.json`，不在事件模块另造效果解释器。

## 给内容作者的约定

- **效果 ID ＋作用对象**决定额外 modifier 的刷新、替换与移除。来源仅供显示和追溯，后续事件直接写前一事件使用的 `modifierId`；不配置 `chainId`，也不需要知道运行实例编号。
- 同一效果在齐国和鲁国、临淄和曲阜分别管理。不同故事需要互不干扰时，给效果定义不同 ID；显示名称可以相近。
- 事件也有稳定 ID，选项和概率结果另有稳定 ID。事件发生实例 ID 仅用于待办、存档和界面，不参与内容里的效果寻址。
- 内容只能使用已登记条件、数值变量和动作，不接受 JavaScript、任意世界属性路径或回调。

## 定义一份奏报

```json
{
  "id": "warehouse_completed",
  "title": "新仓落成",
  "description": "{{settlement}}的新仓已经完工，仓吏请示是否整顿仓务。",
  "weight": 1,
  "duration": 30,
  "triggers": [
    { "type": "fact", "fact": "construction_completed", "subjectId": "warehouse" }
  ],
  "target": { "kind": "settlement" },
  "repeat": { "scope": "settlement", "cooldownDays": 720 },
  "options": [
    { "id": "routine", "label": "依旧章收纳", "description": "照常启用。", "effects": [] },
    {
      "id": "reorganize", "label": "拨粮整顿仓务", "description": "改进当地治理。",
      "cost": { "grain": 20 },
      "effects": [{ "type": "governance", "amount": 0.03 }],
      "aiWeight": 2
    }
  ]
}
```

`duration` 是作出决定的游戏日数，按创建时的绝对日序计算。第一项必须不带 `condition`、`cost`，到期自动执行；可以有确定的损失，例如灾害扣除至多若干存粮。强制损失不是购买费用。自愿“支付后获得收益”必须使用 `cost`，不以负数 `grain` 代替。

`cost` 支持粮食与全国人力，可用统一数值表达式。选择时重验当前条件、对象和完整费用，再一次提交费用、随机结果、效果和待办移除；不足不扣费，也不发奖。AI 使用同一命令，只在合法选项间按 `aiWeight` 抽取（默认 1，0 表示不主动选）。

选项可加 `outcomes: [{id,weight,effects}, ...]`，其中一项按相对权重执行；先执行选项公共 `effects`，再执行选中的结果。随机数保存在世界内。历史保存实际执行值，例如人力被上限截断后的增量、实际扣粮和启发对应的课题，不靠重新读定义推算过去。

## 三种触发入口

| 配置 | 检查时机与含义 |
| --- | --- |
| `{ "type": "random", "poolId": "common" }` | 每月每个存活国家，先按池的 `chance` 判断是否抽签，再从符合条件的事件中按 `weight` 选一个 |
| `{ "type": "fact", "fact": "research_completed", "subjectId": "copper_2" }` | 领域逻辑完成后发出事实，统一处理；省略 `subjectId` 则接收此类全部事实 |
| `{ "type": "date", "date": { "year": -760, "month": 1, "day": 1 } }` | 指定日期检查一次，游戏开始之前的日期不补发；不满足条件会留下取消记录 |
| `triggers: []` | 不主动触发，只接受其他效果安排的后续事件或开发测试入口 |

事实类型包括 `research_completed`、`construction_completed`、`battle_resolved`、`settlement_captured`、`diplomacy_completed`。`subjectId` 分别是科技 ID、建筑 ID（扩建为 `__expand`）、战役实例 ID、城镇 ID、外交行动 ID。战斗结束分别向双方发出事实；世界结算后统一检查，不在点击窗口、战斗动画或读档时重复通知。

多个事件可以同时进入待办。没有“今天已经发生一次事件”之类的全国通用锁，限制由各自 `repeat` 决定。随机池当前只有 `common`，月概率暂定 0.22；以后可以添加经济、人才等池。扩充某个池的内容数量不会提高该池总发生率，城镇多也不会获得更多事件抽签名额。

`weightModifiers: [{condition,multiplier}]` 修改随机事件权重。先选择事件，再在其合格对象中抽取一个；不会因一个事件拥有更多候选城镇而倍增发生机会。事实触发与定期事件不使用随机池权重。

## 条件、对象和次数

条件支持 `{all:[...]}`、`{any:[...]}`、`{not:...}`，叶子类型如下：

| `type` | 主要字段 |
| --- | --- |
| `metric` | `metric`、`compare`、`value`；指标只用统一表达式白名单，如 `nation.treasury`、`settlement.governance` |
| `technology` | `technologyId` |
| `idea_unlocked` / `idea_enacted` | `ideaId` |
| `building` | `buildingId`、`compare`、`value`，检查绑定城镇等级 |
| `terrain` / `specialty` | `terrainId` / `specialtyId` |
| `relation` | `compare`、`value`，可写 `nationId`，否则使用绑定的相关国家 |
| `flag` | `flagId`、可选 `value`（默认 true）、可选 `target` |
| `event_count` | `eventId`、`scope`、`compare`、`value` |
| `modifier` | `modifierId`、可选 `target`，只检查目标上未过期的额外效果 |

比较符为 `eq/ne/gt/gte/lt/lte`。缺少必要上下文属于无效条件，在 `not` 内也不能反转成通过。

`condition` 检查事件是否能创建，`target.condition` 筛选作用对象，`options[].condition` 检查当前选项是否可执行。创建后的事件不因初始触发条件变化而撤回；但选项条件、费用和绑定对象仍在决策时重验。

`target.kind` 支持 `settlement`、`related_nation`、`talent`。仅显式声明的目标成为事件绑定：事实已提供相应对象时沿用，否则创建时在符合条件的对象中选一次。事实附带的其他对象不会成为隐含存续条件。绑定对象进入存档，重新打开、读档、等待后续均不重抽。城镇易主、人才退场、相关国家灭亡时取消事件并记录原因，不悄悄换一个对象。普通国家事件不必声明 `target`。

文本占位符为 `{{nation}}`、`{{settlement}}`、`{{relatedNation}}`、`{{talent}}`，按普通文本替换，不解释 HTML。

`repeat.scope` 为 `nation/settlement/world`，可设置 `once`、`cooldownDays`，以及同组的 `group`、`groupCooldownDays`。默认按城镇目标计城镇次数，其他按国家。发生次数在进入待办时记录，不等玩家决定；放弃或取消也算已经发生，避免反复刷事件。同一事件同一范围有待办时不重复创建。次数不随可见历史裁剪而丢失。

## 后续事件与通用动作

```json
[
  { "type": "add_modifier", "modifierId": "foundry_trial_disruption", "target": { "kind": "settlement" }, "durationDays": 180 },
  { "type": "set_flag", "flagId": "foundry_trial_funded", "value": true, "target": { "kind": "settlement" } },
  { "type": "schedule_event", "eventId": "foundry_trial_result", "delayDays": 90 }
]
```

`schedule_event` 继承后续定义实际需要的绑定对象，存储实际到期日；后续纯国家事件不继承无关的城镇或人才依赖。到期条件不满足时默认取消；可以同时设置 `retryDays` 和 `retryUntilDays`，在有限窗口内重试。后者表示原到期日之后额外允许等待多少天，须不小于重试间隔。对象失效立即取消，不靠重试更换对象。

后续事件直接以 `remove_modifier` 移除同一对象的 `foundry_trial_disruption`，不需要前一事件的来源或实例编号。`set_flag` 以标志 ID＋国家／城镇管理；`value:false` 清除。`relation` 动作用 `amount` 改变与 `nationId` 或绑定相关国家的关系，仍受外交上下限约束，表达式结果四舍五入为整数。这些动作都由同一 `applyEffects` 执行，科技、理念也可配置；需要对象时必须明确提供有效上下文或目标。

当前内容包含原有五类民间事件、仓廪告急、新仓落成、礼成回报和新炉试制两段事件。新炉链由 `copper_2` 完成触发，在拥有 `copperworks` 的本国城镇绑定一次，允许付粮试制，90 日后选择生产改善或研究启发；暂定数值用于验证机制。

## 界面、时钟与存档

奏报使用独立的小型通知弹框，宽约 600px，配图高 170px；不套用顶栏政令窗口，不加全屏遮罩，也不替换正在查看的科研、内政或省份。长内容在弹框内部滚动。顶部“纪事”只保留待办和历史列表，点击待办后打开弹框；地图上的待议入口可直接打开奏报。

普通奏报进入待办；重要奏报可配置 `presentation.important:true`，首次通知时自动弹出并暂停。手动战斗、待决战、系统菜单和地图点选期间延后展示。一次显示一份，弹框提供数量与前后切换；处理后可继续看下一份，关闭仅暂缓处理。打开奏报即暂停，处理完或关窗不会替玩家恢复时间；Esc 优先关闭奏报，空格不会在阅读时继续时间。可配置 `presentation.image` 与 `speaker`，没有配图时使用已有城景。

游戏日推进才会缩短决定期限，暂停和阅读不会消耗天数。月底先完成科研、财政和建筑运行状态，再检查相关事实与月度随机事件；日常推进后处理到期、后续和日期事件。AI 决策不受玩家是否阅读奏报影响。

存档版本 10 保存待办、延迟队列、次数、组冷却、标志、日期检查记录、随机种子、序号和执行历史。读档仅恢复结果，不重放动作。可见事件历史与普通纪事各保留全世界最近 160 条，发生次数与 once 记录独立保留；不兼容旧版存档。

## 代码边界

| 模块 | 职责 |
| --- | --- |
| `definitions/conditions.ts`、`events.ts`、`event-references.ts` | JSON 语法、上下文及跨文件引用校验 |
| `simulation/conditions.ts` | 纯条件求值与失败原因 |
| `simulation/events/state.ts` | 保存结构、绑定对象、随机数、标志和调度登记 |
| `simulation/events/triggers.ts` | 候选、权重、次数冷却与事实消费 |
| `simulation/events/scheduler.ts` | 到期默认、延迟跟进、日期检查、显式取消 |
| `simulation/events/commands.ts` | 原子决策、费用、实际结果与 AI 共用入口 |
| `simulation/effects.ts` | 所有来源共用的一次性动作执行；返回实际效果 |
| `game/events/`、`EventsPanel.tsx` | 独立奏报弹框、通知队列与纪事列表；不负责触发或结算规则 |
| `platform/validate-event-save.ts` | 恢复状态校验，不执行事件 |

首版不提供任意脚本、军团局部 modifier、运行中动态新建事件定义或自动生成故事链。后续扩充数值、事件和普通条件组合只需修改内容；新增领域机制仍应增加具名注册条件或动作，并接入真实结算位置。

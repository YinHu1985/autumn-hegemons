# 统一效果与 modifier 配置

2026-11-18 更新。本文描述当前 JSON、运行接口及显示规则；早期架构示例不作为可直接导入的格式。现有科技、理念、事件共用下述能力，未来政策可复用同一个入口。

## 内容从哪里配置

| 内容 | 位置 | 生效时机 |
| --- | --- | --- |
| 科技常规加成 | `technologies.json` 的 `effects` | 已掌握时派生 |
| 科技完成动作 | `completionEffects` | 完成研究时执行一次；初始已知科技在新建世界时执行一次 |
| 理念常规加成 | `ideas.json` 的 `effects` | 正在实行时派生，卸下即停止 |
| 理念动作 | `enactEffects` / `repealEffects`，可选 | 每次明确挂载／卸下时执行 |
| 事件选项动作 | `events.json` 的 `options[].effects` | 玩家选择或超时默认选择时执行一次 |
| 额外持续效果定义 | `modifier-definitions.json` | 通过 `add_modifier` 创建实例后生效 |

清单键是 `modifierDefinitions`，内容工坊提供“额外效果”分类。科技／理念常规贡献不复制成持久实例，因此不会重复计算。顾问和建筑的实际贡献同样送入统一数值查询；建筑词条目前仍限科研效率、科研规模、人力和城防四项数字定义。

## 一次性动作

```json
[
  { "type": "grain", "amount": 40 },
  { "type": "manpower", "amount": 700 },
  { "type": "governance", "amount": 0.03 },
  { "type": "research", "amount": 40, "targetId": "agriculture_2" },
  { "type": "unlock_idea", "ideaId": "idea_youjiao_wulei" },
  { "type": "add_modifier", "modifierId": "canal_repair", "durationDays": 180 }
]
```

示例中的 ID 必须换成包内真实定义；加载时检查引用。`grain` 改国库粮食，`manpower` 改可征人力且遵守上限；`governance` 改本国各城治理，下降时按容量损失比例缩减人力。`research` 提供受启发上限约束的研究启发，不填 `targetId` 则作用当前所有课题。`unlock_idea` 只让理念可选择，不自动挂载。

一次收益直接写世界状态，不保存在 modifier 中。存档保存结果，读档只还原，既不执行完成动作，也不重放事件。没有额外的奖励防重账本。

## 额外状态的定义和期限

```json
{
  "id": "canal_repair",
  "name": "渠堰整修",
  "description": "农业增益随本期产业维护覆盖变化。",
  "scope": "nation",
  "effects": {
    "production.agriculture": {
      "op": "multiply",
      "args": [0.05, { "metric": "nation.operatingCoverage.buildings" }]
    }
  },
  "stacking": "refresh"
}
```

定义另可设置 `icon` 与 `showInAdministration`。实例保存定义 ID、独立实例 ID、来源、实际目标、开始日序和 `expiresAt`，不把最终数值当权威状态保存。

`add_modifier` 可指定 `durationDays` 或绝对 `expiresAt`，两者互斥。都不填时使用统一远期日序，当前设为公元 10000 年 1 月 1 日。没有 `Infinity`、空期限或永久标志。日历为每月 30 日、每年 360 日，前 1 年后直接为公元 1 年；`modifier-clock.ts` 提供日期换算。

当前日序大于等于 `expiresAt` 时立刻停止参与查询；每日日期推进后清理实例。月末先按当日已有状态结算，进入下月第一日再清理到期项，不追溯改写已结算收入。实例过期后，已掌握科技不会再次创建它。

叠加规则：

- `refresh`：同效果 ID、同目标更新为本次开始与到期时间，保留实例编号，来源更新为本次施加者。不同来源不会制造重复叠层。
- `stack`：每次新建独立实例。
- `replace`：移除该目标上所有同定义实例，再创建本次实例。

移除动作：

```json
{ "type": "remove_modifier", "modifierId": "canal_repair" }
```

按效果 ID＋作用对象移除全部匹配实例，包括叠层；不检查来源，不影响其他国家或城镇。`sourceOnly` 已删除，不使用 `chainId`。不同故事应配置不同效果 ID，后续事件直接引用原效果 ID。常规理念卸下立即不再贡献，但其动作产生的额外实例保留自身期限；需要撤销时，在 `repealEffects` 显式配置移除。反复启用会再次执行启用动作，因此可重复的一次奖励需要由玩法设计约束，系统不会假定只发一次。

## 国家与城镇范围

国家范围默认目标为动作所属国家；可显式指定 `target: { "kind": "nation", "id": "qi" }`。城镇状态定义用 `scope: "settlement"`，动作例如：

```json
{
  "type": "add_modifier",
  "modifierId": "local_relief",
  "target": { "kind": "settlement", "id": "linzi" },
  "durationDays": 90
}
```

科技、理念入口默认只有国家上下文，城镇目标须提供真实城镇 ID。声明 `target.kind: "settlement"` 的事件绑定具体城镇，动作可省略目标 ID；后续事件继承对象，不重抽。局部实例只作用该城，国家效果在该城计算中加入一次。城镇易主后局部实例随城保留，动态国家指标读新所有者；来源保留原始记录。需要其他占领行为时，应在占领规则中显式移除。

收入、生产、人力、治理及建设支持国家或城镇范围。科研、军团和理念席位目前仅国家范围；城防仅城镇范围。`production.<route>` 必须指向真实建筑路线。国家基础资源独立入账，不吃城镇收入、产量或治理修正。

## 数值语法与计算单位

```json
{
  "income": 0.05,
  "research_scale": 2,
  "army.limit": { "operation": "multiply", "value": 1.5 }
}
```

每个词条可用数字简写、动态表达式，或 `{ "operation": ..., "value": ... }`。统一顺序：

`(基础值 + add 合计) × (1 + add_percent 合计) × multiply 连乘`，再按调用点封顶、保底和取整。

单位由词条注册表规定。收入、产量、人力、建设费用、研究效率和军队战力等词条查询的是**倍率**，基础值通常为 1；治理上限和常备比例查询的是**比例值**。所以这些词条显式 `add: 0.1` 表示加 10 个百分点，不是直接加 0.1 粮食／人数。它与 `add_percent` 混用时仍按上述先加后乘顺序。数量词条如科研规模、军团限额的 `add: 2` 才是直接加 2。

数字简写通常按百分比词条 `add_percent`、数量词条 `add` 处理；治理上限和常备比例例外，简写为百分点 `add`，保持既有定义语义。独立乘算写 `multiply: 1.2`，不是 `0.2`。本版没有“全国固定额外月入在城市之间分摊”的词条；一次增加粮食使用 `grain` 动作，国家固定资源仍配置 `baseResources`。

动态表达式仅支持数字、白名单 `metric`、`add/subtract/multiply/divide/min/max/clamp` 和 `args`，不执行 JavaScript。白名单为国库、人力、各类计划预算／实际维护覆盖、城镇规模／治理。禁止任意最终属性引用，避免递归计算。除法应使用 `max` 保护分母，非法运算会报错。表达式限制 12 层、128 个节点。

一次动作在执行时求值，持续词条在查询时按当前基础状态求值。`nation.budget.*` 是滑条计划；`nation.operatingCoverage.*` 才是本期已生效的维护覆盖，仍保留月底实付决定下月状态的时序。

## 内政与数值明细

内政预算下方显示紧凑的“当前生效状态”，包括本国所有城镇的局部状态。默认列出额外实例；科技、理念、顾问等常规贡献不在这里单列。科技／理念或额外定义可用 `showInAdministration` 覆盖；实例也保留覆盖字段。

点击状态展开名称、描述、范围、期限、当前实际词条和来源。商品供给中展开某资源的收入来源，再点金额打开独立浮窗，可查看本次真实产出的基础值、维护／治理／容量／原料限制与全部 modifier 来源，包括内政中隐藏的科技和理念。显示筛选不影响计算。

## 开发接口与接线

- `definitions/modifiers.ts`：词条注册表、单位、范围、默认运算及消费位置。
- `definitions/modifier-values.ts`：受限表达式与值校验；`effects.ts` 和 `modifier-definitions.ts`：动作与具名效果结构。
- `simulation/effects.ts`：`applyEffects(content, world, context, actions)`，仅在明确触发点执行，内部就地修改状态。
- `simulation/modifier-query.ts`：`resolveStat(...)` 返回最终值、实际贡献、加法／百分比／乘数合计、裁剪与舍入信息；`listActiveModifiers(...)` 提供展示条目。
- `simulation/modifier-instances.ts`：添加、刷新、替换、移除及清理；`modifier-state.ts`：状态与来源类型。
- `simulation/economy-calculation.ts`：保留生产实算步骤与建筑来源，不由 UI 重算公式。
- `platform/validate-modifier-save.ts`：存档实例、目标、来源、序号及期限校验；当前存档版本 10，不迁移旧档。

新增普通组合改 JSON 即可；新增根本机制须先注册词条并在领域计算中调用查询。新增政策系统只需选择常规来源及调用动作的时机，无需再写一套效果解释器。已实现注册条件组合、标志、延迟事件和外交关系动作，见 [事件系统](event-system.md)。军团局部目标和任意属性依赖暂未实现。

科研规模下降时保留旧投入和费用，但进度乘 `min(1, (当前规模 / 本期已付投入)^2)`，计划预览同理使用计划投入；换滑条不能掩盖本期超额投入。军队防御加成现在也进入进攻方自动结算，与手动战斗的攻方防御覆盖一致。

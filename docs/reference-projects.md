# 参考项目机制评估

评估日期：2026 年 11 月 8 日。

本记录对应三个本地项目当时的核心代码行为，用于区分可以继承的玩法概念与需要重新实现的系统。新游戏规则的状态见 [设计讨论记录](design-discussion.md)。

## 参考项目位置

| 代号 | 路径 | 主要参考范围 |
| --- | --- | --- |
| A | `/Users/yinhu/code/autumn-ascendant` | 时间、理念、顾问概念、生产、省份、事件、地图绘制与素材 |
| B | `/Users/yinhu/code/chongzhen-industry` | 科技分组、专业特长、关联知识、科研事件与科技插画 |
| C | `/Users/yinhu/code/sanguo` | 君主战略模式、人物能力、兵种、战斗、地图表现与素材 |

三个项目均只读参考，未改动其文件。以下地图性能判断仅涉及实现结构，未进行运行时性能测量。

## 项目 A

### 可继承的设计

- 可暂停日推进，30 日为一月、12 月为一年；日常处理移动与事件，月度处理经济与恢复。
- 界面发送命令，由 Worker 中的模拟状态执行；适合作为界面与规则分离的方向。
- 通用 modifier 的固定值、百分比、乘法计算思路。
- 诸子百家与槽位组合；A 的理念前置不沿用，新设计中的理念是三个成本档位的独立研究项目。
- 省份特产与建筑投入产出，顾问和科技相关素材。
- Canvas 绘制省份，预计算 Path2D，SVG 叠加道路的地图结构。

### 需要重新建立的部分

| 系统 | 当前实际行为 | 对新项目的影响 |
| --- | --- | --- |
| 科研 | 一次扣费后立即完成 | 研究组、持续进度、时代投入与世界传播需要新建 |
| 顾问 | 静态人物、等级与特长描述，招募归属和数量上限 | 尚不足以承载统一人物、内政效果与三类任职 |
| Modifier | 状态外单例按对象 ID 关联加成 | 来源、期限、存档重建与国家到省份作用需要重做 |
| 生产 | 逐建筑检查并扣除库存，农村产出随后加入 | 结果可能受遍历顺序影响，不能直接改名为额度制 |
| 建筑 | 建筑 ID 数组，可以重复建造 | 固定四类等级需要新模型 |
| 事件 | 遍历事件并取首个条件命中者 | MTTH 仅存在字段，按对象抽取、冷却、队列、AI 与事件链不完整 |
| 理念 | 已习得与已装备状态混用，替换时效果撤销存在缺口 | 解锁、实行方案和效果来源应分开 |
| 战斗与同步 | 单一活动战斗，事件和战斗直接控制暂停 | 多战场、暂停来源与共享世界日需要重新定义 |

国家级 modifier 不会自动进入只查询省份作用域的生产计算，不能把文档中的通用作用范围当作现成功能。前端条件校验与引擎实际执行也不完全一致，新项目需要权威规则统一校验。

### 关键代码位置

- [日历与结算](/Users/yinhu/code/autumn-ascendant/src/store/gameState.ts:142)
- [时间命令调度](/Users/yinhu/code/autumn-ascendant/src/controllers/GameController.ts:39)
- [Modifier 注册与计算](/Users/yinhu/code/autumn-ascendant/src/systems/ModifierRegistry.ts:3)
- [经济作用域与建筑生产](/Users/yinhu/code/autumn-ascendant/src/systems/EconomySystem.ts:44)
- [顾问招募](/Users/yinhu/code/autumn-ascendant/src/workers/game.worker.ts:540)
- [理念装备与卸下](/Users/yinhu/code/autumn-ascendant/src/workers/game.worker.ts:338)
- [事件筛选](/Users/yinhu/code/autumn-ascendant/src/systems/EventManager.ts:34)
- [地图路径缓存](/Users/yinhu/code/autumn-ascendant/src/components/VectorMap.tsx:87)

## 项目 B

### 可继承的设计

- 课题配置专业能力权重，研究团队按多项能力计算匹配度。
- 持续指定研究目标，更换目标后保留课题进度。
- 技术成果间传播关联知识。
- 数据化触发时机、事件权重、效果处理器与独立随机状态。
- 科技插画、按主专长选择头像的素材组织方式。

### 实际规则与新设想的区别

| 系统 | 当前实际行为 | 对新项目的影响 |
| --- | --- | --- |
| 科技门槛 | 多数跨组条件移到建筑入口，课题仍有组内依赖与部分跨学科门槛 | 不应重新把复杂科技依赖藏到建筑条件中 |
| 专业匹配 | 数学、冶金、机械、洋务、军事、管理按课题权重计算匹配 | 可以继承权重匹配思路，需改为适合春秋战国的能力内容 |
| 研究推进 | 匹配度影响每季推进概率；正常推进与失败推进幅度不同 | 并非连续速度加成，可预测进度需要重新实现 |
| 验收 | 准备度与最终掌握分开，允许尝试验收 | 是否保留该机制需要选择，当前整合建议是不采用常规验收赌博 |
| 多团队 | 团队总数最多 8；同一题只分配一组，不同题可同类并行 | 没有用户要求的分类研究席位限制 |
| 技术迁移 | 关联成果形成准备度下限，总计封顶 50%，取已有投入与该下限的较大值 | 不是完成关联科技后直接加一次进度，后期获得关联知识可能不增加当前进度 |
| 时代成本 | 基础价格主要按 tier 增加，与最终 era 标签独立；最终工作量被缩到较少季数 | 没有维持同等速度需要随时代大幅增加投入的完整机制 |
| 世界科技 | 单玩家科研状态 | 没有其他国家掌握情况与世界传播 |
| 事件 | 有触发概率、候选权重、效果与存档去重，当前事件内容较少 | 可借基础调度，需要扩展对象、选项、冷却与事件链 |

人物与组织目前共用 team 概念。新项目需要明确人物、研究席位和课题三者的区别，避免把招募人数直接等同于科研并行能力。

### 关键代码位置与资产

- [关联知识准备度](/Users/yinhu/code/chongzhen-industry/src/game.js:28)
- [人才生成](/Users/yinhu/code/chongzhen-industry/src/game.js:64)
- [专长匹配与研究概率](/Users/yinhu/code/chongzhen-industry/src/game.js:110)
- [季末科研推进](/Users/yinhu/code/chongzhen-industry/src/game.js:197)
- [科技价格与工作量定义](/Users/yinhu/code/chongzhen-industry/src/technology.js:52)
- [最终依赖与科研分组覆盖](/Users/yinhu/code/chongzhen-industry/src/technology.js:488)
- [事件与一次性结算](/Users/yinhu/code/chongzhen-industry/src/events.js:75)
- [素材映射](/Users/yinhu/code/chongzhen-industry/src/artwork.js:6)

科技图片位于 `/Users/yinhu/code/chongzhen-industry/assets/technology`，头像位于 `/Users/yinhu/code/chongzhen-industry/assets/portraits`。冶金、工匠、管理等素材可筛选；近代火器和明代建筑需检查时代适配。

## 项目 C

### 可继承的设计

- 六角格移动、地形、视野、远近程攻击、火攻与其他计策。
- 野战转攻城，以及攻守不同的攻城命令。
- 战斗数值集中计算，人数变化后重新求值。
- 手动与自动使用同一组战斗命令，自动模式并非另一套战斗公式。
- JSON 战斗快照、可保存的随机状态、跨月续战与防重复结算。
- 分离的地图底图、城市路线、颜色规则与摄像机操作。
- 确定性的 modifier 计算、效果来源与解释轨迹。

这些是 C 已有的机制，不代表新项目全部采用。2026 年 11 月 15 日已取消独立围城，当前采用 [战斗与动员设计](battle-design.md) 中的防守队列、进攻准备与完整野战方案，不继承 C 的围城玩法。

### 军队与时间的主要差异

C 当前每支战场部队最多配置 3 名武将，一队可以混编多个兵种，军队最多有 8 队。主将官职与编制相关，各将领能力组合参与战斗计算；这些都不是新项目的一名将领统辖多个独立兵种部队的结构。

战后部队会合回城市兵池，训练与士气按人数混合，装备回到库存。新项目需要持久 unitId 与逐队战损回写，由战略层负责补员和恢复。

新项目的部队内部区分专业常备核心与征召补充，常备决定兵种和主要输出，征召承担主要伤亡。C 的人数与战斗数值关系需要适配，不能把全部征召人数直接当成同等数量的专业兵种，也不能默认征召减少就使专业输出同比下降。

C 出征会配置装备与随军粮食，战斗中按实际兵力消耗，不能直接并入无商品库存的经济。建议新经济只向军团提供供给满足率、装备状态与补员能力，具体模型待定。

C 战略按月推进，战役内部计算战斗日。新项目当前按日推进准备期，每个防守国家仅队首正常推进，准备满额进入完整野战。玩家参与的待决战与手动期间世界暂停，整场按一个战略日计；不再追加旧三十日窗口。因此不能直接搬用 C 的跨月战术推进外壳，应借鉴其战斗规则、快照与单次结算边界。

高级兵种在当前 C 代码中已优先采用科技与理念解锁，将领解锁保留可选钩子，部分人物技能文案仍描述兵种解锁。新项目需要清理钩子与内容，不能只依据文案判断当前机制。

### 地图与事件边界

地图由离线 SVG 地理底图、81 个城市节点、路线和 Voronoi 近邻染色辖区组成。染色辖区与行军邻接图不是同一概念，不能直接视为春秋战国省份。

地图来源记录明确包含后世地理示意，例如黄河下游采用汉唐示意；地名、地理与省份边界应分别校订。当前 UI 也存在重建城市与路线 DOM、标签碰撞处理等路径，扩大规模并持续走时时需要验证性能。

domain-events 主要是任务和战斗完成等内部通知，使用稳定 ID 防止重复奖励，不是完整的叙事事件系统。它适合作为新事件系统接收事实的基础，叙事条件、选项和事件链仍需另建。

### 关键代码位置

- [军队编组](/Users/yinhu/code/sanguo/src/js/game/army.js:20)
- [兵种与解锁](/Users/yinhu/code/sanguo/src/js/game/troops.js:41)
- [统一战斗数值](/Users/yinhu/code/sanguo/src/js/game/combat-stats.js:21)
- [战斗引擎](/Users/yinhu/code/sanguo/src/js/game/battle.js:24)
- [战斗快照](/Users/yinhu/code/sanguo/src/js/game/battle.js:169)
- [自动战斗](/Users/yinhu/code/sanguo/src/js/game/battle-simulation.js:1)
- [战后兵力回写](/Users/yinhu/code/sanguo/src/js/game/battle-result.js:165)
- [跨月战斗与结算](/Users/yinhu/code/sanguo/src/js/game/turn-flow.js:81)
- [Modifier 计算](/Users/yinhu/code/sanguo/src/js/game/modifiers.js:1)
- [内部事件与防重复记录](/Users/yinhu/code/sanguo/src/js/game/domain-events.js:3)
- [战略地图绘制](/Users/yinhu/code/sanguo/src/js/ui/strategic-map.js:11)
- [辖区生成](/Users/yinhu/code/sanguo/scripts/build-strategic-territories.mjs:1)
- [地图来源说明](/Users/yinhu/code/sanguo/src/assets/map/source-notes.json:1)


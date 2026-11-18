import type { EventDefinition } from "../definitions/events";

/** A complete, safe starting point; authors opt into triggers and paid choices. */
export function newEventDefinition(
  existingIds: readonly string[],
): EventDefinition {
  let number = 1;
  while (existingIds.includes(`new_event_${number}`)) number += 1;
  return {
    id: `new_event_${number}`,
    title: "新奏报",
    description: "{{nation}}收到一份奏报。",
    weight: 1,
    duration: 30,
    triggers: [],
    options: [
      {
        id: "acknowledge",
        label: "知道了",
        description: "暂不采取额外措施。",
        effects: [],
      },
    ],
  };
}

export const EVENT_FIELD_HELP: Record<string, string> = {
  triggers:
    'random 指向一个事件池；fact 响应已结算的游戏事实；date 指定游戏日期。[] 表示只由 schedule_event 安排。示例：[{"type":"random","poolId":"common"}]，poolId 须在事件池中存在。',
  condition:
    '创建事件前检查的条件。支持 all、any、not 组合；叶子使用注册的条件类型，不可直接读写任意游戏字段。示例：{"type":"metric","metric":"nation.treasury","compare":"gte","value":100} 表示国库粮食不少于 100。',
  target:
    "可选择 settlement（本国城镇）、related_nation（其他国家）或 talent（本国人才），并用 condition 筛选。对象在创建事件时绑定，之后查看、读档或后续事件都不会重新抽选。",
  repeat:
    "scope 取 nation、settlement 或 world；once 限定仅发生一次，cooldownDays 设置本事件间隔。group 与 groupCooldownDays 让同组事件共用冷却。所有时间均为游戏日。",
  weightModifiers:
    "符合 condition 时将基础 weight 乘以 multiplier。随机池先按自身 chance 决定是否触发，再从合格事件中按最终权重抽选。",
  presentation:
    "important 为 true 时在大地图暂停并打开奏报；image 为插图路径，speaker 为叙述者。只影响显示，不会改变事件条件或结果。",
  options:
    "每个选项都有稳定 id、label、description、effects。首项不得设 condition 或 cost，逾期自动选择它。后续选项可设独立 cost（grain / manpower）、condition、aiWeight，以及 outcomes 加权结果。不要用负收益替代自愿支付费用。",
  duration: "奏报创建后可选择的游戏日数；暂停世界时不会流逝。",
  weight: "同一随机事件池中，合格事件相互比较的抽选权重。",
  description:
    "可插入 {{nation}}、{{settlement}}、{{relatedNation}}、{{talent}}；只替换本次绑定对象的名称，不执行脚本或 HTML。",
};

export function EventAuthoringGuide({ pool = false }: { pool?: boolean }) {
  return (
    <details className="event-authoring-guide">
      <summary>
        {pool ? "事件池如何控制频率" : "事件编写约定与后续事件"}
      </summary>
      {pool ? (
        <p>
          每个国家每月为每个池抽取一次，chance 在 0 到 1
          之间。通过后，按权重选取一份符合条件的奏报。
          增加池内事件只增加内容变化，不会提高这个池的发生频率。
        </p>
      ) : (
        <>
          <p>
            条目表单中的复杂字段直接编辑
            JSON；完整校验同时检查语法、条件和跨文件引用。
            新建事件默认不自动触发，可添加 triggers，或由其他事件安排。
          </p>
          <p>
            后续事件使用 schedule_event 并继承绑定对象。效果用稳定的 modifierId
            配合作用对象增删，不需要链条 ID，也不按来源事件区分。
          </p>
          <pre>{`{"type":"schedule_event","eventId":"reform_followup","delayDays":90}
{"type":"remove_modifier","modifierId":"reform_disruption","target":{"kind":"settlement"}}`}</pre>
          <p>
            上述 ID 需在内容包中定义。不同改革使用不同效果
            ID；相同效果在不同城镇各自管理。
            同一城镇重复获得效果时，遵循该效果的 refresh、replace 或 stack
            配置。
          </p>
        </>
      )}
    </details>
  );
}

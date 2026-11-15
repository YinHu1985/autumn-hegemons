import {
  DEFAULT_TACTICAL_VISIBILITY,
  validateTacticalVisibility,
  type TacticalVisibilityRules,
} from "./tactical-visibility";

/** JSON chooses values and available stratagems; the engine implements each effect. */
export type TacticalStrategyEffect =
  "fire" | "fireArrow" | "doubt" | "provoke" | "rally";
export interface TacticalStrategyDefinition {
  id: string;
  name: string;
  description: string;
  effect: TacticalStrategyEffect;
  actionPoints: number;
  range: number;
  successChance: number;
  requires?: string;
  duration?: number;
  damageRate?: number;
  moraleChange?: number;
}
export interface TacticalRules {
  baseInitiative: number;
  actionThreshold: number;
  trainingInitiativeBonus: number;
  moraleInitiativeBonus: number;
  presentation: TacticalPresentation;
  visibility: TacticalVisibilityRules;
  baseActionPoints: number;
  cavalryActionPoints: number;
  meleeCost: number;
  shootCost: number;
  plainMoveCost: number;
  roughMoveCost: number;
  meleeDamageRate: number;
  rangedDamageRate: number;
  counterDamageRate: number;
  rangedMeleeMultiplier: number;
  guardDefenseMultiplier: number;
  waitMoraleRecovery: number;
  strategies: TacticalStrategyDefinition[];
}

/** Playback pacing only; these values never alter simulation initiative or damage. */
export interface TacticalPresentation {
  clockUnitsPerSecond: number;
  moveStepMs: number;
  attackMs: number;
  pauseMs: number;
}

// Only for pre-tactics content packs and saves. New games read tactics.json.
export const LEGACY_TACTICS_DEFAULTS: TacticalRules = {
  baseInitiative: 100,
  actionThreshold: 100,
  trainingInitiativeBonus: 0.1,
  moraleInitiativeBonus: 0.1,
  presentation: {
    clockUnitsPerSecond: 0.65,
    moveStepMs: 220,
    attackMs: 650,
    pauseMs: 320,
  },
  visibility: DEFAULT_TACTICAL_VISIBILITY,
  baseActionPoints: 2,
  cavalryActionPoints: 3,
  meleeCost: 1,
  shootCost: 1,
  plainMoveCost: 1,
  roughMoveCost: 2,
  meleeDamageRate: 0.16,
  rangedDamageRate: 0.16,
  counterDamageRate: 0.035,
  rangedMeleeMultiplier: 0.55,
  guardDefenseMultiplier: 1.35,
  waitMoraleRecovery: 2,
  strategies: [
    {
      id: "fire",
      name: "火攻",
      description: "对附近敌军施放火攻，造成伤亡与士气损失。",
      effect: "fire",
      actionPoints: 2,
      range: 2,
      successChance: 0.6,
      damageRate: 0.12,
      moraleChange: 10,
    },
    {
      id: "doubt",
      name: "疑兵",
      description: "扰乱敌军，使其下一次行动无法出击。",
      effect: "doubt",
      actionPoints: 2,
      range: 3,
      successChance: 0.5,
      duration: 1,
    },
    {
      id: "provoke",
      name: "挑衅",
      description: "诱使敌军下一次行动追击施计部队，仍受贴身牵制。",
      effect: "provoke",
      actionPoints: 1,
      range: 3,
      successChance: 0.6,
      duration: 1,
    },
    {
      id: "rally",
      name: "鼓舞",
      description: "恢复附近友军士气，每支部队每次行动只能施计一次。",
      effect: "rally",
      actionPoints: 1,
      range: 2,
      successChance: 1,
      moraleChange: 12,
    },
    {
      id: "fireArrow",
      name: "火矢",
      description: "远程部队射出火矢，命中造成正常射击伤害，并有概率引燃。",
      effect: "fireArrow",
      actionPoints: 2,
      range: 3,
      successChance: 0.35,
      damageRate: 0.08,
      moraleChange: 8,
    },
  ],
};

function object(raw: unknown, path: string): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error(`${path} 应为对象`);
  return raw as Record<string, unknown>;
}
function number(
  raw: unknown,
  path: string,
  min = 0,
  max = Infinity,
  integer = false,
): number {
  if (
    typeof raw !== "number" ||
    !Number.isFinite(raw) ||
    raw < min ||
    raw > max ||
    (integer && !Number.isInteger(raw))
  )
    throw new Error(`${path} 数值无效`);
  return raw;
}
function text(raw: unknown, path: string): string {
  if (typeof raw !== "string" || !raw.trim())
    throw new Error(`${path} 应为非空文字`);
  return raw;
}
function knownKeys(
  raw: Record<string, unknown>,
  allowed: string[],
  path: string,
) {
  for (const key of Object.keys(raw))
    if (!allowed.includes(key))
      throw new Error(`${path} 使用了未知规则 ${key}`);
}
export function validateTactics(
  raw: unknown,
  unlockIds: Set<string>,
): TacticalRules {
  if (raw === undefined) return structuredClone(LEGACY_TACTICS_DEFAULTS);
  let values = object(raw, "tactics");
  // Old content uses faction rounds. Upgrade known defaults, preserving custom tuning.
  if (
    values.baseInitiative === undefined &&
    values.actionThreshold === undefined
  ) {
    values = {
      ...values,
      baseInitiative: 100,
      actionThreshold: 100,
      trainingInitiativeBonus: 0.1,
      moraleInitiativeBonus: 0.1,
      presentation: { ...LEGACY_TACTICS_DEFAULTS.presentation },
    };
    for (const [key, oldValue, newValue] of [
      ["baseActionPoints", 6, 2],
      ["cavalryActionPoints", 8, 3],
      ["meleeCost", 3, 1],
      ["shootCost", 3, 1],
    ] as const)
      if (values[key] === oldValue) values[key] = newValue;
    if (Array.isArray(values.strategies))
      values.strategies = values.strategies.map((raw) => {
        const strategy = object(raw, "tactics.strategies");
        const oldCost = strategy.effect === "provoke" ? 2 : 3;
        const newCost =
          strategy.effect === "provoke" || strategy.effect === "rally" ? 1 : 2;
        return {
          ...strategy,
          actionPoints:
            strategy.actionPoints === oldCost ? newCost : strategy.actionPoints,
        };
      });
  }
  knownKeys(values, Object.keys(LEGACY_TACTICS_DEFAULTS), "tactics");
  const result = {} as TacticalRules;
  result.visibility = validateTacticalVisibility(values.visibility);
  result.baseInitiative = number(
    values.baseInitiative,
    "tactics.baseInitiative",
    1,
    10000,
  );
  result.actionThreshold = number(
    values.actionThreshold,
    "tactics.actionThreshold",
    1,
    10000,
  );
  result.trainingInitiativeBonus = number(
    values.trainingInitiativeBonus,
    "tactics.trainingInitiativeBonus",
    0,
    0.9,
  );
  result.moraleInitiativeBonus = number(
    values.moraleInitiativeBonus,
    "tactics.moraleInitiativeBonus",
    0,
    0.9,
  );
  if (result.trainingInitiativeBonus + result.moraleInitiativeBonus >= 1)
    throw new Error("主动性减益合计必须小于 100%");
  const presentation = object(values.presentation, "tactics.presentation");
  knownKeys(
    presentation,
    ["clockUnitsPerSecond", "moveStepMs", "attackMs", "pauseMs"],
    "tactics.presentation",
  );
  result.presentation = {
    clockUnitsPerSecond: number(
      presentation.clockUnitsPerSecond,
      "tactics.presentation.clockUnitsPerSecond",
      0.01,
      10,
    ),
    moveStepMs: number(
      presentation.moveStepMs,
      "tactics.presentation.moveStepMs",
      50,
      5000,
      true,
    ),
    attackMs: number(
      presentation.attackMs,
      "tactics.presentation.attackMs",
      100,
      5000,
      true,
    ),
    pauseMs: number(
      presentation.pauseMs,
      "tactics.presentation.pauseMs",
      50,
      5000,
      true,
    ),
  };
  for (const key of [
    "baseActionPoints",
    "cavalryActionPoints",
    "meleeCost",
    "shootCost",
    "plainMoveCost",
    "roughMoveCost",
  ] as const)
    result[key] = number(values[key], `tactics.${key}`, 1, 100, true);
  for (const key of [
    "meleeDamageRate",
    "rangedDamageRate",
    "counterDamageRate",
    "rangedMeleeMultiplier",
  ] as const)
    result[key] = number(values[key], `tactics.${key}`, 0, 10);
  result.guardDefenseMultiplier = number(
    values.guardDefenseMultiplier,
    "tactics.guardDefenseMultiplier",
    1,
    10,
  );
  result.waitMoraleRecovery = number(
    values.waitMoraleRecovery,
    "tactics.waitMoraleRecovery",
    0,
    100,
  );
  if (!Array.isArray(values.strategies))
    throw new Error("tactics.strategies 应为计策数组");
  const ids = new Set<string>();
  result.strategies = values.strategies.map((raw, index) => {
    const path = `tactics.strategies[${index}]`;
    const entry = object(raw, path);
    knownKeys(
      entry,
      [
        "id",
        "name",
        "description",
        "effect",
        "actionPoints",
        "range",
        "successChance",
        "requires",
        "duration",
        "damageRate",
        "moraleChange",
      ],
      path,
    );
    const id = text(entry.id, `${path}.id`);
    if (
      ids.has(id) ||
      ["auto", "move", "melee", "shoot", "guard", "attack", "wait"].includes(id)
    )
      throw new Error(`${path} 计策 ID 重复或与基础动作冲突`);
    ids.add(id);
    const effect = text(
      entry.effect,
      `${path}.effect`,
    ) as TacticalStrategyEffect;
    if (!["fire", "fireArrow", "doubt", "provoke", "rally"].includes(effect))
      throw new Error(`${path} 未实现的计策效果 ${effect}`);
    const strategy: TacticalStrategyDefinition = {
      id,
      name: text(entry.name, `${path}.name`),
      description: text(entry.description, `${path}.description`),
      effect,
      actionPoints: number(
        entry.actionPoints,
        `${path}.actionPoints`,
        1,
        100,
        true,
      ),
      range: number(entry.range, `${path}.range`, 0, 100, true),
      successChance: number(entry.successChance, `${path}.successChance`, 0, 1),
    };
    if (entry.requires !== undefined) {
      strategy.requires = text(entry.requires, `${path}.requires`);
      if (!unlockIds.has(strategy.requires))
        throw new Error(`${path} 解锁引用不存在 ${strategy.requires}`);
    }
    if (entry.duration !== undefined)
      strategy.duration = number(
        entry.duration,
        `${path}.duration`,
        1,
        100,
        true,
      );
    if (entry.damageRate !== undefined)
      strategy.damageRate = number(
        entry.damageRate,
        `${path}.damageRate`,
        0,
        10,
      );
    if (entry.moraleChange !== undefined)
      strategy.moraleChange = number(
        entry.moraleChange,
        `${path}.moraleChange`,
        0,
        100,
      );
    if (
      ["doubt", "provoke"].includes(effect) &&
      strategy.duration === undefined
    )
      throw new Error(`${path} 控制计策需要 duration`);
    if (
      ["fire", "fireArrow"].includes(effect) &&
      strategy.damageRate === undefined
    )
      throw new Error(`${path} 伤害计策需要 damageRate`);
    if (effect === "rally" && strategy.moraleChange === undefined)
      throw new Error(`${path} 鼓舞需要 moraleChange`);
    return strategy;
  });
  return result;
}

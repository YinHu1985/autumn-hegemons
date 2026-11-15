export type UnitCategory =
  "infantry" | "ranged" | "cavalry" | "chariot" | "siege";
export interface UnitDefinition {
  id: string;
  name: string;
  description: string;
  category: UnitCategory;
  cadre: number;
  levy: number;
  cost: number;
  upkeep: number;
  attack: number;
  defense: number;
  range: number;
  /** Optional override; otherwise tactics.json supplies the category default. */
  actionPoints?: number;
  /** Base initiative before the small training/morale adjustments. */
  initiative?: number;
  /** Sight radius override; tactics.json supplies the category default. */
  vision?: number;
  /** Read-only compatibility with early content packs; no longer used. */
  movement?: number;
  equipment: Record<string, number>;
  requires?: string;
}
export function validateUnits(
  raw: unknown,
  goodIds?: Set<string>,
): UnitDefinition[] {
  if (!Array.isArray(raw)) throw new Error("units 应为数组");
  const ids = new Set<string>();
  return raw.map((v: unknown) => {
    if (!v || typeof v !== "object") throw new Error("兵种应为对象");
    const u = v as UnitDefinition;
    if (!u.id || !u.name || ids.has(u.id))
      throw new Error("兵种 ID 缺失或重复");
    ids.add(u.id);
    if (
      !["infantry", "ranged", "cavalry", "chariot", "siege"].includes(
        u.category,
      )
    )
      throw new Error(`${u.id} 的基础兵种不支持`);
    for (const k of [
      "cadre",
      "levy",
      "cost",
      "upkeep",
      "attack",
      "defense",
      "range",
    ] as const)
      if (!Number.isFinite(u[k]) || u[k] < 0)
        throw new Error(`${u.id}.${k} 需为非负数字`);
    if (u.cadre + u.levy <= 0 || u.range < 1 || u.defense <= 0)
      throw new Error(`${u.id} 编制/移动/射程/防御不合法`);
    if (
      u.actionPoints !== undefined &&
      (!Number.isInteger(u.actionPoints) ||
        u.actionPoints < 1 ||
        u.actionPoints > 100)
    )
      throw new Error(`${u.id}.actionPoints 应为 1 到 100 的整数`);
    if (
      u.initiative !== undefined &&
      (!Number.isFinite(u.initiative) ||
        u.initiative < 1 ||
        u.initiative > 10000)
    )
      throw new Error(`${u.id}.initiative 应为 1 到 10000 的有限数字`);
    if (
      u.vision !== undefined &&
      (!Number.isInteger(u.vision) || u.vision < 1 || u.vision > 100)
    )
      throw new Error(`${u.id}.vision 应为 1 到 100 的整数`);
    if (!u.equipment || typeof u.equipment !== "object")
      throw new Error(`${u.id} 缺少装备配额`);
    for (const [id, amount] of Object.entries(u.equipment))
      if (
        !Number.isFinite(amount) ||
        amount < 0 ||
        (goodIds && !goodIds.has(id))
      )
        throw new Error(`${u.id} 装备引用 ${id} 不合法`);
    return { ...u, equipment: { ...u.equipment } };
  });
}

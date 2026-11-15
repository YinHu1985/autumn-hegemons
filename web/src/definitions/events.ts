export interface EventEffect {
  kind: "grain" | "manpower" | "governance" | "research";
  amount: number;
  targetId?: string;
}
export interface EventDefinition {
  id: string;
  title: string;
  description: string;
  weight: number;
  duration: number;
  options: { label: string; description: string; effects: EventEffect[] }[];
}
export function validateEvents(raw: unknown): EventDefinition[] {
  if (!Array.isArray(raw)) throw new Error("events 应为列表");
  const ids = new Set<string>();
  return raw.map((value: EventDefinition) => {
    if (
      !value ||
      typeof value.id !== "string" ||
      !value.id ||
      ids.has(value.id)
    )
      throw new Error("事件 ID 为空或重复");
    ids.add(value.id);
    if (
      typeof value.title !== "string" ||
      typeof value.description !== "string" ||
      !Number.isFinite(value.weight) ||
      value.weight <= 0 ||
      !Number.isInteger(value.duration) ||
      value.duration < 1 ||
      !Array.isArray(value.options) ||
      !value.options.length
    )
      throw new Error(`事件 ${value.id} 的标题、期限或选项无效`);
    for (const option of value.options) {
      if (
        typeof option.label !== "string" ||
        typeof option.description !== "string" ||
        !Array.isArray(option.effects)
      )
        throw new Error(`事件 ${value.id} 选项无效`);
      for (const effect of option.effects)
        if (
          !["grain", "manpower", "governance", "research"].includes(
            effect.kind,
          ) ||
          !Number.isFinite(effect.amount) ||
          (effect.kind === "research" && effect.amount < 0) ||
          (effect.targetId !== undefined && typeof effect.targetId !== "string")
        )
          throw new Error(`事件 ${value.id} 的效果无效`);
    }
    return value;
  });
}

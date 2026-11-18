/** Applied values, captured at the command boundary rather than recalculated for history. */
export interface EffectResult {
  type: string;
  description: string;
  before?: number;
  after?: number;
  targetId?: string;
}

export function quantityResult(
  type: string,
  name: string,
  before: number,
  after: number,
  targetId?: string,
  percent = false,
): EffectResult {
  const delta = (after - before) * (percent ? 100 : 1);
  const display = Number(delta.toFixed(2));
  return {
    type,
    description: `${name}${display >= 0 ? "＋" : ""}${display}${percent ? " 个百分点" : ""}`,
    before,
    after,
    ...(targetId && { targetId }),
  };
}

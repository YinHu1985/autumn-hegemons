/** Small shared validators for the data-authored effect grammar. */
export function effectObject(
  value: unknown,
  path: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${path} 应为对象`);
  return value as Record<string, unknown>;
}
export function effectFields(
  value: Record<string, unknown>,
  fields: readonly string[],
  path: string,
): void {
  for (const field of Object.keys(value))
    if (!fields.includes(field)) throw new Error(`${path} 未知字段 ${field}`);
}
export function effectText(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${path} 应为非空文字`);
  return value;
}
export function optionalEffectBoolean(
  value: unknown,
  path: string,
): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${path} 应为布尔值`);
  return value;
}

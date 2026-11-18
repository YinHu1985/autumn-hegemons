import {
  effectFields,
  effectObject,
  effectText,
  optionalEffectBoolean,
} from "./effect-validation";
import { validateModifierTerms } from "./modifiers";
import type { ModifierScope, ModifierTerms } from "./modifier-values";

/** Reusable content templates. Their runtime instances carry source, target and absolute expiry. */
export interface NamedModifierDefinition {
  id: string;
  name: string;
  description: string;
  icon?: string;
  scope: ModifierScope;
  effects: ModifierTerms;
  stacking: "refresh" | "stack" | "replace";
  showInAdministration?: boolean;
}
export function validateModifierDefinitions(
  raw: unknown,
): NamedModifierDefinition[] {
  if (!Array.isArray(raw)) throw new Error("modifierDefinitions 应为列表");
  const ids = new Set<string>();
  return raw.map((value, index): NamedModifierDefinition => {
    const path = `modifierDefinitions[${index}]`;
    const item = effectObject(value, path);
    effectFields(
      item,
      [
        "id",
        "name",
        "description",
        "icon",
        "scope",
        "effects",
        "stacking",
        "showInAdministration",
      ],
      path,
    );
    const id = effectText(item.id, `${path}.id`);
    if (ids.has(id)) throw new Error(`${path} ID 重复：${id}`);
    ids.add(id);
    if (item.scope !== "nation" && item.scope !== "settlement")
      throw new Error(`${path}.scope 仅支持 nation 或 settlement`);
    if (!["refresh", "stack", "replace"].includes(String(item.stacking)))
      throw new Error(`${path}.stacking 应为 refresh、stack 或 replace`);
    const showInAdministration = optionalEffectBoolean(
      item.showInAdministration,
      `${path}.showInAdministration`,
    );
    return {
      id,
      name: effectText(item.name, `${path}.name`),
      description: effectText(item.description, `${path}.description`),
      scope: item.scope,
      stacking: item.stacking as NamedModifierDefinition["stacking"],
      effects: validateModifierTerms(
        item.effects,
        `${path}.effects`,
        item.scope,
      ),
      ...(item.icon !== undefined && {
        icon: effectText(item.icon, `${path}.icon`),
      }),
      ...(showInAdministration !== undefined && { showInAdministration }),
    };
  });
}

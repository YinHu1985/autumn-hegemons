import {
  RESEARCH_ATTRIBUTES,
  RESEARCH_ATTRIBUTE_NAMES,
} from "../definitions/research";
import { FIELDS } from "./labels";

interface Props {
  value: unknown;
  onChange: (value: Record<string, unknown>) => void;
}

/** Explicit controls keep designers from needing to remember attribute keys. */
export function ResearchAttributeFields({ value, onChange }: Props) {
  const weights =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return (
    <fieldset className="research-attribute-fields wide">
      <legend>
        {FIELDS.attributeWeights} <small>attributeWeights</small>
      </legend>
      <p>各能力分别乘以权重后计入研究效率；0 表示不参与，至少一项须大于 0。</p>
      <div>
        {RESEARCH_ATTRIBUTES.map((attribute) => (
          <label key={attribute}>
            <span>
              {RESEARCH_ATTRIBUTE_NAMES[attribute]}
              <small>{attribute}</small>
            </span>
            <input
              type="number"
              min="0"
              step="0.05"
              value={String(weights[attribute] ?? 0)}
              onChange={(event) =>
                onChange({
                  ...weights,
                  [attribute]: Number(event.target.value),
                })
              }
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

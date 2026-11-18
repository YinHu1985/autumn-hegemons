import type { EffectAction } from "../../definitions/effects";
import type { Content } from "../../definitions/types";
import { describeEffectAction } from "./effect-labels";
import "./effects.css";

export function EffectActionList({
  content,
  actions,
  inline = false,
}: {
  content: Content;
  actions?: EffectAction[];
  inline?: boolean;
}) {
  if (!actions?.length) return null;
  if (inline)
    return (
      <span className="effect-action-list is-inline">
        {actions.map((action, index) => (
          <span key={index}>{describeEffectAction(content, action)}</span>
        ))}
      </span>
    );
  return (
    <ul className="effect-action-list">
      {actions.map((action, index) => (
        <li key={index}>{describeEffectAction(content, action)}</li>
      ))}
    </ul>
  );
}

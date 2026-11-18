import { useId } from "react";
import { formatModifier } from "../../definitions/modifiers";
import { formatQuantity } from "../../simulation/economy";
import type { ResourceCalculation as Calculation } from "../../simulation/economy-calculation";
import type { StatResult } from "../../simulation/modifier-query";

const numeric = (value: number) => Number(value.toFixed(4));

function StatContributions({ stat }: { stat: StatResult }) {
  return (
    <div className="economy-stat-breakdown">
      {stat.contributions.map((entry, index) => (
        <div className="economy-stat-source" key={index}>
          <span>
            {entry.modifierName ?? entry.source.name}
            {entry.modifierName && entry.modifierName !== entry.source.name ? (
              <small> · {entry.source.name}</small>
            ) : null}
          </span>
          <span>
            {formatModifier(entry.key, {
              operation: entry.operation,
              value: entry.value,
            })}
          </span>
        </div>
      ))}
      {stat.contributions.length > 0 && (
        <p className="economy-stat-formula">
          ({numeric(stat.base)}
          {stat.flat < 0 ? " − " : " + "}
          {numeric(Math.abs(stat.flat))}) × (1{stat.percent < 0 ? " − " : " + "}
          {numeric(Math.abs(stat.percent))}) × {numeric(stat.multiplier)} ={" "}
          {numeric(stat.rawValue)}
        </p>
      )}
      {stat.clampedValue !== stat.rawValue && (
        <p className="economy-stat-formula">
          限制范围{stat.min !== undefined ? ` ≥ ${numeric(stat.min)}` : ""}
          {stat.max !== undefined ? ` ≤ ${numeric(stat.max)}` : ""} →{" "}
          {numeric(stat.clampedValue)}
        </p>
      )}
      {stat.value !== stat.clampedValue && (
        <p className="economy-stat-formula">
          {stat.round === "floor"
            ? "向下取整"
            : stat.round === "ceil"
              ? "向上取整"
              : "四舍五入"}{" "}
          → {numeric(stat.value)}
        </p>
      )}
    </div>
  );
}

/** This view uses the calculation stored alongside the actual output. */
export function ResourceCalculation({
  calculation,
  label,
}: {
  calculation: Calculation;
  label: string;
}) {
  const popoverId = useId();
  const titleId = `${popoverId}-title`;
  return (
    <>
      <button
        type="button"
        className="economy-calculation-trigger"
        popoverTarget={popoverId}
        aria-label={`查看${label}计算明细`}
        onKeyDown={(event) => {
          if (event.code === "Space") event.stopPropagation();
        }}
      >
        +{formatQuantity(calculation.value)} <span aria-hidden="true">⌄</span>
      </button>
      <div
        id={popoverId}
        popover="auto"
        role="dialog"
        aria-labelledby={titleId}
        className="economy-calculation-popover"
        onKeyDownCapture={(event) => {
          if (event.key === "Escape" || event.code === "Space")
            event.stopPropagation();
        }}
      >
        <header className="economy-calculation-header">
          <div>
            <small>产出明细</small>
            <h3 id={titleId}>{label}</h3>
          </div>
          <button
            type="button"
            className="quiet"
            popoverTarget={popoverId}
            popoverTargetAction="hide"
            aria-label="关闭产出明细"
            autoFocus
          >
            ×
          </button>
        </header>
        <div className="economy-calculation-detail">
          <div className="economy-calculation-heading">
            基础产出 <strong>{formatQuantity(calculation.base)}</strong>
          </div>
          {calculation.steps.map((step, index) => (
            <div className="economy-calculation-step" key={index}>
              <div className="economy-calculation-heading">
                <span>{step.label}</span>
                <strong>×{numeric(step.factor)}</strong>
              </div>
              {step.stat && <StatContributions stat={step.stat} />}
            </div>
          ))}
          <div className="economy-calculation-total">
            实际产出 <strong>{formatQuantity(calculation.value)}</strong>
          </div>
        </div>
      </div>
    </>
  );
}

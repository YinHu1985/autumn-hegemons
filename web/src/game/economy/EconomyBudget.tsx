import type { BudgetCategory } from "../../simulation/commands";
import type { NationState } from "../../simulation/state";
import { formatQuantity } from "../../simulation/economy";

const labels: Record<BudgetCategory, string> = {
  buildings: "产业维护",
  army: "军队维护",
  research: "科研投入",
};

export function EconomyBudget({
  nation,
  demands,
  paymentRatio,
  onBudget,
}: {
  nation: NationState;
  demands: Record<BudgetCategory, number>;
  paymentRatio: number;
  onBudget: (category: BudgetCategory, value: number) => void;
}) {
  return (
    <section className="ui-section economy-budget" aria-label="维护预算">
      <header className="ui-section-heading">
        <h3>维护预算</h3>
        <span className="ui-badge">月底支付</span>
      </header>
      <p className="ui-note">调整各项投入比例，月底实付决定下月运行水平。</p>
      {(Object.keys(labels) as BudgetCategory[]).map((key) => (
        <div className="economy-budget-item" key={key}>
          <div className="economy-budget-caption">
            <label htmlFor={`budget-${key}`}>{labels[key]}</label>
            <strong>
              {Math.round(nation.budget[key] * 100)}
              <small>%</small>
            </strong>
          </div>
          <input
            id={`budget-${key}`}
            type="range"
            min="0"
            max="100"
            aria-label={labels[key]}
            value={nation.budget[key] * 100}
            onChange={(event) =>
              onBudget(key, Number(event.target.value) / 100)
            }
          />
          <div className="economy-budget-caption economy-budget-cost">
            <span>足额 {formatQuantity(demands[key])} 粮</span>
            <span>
              预计实付{" "}
              <b>
                {formatQuantity(
                  demands[key] * nation.budget[key] * paymentRatio,
                )}
              </b>
            </span>
          </div>
          <small className="economy-operating">
            本月运行 {Math.round(nation.operatingCoverage[key] * 100)}%
          </small>
        </div>
      ))}
      {paymentRatio < 1 && (
        <p className="economy-shortfall" role="status">
          可用粮食只能支付计划开支的 {Math.round(paymentRatio * 100)}
          %，各项将同比缩减。
        </p>
      )}
    </section>
  );
}

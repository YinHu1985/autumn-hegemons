import type { Content } from "../definitions/types";
import type { WorldState } from "../simulation/state";
import { calculateEconomy, formatQuantity } from "../simulation/economy";
import { setBudget, type BudgetCategory } from "../simulation/commands";
import { manpowerCapacity } from "../simulation/civic";
import { militaryUpkeep } from "../simulation/military";
import { researchUpkeep } from "../simulation/research";

interface Props {
  content: Content;
  world: WorldState;
  nationId: string;
  onWorld: (world: WorldState) => void;
}
const labels: Record<BudgetCategory, string> = {
  buildings: "产业维护",
  army: "军队维护",
  research: "科研投入",
};
export function EconomyPanel({ content, world, nationId, onWorld }: Props) {
  const nation = world.nations[nationId];
  const economy = calculateEconomy(content, world, nationId);
  const demands = {
    buildings: economy.fullBuildingUpkeep,
    army: militaryUpkeep(content, world, nationId),
    research: researchUpkeep(content, world, nationId),
  };
  const total = Object.entries(demands).reduce(
    (sum, [key, amount]) => sum + amount * nation.budget[key as BudgetCategory],
    0,
  );
  const available = nation.treasury + economy.income;
  const ratio = total > 0 ? Math.min(1, available / total) : 1;
  return (
    <div className="feature-panel economy-feature">
      <div className="panel-intro">
        <h2>国用与产业</h2>
        <p>粮食存入国库；商品以持续产出供给产业与军备。</p>
      </div>
      <div className="stat-grid">
        <div>
          <small>国库</small>
          <strong>{formatQuantity(nation.treasury)}</strong>
        </div>
        <div>
          <small>每月收入</small>
          <strong>+{formatQuantity(economy.income)}</strong>
        </div>
        <div>
          <small>计划支出</small>
          <strong>−{formatQuantity(total)}</strong>
        </div>
        <div>
          <small>预计收支</small>
          <strong>{formatQuantity(economy.income - total)}</strong>
        </div>
      </div>
      <h3>维护预算</h3>
      <p className="muted">
        本月运行按既有支付水平；月底实付决定下月状态。资金不足时各类同比缩减。
      </p>
      {(Object.keys(labels) as BudgetCategory[]).map((key) => (
        <div className="budget-row" key={key}>
          <div>
            <strong>{labels[key]}</strong>
            <small>
              足额 {formatQuantity(demands[key])} · 本月运行{" "}
              {Math.round(nation.operatingCoverage[key] * 100)}%
            </small>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            aria-label={labels[key]}
            value={nation.budget[key] * 100}
            onChange={(event) =>
              onWorld(
                setBudget(
                  world,
                  nationId,
                  key,
                  Number(event.target.value) / 100,
                ),
              )
            }
          />
          <span>{Math.round(nation.budget[key] * 100)}%</span>
          <small>
            预计实付 {formatQuantity(demands[key] * nation.budget[key] * ratio)}
          </small>
        </div>
      ))}
      {ratio < 1 && (
        <p className="warning">
          当前国库与月收入只能支付计划开支的 {Math.round(ratio * 100)}
          %，各项运行将受影响。
        </p>
      )}
      <h3>全国人力</h3>
      <div className="stat-grid">
        <div>
          <small>可征人力 / 全国储备上限</small>
          <strong>
            {Math.floor(nation.manpower).toLocaleString()} /{" "}
            {manpowerCapacity(content, world, nationId).toLocaleString()}
          </strong>
        </div>
      </div>
      <p className="muted">
        军团征募、补员与地方守备共用这份人力。每月恢复上限的
        1.5%，在役人员不占储备上限。
      </p>
      <h3>商品供给</h3>
      <table className="data-table">
        <thead>
          <tr>
            <th>资源</th>
            <th>总产出</th>
            <th>加工占用</th>
            <th>可用额度</th>
          </tr>
        </thead>
        <tbody>
          {content.goods.map((good) => (
            <tr key={good.id}>
              <td>{good.name}</td>
              <td>{formatQuantity(economy.gross[good.id] ?? 0)}</td>
              <td>{formatQuantity(economy.used[good.id] ?? 0)}</td>
              <td>{formatQuantity(economy.available[good.id] ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <details>
        <summary>各项收入来源</summary>
        <table className="data-table">
          <tbody>
            {economy.lines.map((line, index) => (
              <tr key={index}>
                <td>{line.source}</td>
                <td>
                  {content.goods.find((g) => g.id === line.resourceId)?.name}
                </td>
                <td>+{formatQuantity(line.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      {nation.lastReport && (
        <p className="muted">
          上月收入 {formatQuantity(nation.lastReport.income)}，维护实付{" "}
          {formatQuantity(nation.lastReport.paid)}，结余{" "}
          {formatQuantity(nation.lastReport.closingTreasury)}。
        </p>
      )}
    </div>
  );
}

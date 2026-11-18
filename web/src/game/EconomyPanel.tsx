import type { Content } from "../definitions/types";
import type { WorldState } from "../simulation/state";
import { calculateEconomy, formatQuantity } from "../simulation/economy";
import { setBudget, type BudgetCategory } from "../simulation/commands";
import { manpowerCapacity } from "../simulation/civic";
import { militaryUpkeep } from "../simulation/military";
import { researchUpkeep } from "../simulation/research";
import { EconomyBudget } from "./economy/EconomyBudget";
import { EconomySupply } from "./economy/EconomySupply";
import { EconomyModifiers } from "./economy/EconomyModifiers";
import "./economy/economy.css";

interface Props {
  content: Content;
  world: WorldState;
  nationId: string;
  onWorld: (world: WorldState) => void;
}
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
  const capacity = manpowerCapacity(content, world, nationId);
  const balance = economy.income - total;
  return (
    <div className="economy-feature">
      <div className="economy-summary" aria-label="本月财政概况">
        <div>
          <small>国库粮食</small>
          <strong>{formatQuantity(nation.treasury)}</strong>
          <span>可累积的财政储备</span>
        </div>
        <div>
          <small>每月收入</small>
          <strong>+{formatQuantity(economy.income)}</strong>
          <span>按本月运行状态结算</span>
        </div>
        <div>
          <small>计划支出</small>
          <strong>−{formatQuantity(total)}</strong>
          <span>按当前预算比例计算</span>
        </div>
        <div className={balance < 0 ? "is-short" : ""}>
          <small>预计收支</small>
          <strong>
            {balance > 0 ? "+" : ""}
            {formatQuantity(balance)}
          </strong>
          <span>收入减去计划支出</span>
        </div>
      </div>
      <div className="economy-workspace">
        <div className="economy-management">
          <EconomyBudget
            nation={nation}
            demands={demands}
            paymentRatio={ratio}
            onBudget={(category, value) =>
              onWorld(setBudget(world, nationId, category, value))
            }
          />
          <EconomyModifiers
            content={content}
            world={world}
            nationId={nationId}
          />
          <section
            className="ui-section economy-manpower"
            aria-label="全国人力"
          >
            <header className="ui-section-heading">
              <h3>全国人力</h3>
              <span className="ui-badge">军民同源</span>
            </header>
            <div className="economy-reserve">
              <strong>{Math.floor(nation.manpower).toLocaleString()}</strong>
              <span>/ {capacity.toLocaleString()} 储备上限</span>
            </div>
            <progress
              aria-label="全国人力储备"
              value={Math.min(nation.manpower, capacity)}
              max={Math.max(1, capacity)}
            />
            <p className="ui-note">
              军团征募、补员与地方守备共用。每月恢复上限的
              1.5%，在役人员不占储备上限。
            </p>
          </section>
          {nation.lastReport && (
            <div className="economy-last-report">
              <strong>上月结算</strong>
              <span>
                收入 {formatQuantity(nation.lastReport.income)} · 实付{" "}
                {formatQuantity(nation.lastReport.paid)} · 国库结余{" "}
                {formatQuantity(nation.lastReport.closingTreasury)}
              </span>
            </div>
          )}
        </div>
        <EconomySupply content={content} economy={economy} />
      </div>
    </div>
  );
}

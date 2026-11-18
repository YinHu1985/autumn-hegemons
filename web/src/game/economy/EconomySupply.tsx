import type { Content } from "../../definitions/types";
import { calculateEconomy, formatQuantity } from "../../simulation/economy";
import { ResourceCalculation } from "./ResourceCalculation";

export function EconomySupply({
  content,
  economy,
}: {
  content: Content;
  economy: ReturnType<typeof calculateEconomy>;
}) {
  return (
    <section className="ui-section economy-supply" aria-label="商品供给">
      <header className="ui-section-heading">
        <h3>商品供给</h3>
        <span className="ui-badge">每月额度</span>
      </header>
      <p className="ui-note">商品持续供给加工产业与军备，粮食另计入国库。</p>
      <div className="economy-table-scroll">
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
              <tr
                key={good.id}
                className={
                  (economy.available[good.id] ?? 0) < 0 ? "is-short" : ""
                }
              >
                <td>{good.name}</td>
                <td>{formatQuantity(economy.gross[good.id] ?? 0)}</td>
                <td>{formatQuantity(economy.used[good.id] ?? 0)}</td>
                <td>
                  <strong>
                    {formatQuantity(economy.available[good.id] ?? 0)}
                  </strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="economy-sources">
        <summary>查看各项收入来源</summary>
        <div className="economy-source-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>来源</th>
                <th>资源</th>
                <th>收入</th>
              </tr>
            </thead>
            <tbody>
              {economy.lines.map((line, index) => (
                <tr key={index}>
                  <td>{line.source}</td>
                  <td>
                    {
                      content.goods.find((good) => good.id === line.resourceId)
                        ?.name
                    }
                  </td>
                  <td>
                    {line.calculation ? (
                      <ResourceCalculation
                        calculation={line.calculation}
                        label={`${line.source} · ${content.goods.find((good) => good.id === line.resourceId)?.name ?? line.resourceId}`}
                      />
                    ) : (
                      `+${formatQuantity(line.amount)}`
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

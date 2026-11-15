import type { Content } from "../definitions/types";
import type { Economy } from "../simulation/economy";
import { formatQuantity } from "../simulation/economy";

export function ResourceLedger({
  content,
  economy,
}: {
  content: Content;
  economy: Economy;
}) {
  return (
    <div className="treasury-ledger">
      <div className="resource-strip">
        {content.goods.map((good) => (
          <div key={good.id}>
            <small>{good.name}</small>
            <strong>{formatQuantity(economy.available[good.id] ?? 0)}</strong>
          </div>
        ))}
      </div>
      <details>
        <summary>查看收入与供给来源</summary>
        <div className="ledger-lines">
          {economy.lines.map((line, index) => (
            <div key={`${line.source}-${line.resourceId}-${index}`}>
              <span>{line.source}</span>
              <span>
                {
                  content.goods.find((good) => good.id === line.resourceId)
                    ?.name
                }
              </span>
              <strong>+{formatQuantity(line.amount)}</strong>
            </div>
          ))}
        </div>
        {Object.entries(economy.used)
          .filter(([, amount]) => amount > 0)
          .map(([id, amount]) => (
            <p key={id} className="used-line">
              作坊占用 {content.goods.find((good) => good.id === id)?.name}{" "}
              {formatQuantity(amount)}
            </p>
          ))}
      </details>
    </div>
  );
}

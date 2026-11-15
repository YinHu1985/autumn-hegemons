import type { Content } from "../definitions/types";
import type { Battle, TacticalUnit } from "../simulation/military-state";
import type { WorldState } from "../simulation/state";
import { tacticalOrders } from "../simulation/military-tactics";
import { TacticalFloatingPanel } from "./TacticalFloatingPanel";

const glyphs: Record<string, string> = {
  move: "行",
  melee: "击",
  shoot: "射",
  guard: "守",
  wait: "待",
  fire: "火",
  doubt: "疑",
  provoke: "诱",
  rally: "鼓",
  fireArrow: "矢",
};

export function TacticalOrdersPanel({
  content,
  world,
  battle,
  unit,
  mode,
  disabled,
  onOrder,
  onClose,
}: {
  content: Content;
  world: WorldState;
  battle: Battle;
  unit?: TacticalUnit;
  mode: string;
  disabled: boolean;
  onOrder: (id: string, instant: boolean) => void;
  onClose: () => void;
}) {
  const deployment = battle.tactical!.phase === "deployment";
  const orders = tacticalOrders(content, world, battle, unit?.id ?? null);
  const type = content.units.find((entry) => entry.id === unit?.typeId);
  return (
    <TacticalFloatingPanel
      className="tactical-orders-panel"
      title="军令"
      onClose={onClose}
    >
      <div className="tactical-command-actor">
        <strong>
          {type?.name ?? (deployment ? "战前布阵" : "等待行动条")}
        </strong>
        <span>
          {deployment
            ? "部署不消耗行动力"
            : unit
              ? `行动力 ${unit.actionPoints} / ${unit.maxActionPoints}`
              : "条满后由该部队行动"}
        </span>
      </div>
      {deployment ? (
        <p className="tactical-deployment-help">
          选择己方兵牌，再点亮格调整阵列。
          <br />
          准备完成后，按主动性开始积累行动条。
        </p>
      ) : (
        <div className="tactical-order-grid">
          {orders.map((order) => {
            const strategy = content.tactics.strategies.find(
              (entry) => entry.id === order.id,
            );
            const unlockName = strategy?.requires
              ? (content.technologies.find(
                  (entry) => entry.id === strategy.requires,
                )?.name ??
                content.ideas.find((entry) => entry.id === strategy.requires)
                  ?.name ??
                strategy.requires)
              : null;
            const caption = !order.available
              ? order.reason
              : order.id === "move"
                ? "按地形消耗"
                : order.id === "guard"
                  ? "固守至下次行动"
                  : order.id === "wait"
                    ? `士气 +${content.tactics.waitMoraleRecovery}`
                    : `${order.cost} 点${order.successChance !== undefined ? ` · ${Math.round(order.successChance * 100)}%` : order.id === "shoot" ? ` · ${order.range} 格` : "行动力"}`;
            return (
              <button
                key={order.id}
                type="button"
                className={`tactical-order${mode === order.id ? " active" : ""}`}
                disabled={disabled || !order.available}
                aria-pressed={mode === order.id}
                title={[
                  order.reason,
                  `${order.cost} 行动力 · 范围 ${order.range} 格`,
                  strategy?.description,
                  unlockName ? `解锁要求：${unlockName}` : "",
                ]
                  .filter(Boolean)
                  .join("；")}
                onClick={() => onOrder(order.id, order.target === "self")}
              >
                <span>{glyphs[order.id] ?? order.name.slice(0, 1)}</span>
                <strong>{order.name}</strong>
                <small>{caption}</small>
              </button>
            );
          })}
        </div>
      )}
      {!deployment && (
        <p className="tactical-float-note">
          贴身无法移动、射击
          <br />
          每次行动最多施计一次
        </p>
      )}
    </TacticalFloatingPanel>
  );
}

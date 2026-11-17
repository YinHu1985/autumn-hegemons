import { useState } from "react";
import type { Content } from "../definitions/types";
import type { WorldState } from "../simulation/state";
import { TacticalBattle } from "./TacticalBattle";
import { CampaignCard } from "./CampaignCard";
import "./battle.css";
interface Props {
  content: Content;
  world: WorldState;
  nationId: string;
  onWorld: (world: WorldState) => void;
  battleId?: string;
  suspended?: boolean;
}
export function BattlePanel({
  content,
  world,
  nationId,
  onWorld,
  battleId,
  suspended = false,
}: Props) {
  const [message, setMessage] = useState("");
  const [view, setView] = useState<"all" | "defense" | "attack">("all");
  const battles = Object.values(world.military.battles).filter((b) =>
    [b.attackerId, b.defenderId].includes(nationId),
  );
  const active = world.military.activeBattleId
    ? world.military.battles[world.military.activeBattleId]
    : null;
  const battle = active ?? (battleId ? world.military.battles[battleId] : null);
  const run = (fn: () => WorldState) => {
    try {
      onWorld(fn());
      setMessage("");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };
  if (battle?.tactical && battle.phase !== "resolved") {
    return (
      <TacticalBattle
        key={battle.id}
        content={content}
        world={world}
        nationId={nationId}
        battle={battle}
        onWorld={onWorld}
        suspended={suspended}
      />
    );
  }
  const ongoing = battles.filter((entry) => entry.phase !== "resolved");
  const visible = ongoing
    .filter(
      (entry) =>
        view === "all" ||
        (view === "defense"
          ? entry.defenderId === nationId
          : entry.attackerId === nationId),
    )
    .sort(
      (a, b) =>
        Number(b.phase === "ready") - Number(a.phase === "ready") ||
        a.order - b.order,
    );
  const readyCount = ongoing.filter((entry) => entry.phase === "ready").length;
  return (
    <div className="battle-panel feature-panel">
      <div className="battle-overview" aria-label="当前战局">
        <div>
          <small>进行战役</small>
          <strong>{ongoing.length}</strong>
        </div>
        <div>
          <small>本国防守</small>
          <strong>
            {ongoing.filter((entry) => entry.defenderId === nationId).length}
          </strong>
        </div>
        <div>
          <small>对外进攻</small>
          <strong>
            {ongoing.filter((entry) => entry.attackerId === nationId).length}
          </strong>
        </div>
        <div className={readyCount ? "battle-overview-ready" : ""}>
          <small>决战待命</small>
          <strong>{readyCount}</strong>
        </div>
      </div>
      <p className="ui-note">
        每国依次应对进攻，后续战役最多先准备至{" "}
        {Math.round(content.warfare.queuedProgressCap * 100)}
        %。准备完成后暂停天下，在此选择指挥或托管。
      </p>
      <div className="campaign-tabs" aria-label="战役分类">
        {(
          [
            ["all", "全部战役", ongoing.length],
            [
              "defense",
              "本国防守",
              ongoing.filter((entry) => entry.defenderId === nationId).length,
            ],
            [
              "attack",
              "对外进攻",
              ongoing.filter((entry) => entry.attackerId === nationId).length,
            ],
          ] as const
        ).map(([id, label, count]) => (
          <button
            key={id}
            aria-pressed={view === id}
            className={view === id ? "active" : ""}
            onClick={() => setView(id)}
          >
            {label} <b>{count}</b>
          </button>
        ))}
      </div>
      <div className="campaign-list">
        {visible.map((entry) => (
          <CampaignCard
            key={entry.id}
            content={content}
            world={world}
            nationId={nationId}
            battle={entry}
            run={run}
          />
        ))}
        {!visible.length && (
          <div className="ui-empty campaign-empty">
            <strong>
              {view === "defense"
                ? "当前没有受到进攻"
                : view === "attack"
                  ? "当前没有对外进攻"
                  : "当前没有交战"}
            </strong>
            <p>
              在军府选定目标与出征军团即可发起进攻。受到进攻后，可在这里编组迎战。
            </p>
          </div>
        )}
      </div>
      {message && (
        <p className="panel-message" role="status">
          {message}
        </p>
      )}
      <details className="campaign-history">
        <summary>战事记录</summary>
        <div className="battle-log">
          {!world.military.log.length && <p>尚无战事记录。</p>}
          {world.military.log.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      </details>
    </div>
  );
}

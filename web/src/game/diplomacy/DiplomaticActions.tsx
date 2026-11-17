import { useState } from "react";
import type { Content } from "../../definitions/types";
import type { WorldState } from "../../simulation/state";
import { startDiplomaticMission } from "../../simulation/diplomacy";
import { signedRelation } from "./presentation";

export function DiplomaticActions({
  content,
  world,
  nationId,
  targetId,
  run,
  onTalents,
}: {
  content: Content;
  world: WorldState;
  nationId: string;
  targetId: string;
  run: (command: () => WorldState) => void;
  onTalents?: () => void;
}) {
  const [envoyId, setEnvoyId] = useState("");
  const envoys = Object.values(world.research.talents).filter(
    (talent) =>
      talent.nationId === nationId &&
      talent.role === "envoy" &&
      talent.recruitedMonth !== null &&
      !talent.busy,
  );
  const selectedEnvoy =
    envoys.find((envoy) => envoy.id === envoyId) ?? envoys[0];
  const underway = world.diplomacy.missions.some(
    (mission) =>
      mission.nationId === nationId && mission.targetNationId === targetId,
  );
  const exists = Object.values(world.settlements).some(
    (city) => city.owner === targetId,
  );
  if (targetId === nationId)
    return (
      <p className="diplomatic-note ui-empty">
        本国与列国的往来列于下方，选择其他国家安排出使。
      </p>
    );
  if (!exists)
    return (
      <p className="diplomatic-note ui-empty">该国已无城邑，不能安排出使。</p>
    );
  return (
    <section className="diplomatic-actions" aria-label="安排外交任务">
      <header className="ui-section-heading">
        <h3>安排出使</h3>
        <span className="ui-badge">使者 {envoys.length} 人待命</span>
      </header>
      <div className="envoy-assignment">
        <label>
          出使人选
          <select
            aria-label="出使人选"
            disabled={!envoys.length || underway}
            value={selectedEnvoy?.id ?? ""}
            onChange={(event) => setEnvoyId(event.target.value)}
          >
            {!envoys.length && <option value="">暂无空闲使者</option>}
            {envoys.map((envoy) => (
              <option value={envoy.id} key={envoy.id}>
                {envoy.name}
              </option>
            ))}
          </select>
        </label>
        {onTalents && (
          <button className="quiet" onClick={onTalents}>
            任命使者
          </button>
        )}
      </div>
      {!envoys.length && !underway && (
        <p className="diplomatic-note">
          请先在人才馆将一位已招募、空闲的人才调任使者。出使期间不能转任。
        </p>
      )}
      {underway && (
        <p className="diplomatic-note">
          本国已有使者前往该国，完成或召回后可再次派遣。
        </p>
      )}
      <div className="diplomatic-action-cards">
        {content.diplomacy.actions.map((action) => {
          const affordable = world.nations[nationId].treasury >= action.cost;
          const disabled =
            !selectedEnvoy ||
            underway ||
            !affordable ||
            !!world.military.activeBattleId;
          return (
            <article key={action.id}>
              <div
                className={`diplomatic-action-mark ${action.relationChange < 0 ? "hostile" : "friendly"}`}
              >
                {action.relationChange < 0 ? "斥" : "礼"}
              </div>
              <div>
                <h3>{action.name}</h3>
                <p>
                  完成后关系 <b>{signedRelation(action.relationChange)}</b>
                </p>
                <small>
                  {action.days} 日 ·{" "}
                  {action.cost > 0 ? `${action.cost} 粮` : "不耗粮食"}
                </small>
              </div>
              <button
                className={action.relationChange > 0 ? "primary" : "danger"}
                disabled={disabled}
                title={!affordable ? "国库粮食不足" : undefined}
                onClick={() =>
                  selectedEnvoy &&
                  run(() =>
                    startDiplomaticMission(
                      content,
                      world,
                      nationId,
                      targetId,
                      action.id,
                      selectedEnvoy.id,
                    ),
                  )
                }
              >
                安排{action.name}
              </button>
            </article>
          );
        })}
      </div>
      <p className="diplomatic-note">
        每位使者同时执行一项任务。派遣时支付粮食，完成时改变关系；召回不退还粮食。
      </p>
    </section>
  );
}

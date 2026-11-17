import type { Content } from "../../definitions/types";
import type { WorldState } from "../../simulation/state";
import { cancelDiplomaticMission } from "../../simulation/diplomacy";

export function DiplomaticMissionList({
  content,
  world,
  nationId,
  run,
}: {
  content: Content;
  world: WorldState;
  nationId: string;
  run: (command: () => WorldState) => void;
}) {
  const missions = world.diplomacy.missions.filter(
    (mission) => mission.nationId === nationId,
  );
  return (
    <section className="diplomatic-missions" aria-label="本国出使任务">
      <header className="ui-section-heading">
        <h3>使节在途</h3>
        <span className="ui-badge">{missions.length} 项</span>
      </header>
      {!missions.length && (
        <p className="diplomatic-empty">
          尚无使节在外。选定国家与人选后，可在上方安排出使。
        </p>
      )}
      {missions.map((mission) => {
        const target = content.scenario.nations.find(
          (nation) => nation.id === mission.targetNationId,
        );
        const action = content.diplomacy.actions.find(
          (action) => action.id === mission.actionId,
        );
        const envoy = world.research.talents[mission.envoyId];
        const elapsed = mission.totalDays - mission.remainingDays;
        return (
          <article key={mission.id} className="diplomatic-mission">
            <div>
              <strong>
                赴{target?.name} · {action?.name}
              </strong>
              <span>
                {envoy?.name ?? "使者"} · 尚余 {mission.remainingDays} 日
              </span>
            </div>
            <progress
              aria-label={`赴${target?.name}${action?.name}进度`}
              max={mission.totalDays}
              value={elapsed}
            />
            <button
              className="danger"
              title="召回使者，已付粮食不退还"
              onClick={() =>
                run(() => cancelDiplomaticMission(world, nationId, mission.id))
              }
            >
              召回使者
            </button>
          </article>
        );
      })}
    </section>
  );
}

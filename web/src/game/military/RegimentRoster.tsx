import type { Content } from "../../definitions/types";
import type { WorldState } from "../../simulation/state";
import type { Army } from "../../simulation/military-state";
import {
  demobilizeRegiment,
  professionalizeRegiment,
  maximumCadreRatio,
  transferRegiment,
  dismissArmy,
  reinforceArmy,
} from "../../simulation/military";
import {
  fatigueRecoveryRemaining,
  recentCombatRemaining,
} from "../militaryPresentation";

export function RegimentRoster({
  content,
  world,
  nationId,
  army,
  armies,
  run,
}: {
  content: Content;
  world: WorldState;
  nationId: string;
  army: Army;
  armies: Army[];
  run: (command: () => WorldState) => void;
}) {
  const transferable = armies.filter(
    (entry) =>
      entry.id !== army.id &&
      entry.cityId === army.cityId &&
      entry.status === "idle",
  );
  return (
    <section className="ui-section regiment-section" aria-label="军团编队">
      <header className="ui-section-heading">
        <div>
          <h3>军团编队</h3>
          <small>常备核心与征召兵共同组成部队</small>
        </div>
        <button
          disabled={army.status !== "idle" || !army.units.length}
          onClick={() =>
            run(() => reinforceArmy(content, world, nationId, army.id))
          }
        >
          补员整训
        </button>
      </header>
      <div className="regiment-list">
        {army.units.map((unit, index) => (
          <article className="regiment" key={unit.id}>
            <header className="regiment-heading">
              <span className="regiment-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <strong>
                  {content.units.find((type) => type.id === unit.typeId)?.name}
                </strong>
                <small>
                  常备 {unit.cadre.toLocaleString()} · 征召{" "}
                  {unit.levy.toLocaleString()}
                </small>
              </div>
              <span className="regiment-strength">
                {(unit.cadre + unit.levy).toLocaleString()}
                <small>人</small>
              </span>
            </header>
            <div className="regiment-condition">
              <span>
                士气 <b>{Math.round(unit.morale)}</b>
              </span>
              <progress
                aria-label={`第${index + 1}队士气`}
                max="100"
                value={unit.morale}
              />
              <span>
                训练 <b>{Math.round(unit.training)}</b>
              </span>
            </div>
            {(unit.offensiveFatigue ?? 0) > 0 && (
              <p
                className="military-warning"
                title="已有进攻疲劳在攻守战中均生效；只有回池休整才能消除"
              >
                进攻疲劳 −{Math.round((unit.offensiveFatigue ?? 0) * 100)}% ·
                需休整约 {fatigueRecoveryRemaining(content, unit)} 日
              </p>
            )}
            {recentCombatRemaining(content, world, unit) > 0 && (
              <p className="military-warning">
                {recentCombatRemaining(content, world, unit)}{" "}
                日内再出征将叠加疲劳；防守不新增。
              </p>
            )}
            <footer className="regiment-actions">
              <button
                title={`常备比例上限 ${Math.round(maximumCadreRatio(content, world, nationId, unit.typeId) * 100)}%`}
                disabled={
                  army.status !== "idle" ||
                  unit.cadre / (unit.cadre + unit.levy) >=
                    maximumCadreRatio(content, world, nationId, unit.typeId)
                }
                onClick={() =>
                  run(() =>
                    professionalizeRegiment(
                      content,
                      world,
                      nationId,
                      army.id,
                      unit.id,
                    ),
                  )
                }
              >
                增训常备
              </button>
              <select
                aria-label={`调编第${index + 1}队`}
                title={
                  transferable.length
                    ? "调往同城的空闲军团"
                    : "同城暂无其他空闲军团"
                }
                value=""
                disabled={army.status !== "idle" || !transferable.length}
                onChange={(event) =>
                  run(() =>
                    transferRegiment(
                      world,
                      nationId,
                      army.id,
                      event.target.value,
                      unit.id,
                    ),
                  )
                }
              >
                <option value="">调编至…</option>
                {transferable.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
              <button
                className="danger regiment-demobilize"
                disabled={army.status !== "idle"}
                onClick={() =>
                  run(() =>
                    demobilizeRegiment(
                      content,
                      world,
                      nationId,
                      army.id,
                      unit.id,
                    ),
                  )
                }
              >
                复员
              </button>
            </footer>
          </article>
        ))}
        {!army.units.length && (
          <div className="ui-empty">
            <strong>军团尚无部队</strong>
            <p>在右侧征募部队，或裁撤这个空编制。</p>
            <button
              className="danger"
              disabled={army.status !== "idle"}
              onClick={() => run(() => dismissArmy(world, nationId, army.id))}
            >
              裁撤空军团
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

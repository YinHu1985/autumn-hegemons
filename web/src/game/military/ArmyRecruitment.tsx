import { useState } from "react";
import type { Content } from "../../definitions/types";
import type { WorldState } from "../../simulation/state";
import type { Army } from "../../simulation/military-state";
import { recruitRegiment, unitUnlocked } from "../../simulation/military";

export function ArmyRecruitment({
  content,
  world,
  nationId,
  army,
  run,
}: {
  content: Content;
  world: WorldState;
  nationId: string;
  army: Army;
  run: (command: () => WorldState) => void;
}) {
  const [typeId, setTypeId] = useState("levy");
  const type =
    content.units.find((entry) => entry.id === typeId) ?? content.units[0];
  return (
    <section className="ui-section army-recruitment" aria-label="征募部队">
      <header className="ui-section-heading">
        <h3>征募部队</h3>
        <span className="ui-badge">加入当前军团</span>
      </header>
      <label className="army-field">
        <span>征募兵种</span>
        <select
          value={type?.id ?? ""}
          onChange={(event) => setTypeId(event.target.value)}
        >
          {content.units.map((entry) => (
            <option
              key={entry.id}
              value={entry.id}
              disabled={!unitUnlocked(content, world, nationId, entry.id)}
            >
              {entry.name}
              {!unitUnlocked(content, world, nationId, entry.id)
                ? " · 科技未解锁"
                : ""}
            </option>
          ))}
        </select>
      </label>
      {type && (
        <>
          <p className="army-unit-description">{type.description}</p>
          <dl className="recruitment-quote">
            <div>
              <dt>征募耗粮</dt>
              <dd>{type.cost}</dd>
            </div>
            <div>
              <dt>每月维护</dt>
              <dd>{type.upkeep}</dd>
            </div>
            <div>
              <dt>常备 / 征召</dt>
              <dd>
                {type.cadre} / {type.levy}
              </dd>
            </div>
          </dl>
          <div className="ui-actions">
            <button
              className="primary"
              disabled={
                army.status !== "idle" ||
                !unitUnlocked(content, world, nationId, type.id)
              }
              onClick={() =>
                run(() =>
                  recruitRegiment(content, world, nationId, army.id, type.id),
                )
              }
            >
              征募部队 · {type.cost}粮
            </button>
          </div>
        </>
      )}
      {army.status !== "idle" && (
        <p className="ui-note">军团回到调度池后方可征募、补员或调编。</p>
      )}
    </section>
  );
}

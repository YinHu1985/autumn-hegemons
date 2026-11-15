import { useState } from "react";
import type { Content } from "../../definitions/types";
import type { WorldState } from "../../simulation/state";
import { armyStatusLabel } from "../militaryPresentation";
import { battleQueuePosition } from "../../simulation/military";
import "./hud.css";

interface Props {
  content: Content;
  world: WorldState;
  selectedCityId: string;
  onCity: (id: string) => void;
  onMilitary: () => void;
  onResearch: () => void;
  onBattles: () => void;
}

type Section = "cities" | "armies" | "research" | "construction";
export function Outliner({
  content,
  world,
  selectedCityId,
  onCity,
  onMilitary,
  onResearch,
  onBattles,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [sections, setSections] = useState<Record<Section, boolean>>({
    cities: true,
    armies: true,
    research: true,
    construction: true,
  });
  const nationId = world.playerNationId;
  const cities = content.scenario.settlements.filter(
    (city) => world.settlements[city.id].owner === nationId,
  );
  const armies = Object.values(world.military.armies).filter(
    (army) => army.nationId === nationId,
  );
  const groups = world.research.nations[nationId]?.groups ?? [];
  const construction = cities.filter(
    (city) => world.settlements[city.id].construction,
  );
  const battles = Object.values(world.military.battles).filter(
    (battle) =>
      battle.phase !== "resolved" &&
      [battle.attackerId, battle.defenderId].includes(nationId),
  );
  const sectionTitle = (id: Section, name: string, count: number) => (
    <button
      className="outliner-section-heading"
      aria-expanded={sections[id]}
      onClick={() =>
        setSections((previous) => ({ ...previous, [id]: !previous[id] }))
      }
    >
      <span>
        {sections[id] ? "▾" : "▸"} {name}
      </span>
      <b>{count}</b>
    </button>
  );
  return (
    <aside
      className={`strategy-outliner ${collapsed ? "collapsed" : ""}`}
      aria-label="国家信息列表"
    >
      <header>
        <span>国势总览</span>
        <button
          aria-label={collapsed ? "展开信息列表" : "收起信息列表"}
          title={collapsed ? "展开信息列表" : "收起信息列表"}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? "‹" : "›"}
        </button>
      </header>
      {collapsed ? (
        <div className="outliner-shortcuts">
          <button
            title="展开城邑列表"
            onClick={() => {
              setCollapsed(false);
              setSections((previous) => ({ ...previous, cities: true }));
            }}
          >
            <span>邑</span>
            <b>{cities.length}</b>
          </button>
          <button title="军团与出征" onClick={onMilitary}>
            <span>军</span>
            <b>{armies.length}</b>
          </button>
          <button title="研究课题" onClick={onResearch}>
            <span>学</span>
            <b>{groups.length}</b>
          </button>
        </div>
      ) : (
        <div className="outliner-scroll">
          <section>
            {sectionTitle("cities", "直辖城邑", cities.length)}
            {sections.cities && (
              <div className="outliner-rows">
                {cities.map((city) => {
                  const state = world.settlements[city.id];
                  return (
                    <button
                      key={city.id}
                      className={`outliner-city ${city.id === selectedCityId ? "active" : ""}`}
                      onClick={() => onCity(city.id)}
                      title={`定位${city.name} · 规模${state.scale} · 治理${Math.round(state.governance * 100)}%`}
                    >
                      <span className="outliner-row-symbol">邑</span>
                      <span>
                        <strong>{city.name}</strong>
                        <small>
                          {state.construction
                            ? "营建中"
                            : `治理 ${Math.round(state.governance * 100)}%`}
                        </small>
                      </span>
                      <em>{state.scale}</em>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
          <section>
            {sectionTitle("armies", "军团", armies.length)}
            {sections.armies && (
              <div className="outliner-rows">
                {armies.map((army) => (
                  <button
                    key={army.id}
                    onClick={onMilitary}
                    title={`${army.name} · 点击管理军团`}
                  >
                    <span className="outliner-row-symbol">⚑</span>
                    <span>
                      <strong>{army.name}</strong>
                      <small>
                        {armyStatusLabel(army)}
                        {army.status === "returning"
                          ? ` ${army.remainingDays}日`
                          : ""}{" "}
                        ·{" "}
                        {
                          content.scenario.settlements.find(
                            (city) => city.id === army.cityId,
                          )?.name
                        }
                      </small>
                    </span>
                    <em>
                      {Math.round(
                        army.units.reduce(
                          (sum, unit) => sum + unit.cadre + unit.levy,
                          0,
                        ) / 100,
                      ) / 10}
                      千
                    </em>
                  </button>
                ))}
                {!armies.length && (
                  <p className="outliner-empty">尚无在役军团</p>
                )}
              </div>
            )}
          </section>
          {battles.length > 0 && (
            <section>
              <button className="outliner-battles" onClick={onBattles}>
                {battles.some((battle) => battle.phase === "ready")
                  ? "决战待命"
                  : "边境战报"}{" "}
                <b>{battles.length}</b>
                <span>查看 ›</span>
              </button>
              <div className="outliner-rows">
                {battles
                  .slice()
                  .sort(
                    (a, b) =>
                      Number(b.phase === "ready") -
                        Number(a.phase === "ready") || a.order - b.order,
                  )
                  .map((battle) => {
                    const position = battleQueuePosition(world, battle);
                    return (
                      <button key={battle.id} onClick={onBattles}>
                        <span className="outliner-row-symbol">
                          {battle.defenderId === nationId ? "守" : "攻"}
                        </span>
                        <span>
                          <strong>
                            {
                              content.scenario.settlements.find(
                                (city) => city.id === battle.cityId,
                              )?.name
                            }
                          </strong>
                          <small>
                            {battle.phase === "ready"
                              ? "准备完成 · 待决战"
                              : position > 1
                                ? `排队第${position}场 · ${Math.round((battle.elapsed / battle.preparationDays) * 100)}%`
                                : `准备中 · 余${battle.preparationDays - battle.elapsed}日`}
                          </small>
                        </span>
                        <em>›</em>
                      </button>
                    );
                  })}
              </div>
            </section>
          )}
          <section>
            {sectionTitle("research", "在研课题", groups.length)}
            {sections.research && (
              <div className="outliner-rows">
                {groups.map((group) => (
                  <button key={group.id} onClick={onResearch}>
                    <span className="outliner-row-symbol">学</span>
                    <span>
                      <strong>
                        {[...content.technologies, ...content.ideas].find(
                          (subject) => subject.id === group.targetId,
                        )?.name ?? group.targetId}
                      </strong>
                      <small>
                        {world.research.talents[group.leaderId]?.name}主持
                      </small>
                    </span>
                    <em>›</em>
                  </button>
                ))}
                {!groups.length && (
                  <button className="outliner-empty-link" onClick={onResearch}>
                    尚无课题 · 前往安排 ›
                  </button>
                )}
              </div>
            )}
          </section>
          {construction.length > 0 && (
            <section>
              {sectionTitle("construction", "营建工程", construction.length)}
              {sections.construction && (
                <div className="outliner-rows">
                  {construction.map((city) => {
                    const work = world.settlements[city.id].construction!;
                    const name =
                      work.buildingId === "__expand"
                        ? "扩建城邑"
                        : content.buildings.find(
                            (building) => building.id === work.buildingId,
                          )?.name;
                    return (
                      <button key={city.id} onClick={() => onCity(city.id)}>
                        <span className="outliner-row-symbol">工</span>
                        <span>
                          <strong>{city.name}</strong>
                          <small>{name}</small>
                        </span>
                        <em>{work.remainingDays}日</em>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </aside>
  );
}

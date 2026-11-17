import { useState } from "react";
import type { NationStart, Scenario } from "../../definitions/types";
import "./scenario-setup.css";

interface Props {
  scenarios: Scenario[];
  scenario: Scenario;
  onScenario: (scenario: Scenario) => void;
  onStart: (scenario: Scenario, nationId: string) => void;
}

export const scenarioYear = (scenario: Scenario) =>
  `${scenario.start.year < 0 ? "前" : ""}${Math.abs(scenario.start.year)}年`;

function recommendedNations(scenario: Scenario): NationStart[] {
  const ids = scenario.recommendedNations ?? [];
  const recommended = ids
    .map((id) => scenario.nations.find((nation) => nation.id === id))
    .filter((nation): nation is NationStart => !!nation);
  return recommended.length ? recommended : scenario.nations.slice(0, 6);
}

/** Selection is only a proposal; no world is created until the player starts. */
export function ScenarioSetup({
  scenarios,
  scenario,
  onScenario,
  onStart,
}: Props) {
  const [selectedId, setSelectedId] = useState(
    recommendedNations(scenario)[0]?.id ?? scenario.nations[0]?.id,
  );
  const selected =
    scenario.nations.find((nation) => nation.id === selectedId) ??
    recommendedNations(scenario)[0] ??
    scenario.nations[0];
  const cities = scenario.settlements.filter(
    (city) => city.owner === selected?.id,
  );
  const cityCounts = new Map<string, number>();
  for (const city of scenario.settlements)
    cityCounts.set(city.owner, (cityCounts.get(city.owner) ?? 0) + 1);
  const recommend = recommendedNations(scenario);
  const chooseScenario = (next: Scenario) => {
    setSelectedId(recommendedNations(next)[0]?.id ?? next.nations[0]?.id);
    onScenario(next);
  };

  return (
    <section className="scenario-setup" aria-label="剧本与国家选择">
      <nav className="scenario-choices" aria-label="选择剧本">
        {scenarios.map((entry, index) => (
          <button
            key={entry.id ?? index}
            aria-pressed={entry === scenario}
            onClick={() => chooseScenario(entry)}
          >
            <small>{scenarioYear(entry)}</small>
            <strong>{entry.name ?? "自定义剧本"}</strong>
            <span>
              {entry.nations.length} 国 · {entry.settlements.length} 城
            </span>
          </button>
        ))}
      </nav>
      <p className="scenario-description">
        {scenario.description ?? "选择一方诸侯，发展城邑，延揽贤士，问鼎天下。"}
      </p>
      <div className="scenario-select-scroll">
        <div className="scenario-section-heading">
          <h3>推荐诸侯</h3>
          <span>择一方而治天下</span>
        </div>
        <div className="recommended-nations" aria-label="推荐国家">
          {recommend.map((nation) => (
            <button
              key={nation.id}
              aria-pressed={selected?.id === nation.id}
              onClick={() => setSelectedId(nation.id)}
              title={nation.description}
            >
              <strong style={{ borderColor: nation.color }}>
                {nation.name}
              </strong>
              <span>{cityCounts.get(nation.id) ?? 0} 城</span>
            </button>
          ))}
        </div>
        <div className="scenario-section-heading">
          <h3>列国名录</h3>
          <span>全部 {scenario.nations.length} 国，皆可执掌</span>
        </div>
        <div
          key={scenarios.indexOf(scenario)}
          className="scenario-nation-list"
          aria-label="全部国家"
        >
          {scenario.nations.map((nation) => (
            <button
              key={nation.id}
              aria-pressed={selected?.id === nation.id}
              onClick={() => setSelectedId(nation.id)}
            >
              <i
                style={{ background: nation.color ?? "#687e70" }}
                aria-hidden="true"
              />
              <strong>{nation.name}</strong>
              <span>{cityCounts.get(nation.id) ?? 0} 城</span>
            </button>
          ))}
        </div>
      </div>
      <footer className="scenario-confirm">
        <section className="selected-nation" aria-label="所选国家详情">
          {selected && (
            <>
              <header>
                <strong>{selected.name}</strong>
                <span>
                  {scenarioYear(scenario)} · {cities.length} 座城邑
                </span>
              </header>
              <p>
                {selected.description ??
                  "掌治城邑，整军修政，在列国间谋求生存与壮大。"}
              </p>
              <small>
                主要城邑：
                {[...cities]
                  .sort((a, b) => b.scale - a.scale)
                  .slice(0, 5)
                  .map((city) => city.name)
                  .join("、") || "暂无城邑"}
              </small>
            </>
          )}
        </section>
        <button
          className="system-menu-primary primary"
          disabled={!selected || !cities.length}
          onClick={() => selected && onStart(scenario, selected.id)}
        >
          开启新局 · {selected?.name ?? "请选择国家"}
        </button>
      </footer>
    </section>
  );
}

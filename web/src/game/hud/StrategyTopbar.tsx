import type { Content } from "../../definitions/types";
import type { WorldState } from "../../simulation/state";
import { calculateEconomy, formatQuantity } from "../../simulation/economy";
import { manpowerCapacity } from "../../simulation/civic";
import { militaryUpkeep } from "../../simulation/military";
import { researchUpkeep } from "../../simulation/research";
import { PRIMARY_PAGES, type GamePage } from "./navigation";
import "./hud.css";

interface Props {
  content: Content;
  world: WorldState;
  page: GamePage | null;
  playing: boolean;
  speed: number;
  locked: boolean;
  timeBlocked?: boolean;
  timeBlockedReason?: string;
  onPage: (page: GamePage) => void;
  onToggleTime: () => void;
  onSpeed: (speed: number) => void;
  onMenu: () => void;
}

export function StrategyTopbar({
  content,
  world,
  page,
  playing,
  speed,
  locked,
  timeBlocked = false,
  timeBlockedReason,
  onPage,
  onToggleTime,
  onSpeed,
  onMenu,
}: Props) {
  const nationId = world.playerNationId;
  const nation = world.nations[nationId];
  const definition = content.scenario.nations.find(
    (entry) => entry.id === nationId,
  );
  const economy = calculateEconomy(content, world, nationId);
  const planned =
    economy.fullBuildingUpkeep * nation.budget.buildings +
    militaryUpkeep(content, world, nationId) * nation.budget.army +
    researchUpkeep(content, world, nationId) * nation.budget.research;
  const balance = economy.income - planned;
  const capacity = manpowerCapacity(content, world, nationId);
  const date = world.date;
  const events = world.civic.events.filter(
    (event) => event.nationId === nationId,
  ).length;
  const battles = Object.values(world.military.battles).filter(
    (battle) =>
      battle.phase !== "resolved" &&
      [battle.attackerId, battle.defenderId].includes(nationId),
  ).length;
  return (
    <header className="strategy-topbar" aria-label="国家总览与政令">
      <div className="hud-country" title={`${definition?.name}国`}>
        <span className="hud-country-seal">{definition?.name}</span>
        <small>列国争衡</small>
      </div>
      <div className="hud-resources" aria-label="国家资源">
        <div className="hud-resource" title="国库粮食：可积累的财政储备">
          <span className="hud-resource-mark">粟</span>
          <span>
            <small>国库粮食</small>
            <strong>{formatQuantity(nation.treasury)}</strong>
          </span>
        </div>
        <div
          className="hud-resource"
          title={`月入 ${formatQuantity(economy.income)} / 计划支出 ${formatQuantity(planned)}`}
        >
          <span className="hud-resource-mark">赋</span>
          <span>
            <small>每月结余</small>
            <strong className={balance < 0 ? "negative" : "positive"}>
              {balance >= 0 ? "+" : ""}
              {formatQuantity(balance)}
            </strong>
          </span>
        </div>
        <div
          className="hud-resource hud-manpower"
          title={`全国人力容量 ${Math.floor(capacity).toLocaleString()}；军团与地方守备共用，在役人员不占储备上限`}
        >
          <span className="hud-resource-mark">丁</span>
          <span>
            <small>可征人力</small>
            <strong>
              {Math.floor(nation.manpower).toLocaleString()}
              <em> / {formatQuantity(capacity)}</em>
            </strong>
          </span>
        </div>
      </div>
      <nav className="hud-primary-nav" aria-label="国家政令">
        {PRIMARY_PAGES.map((entry) => (
          <button
            key={entry.id}
            className={page === entry.id ? "active" : ""}
            aria-pressed={page === entry.id}
            aria-label={entry.label}
            title={entry.description}
            disabled={locked && entry.id !== "battles"}
            onClick={() => onPage(entry.id)}
          >
            <span className="hud-nav-glyph">{entry.glyph}</span>
            <span>{entry.label}</span>
            {entry.id === "battles" && battles > 0 && (
              <b className="hud-notice-count">{battles}</b>
            )}
          </button>
        ))}
      </nav>
      <div className="hud-utilities" aria-label="纪事与系统">
        <button
          aria-label="纪事"
          title="纪事与待议国事"
          aria-pressed={page === "events"}
          className={page === "events" ? "active" : ""}
          disabled={locked}
          onClick={() => onPage("events")}
        >
          <span>史</span>纪事
          {events > 0 && <b className="hud-notice-count">{events}</b>}
        </button>
        <button
          aria-label="系统菜单"
          title="系统菜单 · 存档、新局与内容工坊"
          onClick={onMenu}
        >
          <span>☰</span>系统
        </button>
      </div>
      <div className="hud-clock">
        <div className="hud-date">
          <i>{["春", "夏", "秋", "冬"][Math.floor((date.month - 1) / 3)]}</i>
          <strong>{date.year < 0 ? `前${-date.year}` : date.year}年</strong>
          <span>
            {date.month}月{date.day}日
          </span>
        </div>
        <div className="hud-clock-controls">
          <button
            className={`hud-play ${playing ? "" : "paused"}`}
            disabled={
              locked ||
              timeBlocked ||
              !Object.values(world.settlements).some(
                (city) => city.owner === nationId,
              )
            }
            aria-label={playing ? "暂停时间" : "继续时间"}
            title={
              timeBlocked
                ? (timeBlockedReason ??
                  "决战日期已到，请到战役窗口处理待决战役")
                : "空格暂停 / 继续"
            }
            onClick={onToggleTime}
          >
            {playing ? "Ⅱ" : "▶"}
            <span>{playing ? "暂停" : "继续"}</span>
          </button>
          <div className="hud-speeds" aria-label="时间速度">
            {[1, 2, 4, 8, 16].map((value) => (
              <button
                key={value}
                aria-label={`${value}倍速度`}
                aria-pressed={value === speed}
                className={value === speed ? "active" : ""}
                onClick={() => onSpeed(value)}
              >
                {value}×
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}

import { useMusic } from "./MusicProvider";
import "./music-settings.css";

/** Music controls belong to the system menu, away from strategic commands. */
export function MusicSettings() {
  const music = useMusic();
  if (!music) return null;
  const { snapshot: state } = music;
  const status = !state
    ? music.unavailable
      ? "音乐暂不可用"
      : "正在载入曲目…"
    : !state.enabled || state.volume === 0
      ? "已静音"
      : state.status === "locked"
        ? "点击界面后播放"
        : state.status === "error"
          ? "曲目暂不可用"
          : state.status === "playing"
            ? "正在播放"
            : state.status === "loading"
              ? "正在载入"
              : "已暂停";
  return (
    <section className="music-settings" aria-label="音乐设置">
      <div className="music-settings-heading">
        <label>
          <input
            type="checkbox"
            checked={state?.enabled ?? true}
            disabled={!state}
            onChange={(event) => music.setEnabled(event.target.checked)}
          />
          背景音乐
        </label>
        <output>{Math.round((state?.volume ?? 0.3) * 100)}%</output>
      </div>
      <input
        aria-label="音乐音量"
        type="range"
        min="0"
        max="100"
        step="1"
        value={Math.round((state?.volume ?? 0.3) * 100)}
        disabled={!state}
        onChange={(event) => music.setVolume(Number(event.target.value) / 100)}
      />
      <div className="music-current-track">
        <span title={state?.title}>
          <small>{status}</small>
          {state?.title && <strong>{state.title}</strong>}
        </span>
        {state?.scene === "strategy" && (
          <button
            onClick={music.next}
            aria-label="下一首音乐"
            title="下一首音乐"
          >
            下一首 ›
          </button>
        )}
      </div>
    </section>
  );
}

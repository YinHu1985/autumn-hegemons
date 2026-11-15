/** Presentation content: music never changes the simulation or saved campaign. */
export type MusicScene = "title" | "strategy" | "battle";
export interface MusicTrack {
  id: string;
  title: string;
  /** Site-relative path, resolved against Vite's base (including GitHub Pages). */
  src: string;
}
export interface MusicManifest {
  version: 1;
  defaultVolume: number;
  mainTheme: string;
  battle: string;
  strategy: string[];
  tracks: MusicTrack[];
}
export interface MusicPreferences {
  enabled: boolean;
  volume: number;
}

export function parseMusicManifest(value: unknown): MusicManifest {
  if (!value || typeof value !== "object") throw new Error("音乐定义无效");
  const data = value as Partial<MusicManifest>;
  if (
    data.version !== 1 ||
    typeof data.defaultVolume !== "number" ||
    !Number.isFinite(data.defaultVolume) ||
    data.defaultVolume < 0 ||
    data.defaultVolume > 1 ||
    !Array.isArray(data.tracks) ||
    !data.tracks.length ||
    !Array.isArray(data.strategy) ||
    !data.strategy.length
  )
    throw new Error("音乐列表或默认音量无效");
  const ids = new Set<string>();
  for (const track of data.tracks) {
    if (
      !track ||
      typeof track.id !== "string" ||
      !track.id.trim() ||
      typeof track.title !== "string" ||
      !track.title.trim() ||
      typeof track.src !== "string" ||
      !/^(?:[\w-]+\/)*[\w.-]+\.(mp3|wav|ogg|m4a)$/i.test(track.src) ||
      ids.has(track.id)
    )
      throw new Error("音乐条目、资源路径或 ID 无效");
    ids.add(track.id);
  }
  for (const id of [data.mainTheme, data.battle, ...data.strategy]) {
    if (typeof id !== "string" || !ids.has(id))
      throw new Error("音乐场景引用了不存在的曲目");
  }
  if (new Set(data.strategy).size !== data.strategy.length)
    throw new Error("大地图播放列表不应重复列出曲目");
  return data as MusicManifest;
}

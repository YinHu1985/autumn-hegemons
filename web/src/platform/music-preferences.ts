import type { MusicPreferences } from "../definitions/music";

export const MUSIC_SETTINGS_KEY = "autumn-hegemons.music.v1";

export function readMusicPreferences(defaultVolume: number): MusicPreferences {
  try {
    const saved = JSON.parse(
      localStorage.getItem(MUSIC_SETTINGS_KEY) ?? "null",
    );
    return {
      enabled: typeof saved?.enabled === "boolean" ? saved.enabled : true,
      volume:
        typeof saved?.volume === "number" && Number.isFinite(saved.volume)
          ? Math.max(0, Math.min(1, saved.volume))
          : defaultVolume,
    };
  } catch {
    return { enabled: true, volume: defaultVolume };
  }
}

export function saveMusicPreferences(preferences: MusicPreferences) {
  try {
    localStorage.setItem(MUSIC_SETTINGS_KEY, JSON.stringify(preferences));
  } catch {
    // Optional device preferences must not block play or campaign saving.
  }
}

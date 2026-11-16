import type {
  MusicManifest,
  MusicPreferences,
  MusicScene,
} from "../definitions/music";

export interface MusicSnapshot extends MusicPreferences {
  scene: MusicScene | null;
  trackId: string | null;
  title: string;
  status: "locked" | "playing" | "paused" | "loading" | "error";
}

interface Options {
  manifest: MusicManifest;
  baseUrl: string;
  preferences?: MusicPreferences;
  createAudio?: () => HTMLAudioElement;
  /** Startup may supply a downloaded Blob URL for a public audio URL. */
  resolveSource?: (absoluteUrl: string) => string;
  onChange?: () => void;
}

interface TrackPlayback {
  audio: HTMLAudioElement;
  listeners: Record<string, EventListener>;
}

const clampVolume = (value: number, fallback: number) =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;

/** Browser media only: scene selection and preferences come from the UI host.
 * Tracks are created lazily and kept paused between scenes, retaining their place.
 */
export function createMusicPlayer({
  manifest,
  baseUrl,
  preferences,
  createAudio = () => new Audio(),
  resolveSource = (url) => url,
  onChange,
}: Options) {
  const tracks = new Map(manifest.tracks.map((track) => [track.id, track]));
  const playback = new Map<string, TrackPlayback>();
  const failed = new Set<string>();
  let scene: MusicScene | null = null;
  let strategyIndex = 0;
  let enabled = preferences?.enabled ?? true;
  let volume = clampVolume(preferences?.volume ?? manifest.defaultVolume, 0.3);
  let unlocked = false;
  let hidden = false;
  let disposed = false;
  let generation = 0;
  let pending: { generation: number; audio: HTMLAudioElement } | null = null;
  let status: MusicSnapshot["status"] = "locked";

  const trackId = () =>
    scene === "title"
      ? manifest.mainTheme
      : scene === "battle"
        ? manifest.battle
        : scene === "strategy"
          ? (manifest.strategy[strategyIndex] ?? null)
          : null;
  const allowed = () =>
    !disposed && scene !== null && enabled && volume > 0 && unlocked && !hidden;
  const current = (id: string, audio: HTMLAudioElement) =>
    !disposed && trackId() === id && playback.get(id)?.audio === audio;
  const notify = () => {
    if (!disposed) onChange?.();
  };

  function getSnapshot(): MusicSnapshot {
    const id = trackId();
    return {
      scene,
      trackId: id,
      title: (id && tracks.get(id)?.title) || "",
      enabled,
      volume,
      status:
        disposed || scene === null || !enabled || volume === 0 || hidden
          ? "paused"
          : !unlocked
            ? "locked"
            : status,
    };
  }

  function pauseAll(except?: HTMLAudioElement) {
    for (const { audio } of playback.values())
      // Also cancel an unresolved play request whose media is still paused.
      if (audio !== except) audio.pause();
  }

  function invalidate() {
    generation += 1;
    pending = null;
  }

  /** Skip each broken playlist entry at most once; all-broken lists stay silent. */
  function advanceStrategy() {
    for (let offset = 1; offset <= manifest.strategy.length; offset += 1) {
      const index = (strategyIndex + offset) % manifest.strategy.length;
      if (!failed.has(manifest.strategy[index])) {
        strategyIndex = index;
        return true;
      }
    }
    return false;
  }

  function mediaFailure(id: string, audio: HTMLAudioElement) {
    if (!current(id, audio)) return;
    failed.add(id);
    invalidate();
    audio.pause();
    status = "error";
    if (scene === "strategy" && advanceStrategy()) sync();
    else notify();
  }

  function ensureTrack(id: string): HTMLAudioElement | null {
    const existing = playback.get(id);
    if (existing) return existing.audio;
    const track = tracks.get(id);
    if (!track) return null;
    const audio = createAudio();
    audio.preload = "none";
    audio.src = resolveSource(
      `${baseUrl.replace(/\/?$/, "/")}${track.src.replace(/^\/+/, "")}`,
    );
    audio.volume = volume;
    const listeners: Record<string, EventListener> = {
      playing: () => {
        if (!current(id, audio) || !allowed()) {
          audio.pause();
          return;
        }
        status = "playing";
        notify();
      },
      pause: () => {
        if (!current(id, audio)) return;
        if (status !== "error") status = "paused";
        notify();
      },
      waiting: () => {
        if (!current(id, audio) || !allowed()) return;
        status = "loading";
        notify();
      },
      ended: () => {
        if (!current(id, audio)) return;
        invalidate();
        if (scene === "strategy" && !advanceStrategy()) {
          status = "error";
          notify();
          return;
        }
        const nextId = trackId();
        const nextAudio = nextId && playback.get(nextId)?.audio;
        if (nextAudio) nextAudio.currentTime = 0;
        sync();
      },
      error: () => mediaFailure(id, audio),
    };
    playback.set(id, { audio, listeners });
    for (const [event, listener] of Object.entries(listeners))
      audio.addEventListener(event, listener);
    return audio;
  }

  function sync() {
    if (disposed) return;
    const id = trackId();
    if (!allowed() || !id) {
      invalidate();
      pauseAll();
      status = "paused";
      notify();
      return;
    }
    if (failed.has(id)) {
      if (scene === "strategy" && advanceStrategy()) {
        sync();
        return;
      }
      invalidate();
      pauseAll();
      status = "error";
      notify();
      return;
    }
    const audio = ensureTrack(id);
    if (!audio) {
      pauseAll();
      status = "error";
      notify();
      return;
    }
    pauseAll(audio);
    audio.loop = scene !== "strategy";
    audio.volume = volume;
    if (pending?.audio === audio) {
      notify();
      return;
    }
    if (!audio.paused && !audio.ended) {
      if (status !== "loading") status = "playing";
      notify();
      return;
    }
    const attempt = { generation: ++generation, audio };
    pending = attempt;
    status = "loading";
    notify();
    const isLatest = () =>
      pending === attempt && generation === attempt.generation;
    const reject = (error: unknown) => {
      if (!isLatest() || !current(id, audio) || !allowed()) return;
      pending = null;
      const name = error instanceof Error ? error.name : "";
      if (name === "NotAllowedError") {
        // Another gesture may unlock playback after a browser policy rejection.
        unlocked = false;
        audio.pause();
        status = "locked";
        notify();
      } else if (name === "AbortError") {
        status = "paused";
        notify();
      } else mediaFailure(id, audio);
    };
    try {
      Promise.resolve(audio.play()).then(() => {
        // A delayed promise must not revive a muted or obsolete scene. A newer
        // request for this same track owns it now, so never pause that request.
        if (!current(id, audio) || !allowed()) audio.pause();
        if (!isLatest()) return;
        pending = null;
        status = allowed() && !audio.paused ? "playing" : "paused";
        notify();
      }, reject);
    } catch (error) {
      reject(error);
    }
  }

  return {
    getSnapshot,
    setScene(next: MusicScene | null) {
      if (disposed || scene === next) return;
      invalidate();
      scene = next;
      sync();
    },
    unlock() {
      if (disposed) return;
      unlocked = true;
      sync();
    },
    setEnabled(value: boolean) {
      if (disposed || enabled === value) return;
      enabled = value;
      sync();
    },
    setVolume(value: number) {
      if (disposed || !Number.isFinite(value)) return;
      volume = clampVolume(value, volume);
      sync();
    },
    setHidden(value: boolean) {
      if (disposed || hidden === value) return;
      hidden = value;
      sync();
    },
    next() {
      if (disposed || scene !== "strategy") return;
      invalidate();
      if (!advanceStrategy()) {
        pauseAll();
        status = "error";
        notify();
        return;
      }
      const id = trackId();
      const audio = id && playback.get(id)?.audio;
      if (audio) audio.currentTime = 0;
      sync();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      invalidate();
      for (const { audio, listeners } of playback.values()) {
        for (const [event, listener] of Object.entries(listeners))
          audio.removeEventListener(event, listener);
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
      playback.clear();
    },
  };
}

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { parseMusicManifest, type MusicScene } from "../../definitions/music";
import { createMusicPlayer } from "../../platform/music-player";
import {
  readMusicPreferences,
  saveMusicPreferences,
} from "../../platform/music-preferences";

type Player = ReturnType<typeof createMusicPlayer>;
type Snapshot = ReturnType<Player["getSnapshot"]>;
interface MusicControls {
  snapshot: Snapshot | null;
  unavailable: boolean;
  setEnabled: (enabled: boolean) => void;
  setVolume: (volume: number) => void;
  next: () => void;
}
const MusicContext = createContext<MusicControls | null>(null);

/** One application-lifetime player; window changes and simulation ticks never recreate it. */
export function MusicProvider({
  scene,
  resolveAudio,
  children,
}: {
  scene: MusicScene | null;
  resolveAudio?: (absoluteUrl: string) => string;
  children: ReactNode;
}) {
  const player = useRef<Player | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const sceneRef = useRef(scene);
  const resolveAudioRef = useRef(resolveAudio);
  sceneRef.current = scene;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let disposed = false;
    let interacted = false;
    const abort = new AbortController();
    const unlock = () => {
      interacted = true;
      player.current?.unlock();
    };
    const visibility = () => player.current?.setHidden(document.hidden);
    document.addEventListener("pointerdown", unlock, true);
    document.addEventListener("keydown", unlock, true);
    document.addEventListener("visibilitychange", visibility);
    const baseUrl = new URL(import.meta.env.BASE_URL, document.baseURI).href;
    void fetch(`${baseUrl}music.json`, { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("音乐定义读取失败");
        const manifest = parseMusicManifest(await response.json());
        if (disposed) return;
        const engine = createMusicPlayer({
          manifest,
          baseUrl,
          resolveSource: resolveAudioRef.current,
          preferences: readMusicPreferences(manifest.defaultVolume),
          createAudio: () => {
            const audio = document.createElement("audio");
            host.current?.append(audio);
            return audio;
          },
          onChange: () => {
            if (!disposed && player.current)
              setSnapshot(player.current.getSnapshot());
          },
        });
        player.current = engine;
        engine.setHidden(document.hidden);
        engine.setScene(sceneRef.current);
        if (interacted) engine.unlock();
        setSnapshot(engine.getSnapshot());
      })
      .catch(() => {
        if (!disposed) setUnavailable(true);
      });
    return () => {
      disposed = true;
      abort.abort();
      document.removeEventListener("pointerdown", unlock, true);
      document.removeEventListener("keydown", unlock, true);
      document.removeEventListener("visibilitychange", visibility);
      player.current?.dispose();
      player.current = null;
      host.current?.replaceChildren();
    };
  }, []);

  useEffect(() => {
    player.current?.setScene(scene);
  }, [scene]);
  const remember = () => {
    const state = player.current?.getSnapshot();
    if (state)
      saveMusicPreferences({ enabled: state.enabled, volume: state.volume });
  };
  return (
    <MusicContext.Provider
      value={{
        snapshot,
        unavailable,
        setEnabled: (enabled) => {
          player.current?.setEnabled(enabled);
          remember();
        },
        setVolume: (volume) => {
          player.current?.setVolume(volume);
          remember();
        },
        next: () => {
          player.current?.next();
        },
      }}
    >
      <div ref={host} hidden aria-hidden="true" data-music-engine />
      {children}
    </MusicContext.Provider>
  );
}

export function useMusic() {
  return useContext(MusicContext);
}

import { useEffect, useRef, useState } from "react";
import { loadBaseContent } from "../../definitions/load";
import {
  createAssetPreloader,
  parsePreloadManifest,
  withLoadTimeout,
  type AssetPreloader,
  type PreloadProgress,
} from "../../platform/preload-assets";

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
type LoadedContent = Awaited<ReturnType<typeof loadBaseContent>>;

/** Coordinates startup only; the game mounts after definitions and media finish. */
export function useStartup() {
  const [attempt, setAttempt] = useState(0);
  const [content, setContent] = useState<LoadedContent | null>(null);
  const contentRef = useRef<LoadedContent | null>(null);
  const assets = useRef<AssetPreloader | null>(null);
  const [progress, setProgress] = useState<PreloadProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [contentError, setContentError] = useState("");
  const [assetError, setAssetError] = useState("");
  const [skipMedia, setSkipMedia] = useState(false);

  useEffect(() => {
    const abort = new AbortController();
    let live = true;
    setLoading(true);
    setContentError("");
    setAssetError("");
    const baseUrl = new URL(import.meta.env.BASE_URL, document.baseURI).href;
    const readContent = async () => {
      if (contentRef.current) return;
      const result = await withLoadTimeout(
        (signal) => loadBaseContent(signal),
        abort.signal,
      );
      if (!live) return;
      contentRef.current = result;
      setContent(result);
    };
    const readAssets = async () => {
      if (!assets.current) {
        const manifest = await withLoadTimeout(async (signal) => {
          // Revalidate the small index so a deployment can update its asset list.
          const response = await fetch(new URL("preload.json", baseUrl), {
            signal,
            cache: "no-cache",
          });
          if (!response.ok)
            throw new Error(`无法读取资源清单（HTTP ${response.status}）`);
          return parsePreloadManifest(await response.json());
        }, abort.signal);
        if (!live) return;
        assets.current = createAssetPreloader({ baseUrl, manifest });
      }
      await assets.current.run(abort.signal, (next) => {
        if (live) setProgress(next);
      });
    };
    void Promise.allSettled([readContent(), readAssets()]).then(
      ([definitions, media]) => {
        if (!live) return;
        if (definitions.status === "rejected")
          setContentError(messageOf(definitions.reason));
        if (media.status === "rejected") setAssetError(messageOf(media.reason));
        setLoading(false);
      },
    );
    return () => {
      live = false;
      abort.abort();
    };
  }, [attempt]);

  useEffect(
    () => () => {
      assets.current?.dispose();
    },
    [],
  );
  const hasMediaFailure = !!assetError || !!progress?.failures.length;
  return {
    content,
    progress,
    loading,
    contentError,
    assetError,
    ready:
      !!content && !loading && !contentError && (!hasMediaFailure || skipMedia),
    resolveAudio: assets.current?.resolveAudio,
    retry: () => {
      setSkipMedia(false);
      setAttempt((value) => value + 1);
    },
    continueWithoutMedia: () => setSkipMedia(true),
  };
}

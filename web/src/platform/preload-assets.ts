/** Browser infrastructure only. Game rules never depend on asset loading. */
export interface PreloadAsset {
  path: string;
  kind: "image" | "audio" | "font" | "data";
  bytes: number;
  hash: string;
}
export interface PreloadManifest {
  version: 1;
  assets: PreloadAsset[];
}
export interface PreloadFailure {
  path: string;
  message: string;
}
export interface PreloadProgress {
  totalBytes: number;
  loadedBytes: number;
  total: number;
  completed: number;
  active: string[];
  failures: PreloadFailure[];
}

export function parsePreloadManifest(value: unknown): PreloadManifest {
  const manifest = value as Partial<PreloadManifest> | null;
  if (manifest?.version !== 1 || !Array.isArray(manifest.assets))
    throw new Error("资源清单格式无效，请重新构建预览版本。");
  const seen = new Set<string>();
  for (const asset of manifest.assets) {
    if (
      !asset ||
      typeof asset.path !== "string" ||
      /[\\:?#%\u0000-\u001f\u007f]/.test(asset.path) ||
      asset.path
        .split("/")
        .some((part) => !part.trim() || part === "." || part === "..") ||
      seen.has(asset.path) ||
      !["image", "audio", "font", "data"].includes(asset.kind) ||
      !Number.isSafeInteger(asset.bytes) ||
      asset.bytes < 0 ||
      typeof asset.hash !== "string"
    )
      throw new Error("资源清单包含无效路径或大小。");
    seen.add(asset.path);
  }
  return manifest as PreloadManifest;
}

/** A bounded operation, including reading a response body. Abort works on unmount. */
export async function withLoadTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  parent?: AbortSignal,
  timeoutMs = 45_000,
): Promise<T> {
  const abort = new AbortController();
  const cancel = () => abort.abort(parent?.reason);
  parent?.addEventListener("abort", cancel, { once: true });
  if (parent?.aborted) cancel();
  const timer = setTimeout(
    () => abort.abort(new Error("下载超时，请检查网络后重试。")),
    timeoutMs,
  );
  let stop: (() => void) | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => {
        abort.signal.throwIfAborted();
        return operation(abort.signal);
      }),
      new Promise<never>((_, reject) => {
        stop = () => reject(abort.signal.reason);
        abort.signal.addEventListener("abort", stop, { once: true });
        if (abort.signal.aborted) stop();
      }),
    ]);
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", cancel);
    if (stop) abort.signal.removeEventListener("abort", stop);
  }
}

interface Options {
  baseUrl: string;
  manifest: PreloadManifest;
  concurrency?: number;
  timeoutMs?: number;
  fetcher?: typeof fetch;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
}

/** One startup session. Retrying preserves finished downloads and audio blobs. */
export function createAssetPreloader({
  baseUrl,
  manifest,
  concurrency = 4,
  timeoutMs = 45_000,
  fetcher = fetch,
  createObjectURL = URL.createObjectURL.bind(URL),
  revokeObjectURL = URL.revokeObjectURL.bind(URL),
}: Options) {
  const base = new URL(baseUrl.endsWith("/") ? baseUrl : baseUrl + "/");
  const complete = new Set<string>();
  const received = new Map<string, number>();
  const active = new Set<string>();
  const failures = new Map<string, string>();
  const audio = new Map<string, string>();
  let running = false;
  let disposed = false;
  const urlOf = (path: string) => new URL(path, base).href;
  const snapshot = (): PreloadProgress => ({
    totalBytes: manifest.assets.reduce((sum, asset) => sum + asset.bytes, 0),
    loadedBytes: manifest.assets.reduce(
      (sum, asset) =>
        sum +
        (complete.has(asset.path)
          ? asset.bytes
          : Math.min(asset.bytes, received.get(asset.path) ?? 0)),
      0,
    ),
    total: manifest.assets.length,
    completed: complete.size,
    active: [...active],
    failures: [...failures].map(([path, message]) => ({ path, message })),
  });

  return {
    snapshot,
    /** Audio uses the full downloaded file, avoiding another HTTP Range request. */
    resolveAudio: (absoluteUrl: string) =>
      audio.get(absoluteUrl) ?? absoluteUrl,
    async run(
      signal: AbortSignal,
      onProgress: (progress: PreloadProgress) => void,
    ) {
      if (running || disposed) throw new Error("资源加载会话不可用。");
      running = true;
      failures.clear();
      const queue = manifest.assets.filter(
        (asset) => !complete.has(asset.path),
      );
      let cursor = 0;
      const notify = () => {
        if (!disposed && !signal.aborted) onProgress(snapshot());
      };
      notify();
      const worker = async () => {
        while (cursor < queue.length && !signal.aborted && !disposed) {
          const asset = queue[cursor++];
          active.add(asset.path);
          received.set(asset.path, 0);
          notify();
          try {
            const blob = await withLoadTimeout(
              async (requestSignal) => {
                const response = await fetcher(urlOf(asset.path), {
                  signal: requestSignal,
                  // Revalidate same-name edits between deployments; consumers use
                  // this exact URL and can reuse the refreshed HTTP cache entry.
                  cache: "no-cache",
                });
                if (!response.ok)
                  throw new Error(`下载失败（HTTP ${response.status}）`);
                const chunks: Uint8Array<ArrayBuffer>[] = [];
                if (response.body) {
                  const reader = response.body.getReader();
                  const cancelReader = () => {
                    void reader.cancel(requestSignal.reason).catch(() => {});
                  };
                  requestSignal.addEventListener("abort", cancelReader, {
                    once: true,
                  });
                  try {
                    while (true) {
                      requestSignal.throwIfAborted();
                      const { done, value } = await reader.read();
                      if (done) break;
                      received.set(
                        asset.path,
                        (received.get(asset.path) ?? 0) + value.byteLength,
                      );
                      // Only audio stays in memory; other responses populate the HTTP cache.
                      if (asset.kind === "audio")
                        chunks.push(new Uint8Array(value));
                      notify();
                    }
                  } finally {
                    requestSignal.removeEventListener("abort", cancelReader);
                    reader.releaseLock();
                  }
                } else {
                  const bytes = await response.arrayBuffer();
                  received.set(asset.path, bytes.byteLength);
                  if (asset.kind === "audio")
                    chunks.push(new Uint8Array(bytes));
                }
                requestSignal.throwIfAborted();
                return asset.kind === "audio"
                  ? new Blob(chunks, {
                      type:
                        response.headers.get("content-type") ??
                        "application/octet-stream",
                    })
                  : null;
              },
              signal,
              timeoutMs,
            );
            if (disposed || signal.aborted) break;
            if (blob) audio.set(urlOf(asset.path), createObjectURL(blob));
            complete.add(asset.path);
          } catch (error) {
            if (!signal.aborted && !disposed)
              failures.set(
                asset.path,
                error instanceof Error ? error.message : String(error),
              );
          } finally {
            active.delete(asset.path);
            notify();
          }
        }
      };
      try {
        await Promise.all(
          Array.from(
            {
              length: Math.min(
                queue.length,
                Math.max(1, Math.floor(concurrency)),
              ),
            },
            worker,
          ),
        );
        signal.throwIfAborted();
        return snapshot();
      } finally {
        running = false;
      }
    },
    dispose() {
      disposed = true;
      for (const url of audio.values()) revokeObjectURL(url);
      audio.clear();
    },
  };
}
export type AssetPreloader = ReturnType<typeof createAssetPreloader>;

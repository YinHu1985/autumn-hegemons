import type { PreloadProgress } from "../../platform/preload-assets";
import "./loading.css";

const size = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const kindName = (path: string) =>
  /\.(mp3|wav|ogg|m4a)$/i.test(path)
    ? "乐曲"
    : /\.(woff2?|ttf|otf)$/i.test(path)
      ? "字库"
      : /\.json$/i.test(path)
        ? "舆图与曲目"
        : "画卷";

export function LoadingScreen({
  progress,
  loading,
  contentError,
  assetError,
  retry,
  continueWithoutMedia,
}: {
  progress: PreloadProgress | null;
  loading: boolean;
  contentError: string;
  assetError: string;
  retry: () => void;
  continueWithoutMedia: () => void;
}) {
  const failed = !!contentError || !!assetError || !!progress?.failures.length;
  const percent = progress?.totalBytes
    ? Math.min(100, (progress.loadedBytes / progress.totalBytes) * 100)
    : 0;
  const category = [...new Set(progress?.active.map(kindName))].join("、");
  return (
    <main className="startup-screen" aria-busy={loading}>
      <div className="startup-frame">
        <div className="startup-seal" aria-hidden="true">
          春秋
        </div>
        <p className="startup-kicker">列国争雄 · 百家争鸣</p>
        <h1>春秋风云</h1>
        <div className="startup-rule" aria-hidden="true" />
        <p className="startup-status" role="status">
          {loading
            ? category
              ? `正在备齐${category}…`
              : "正在展开天下舆图…"
            : failed
              ? "行装尚未备齐"
              : "天下已备，静候启程"}
        </p>
        <div
          className="startup-meter"
          role="progressbar"
          aria-label="游戏资源下载"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.floor(percent)}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
        <div className="startup-numbers">
          <span>
            {progress
              ? `${size(progress.loadedBytes)} / ${size(progress.totalBytes)}`
              : "正在读取资源清单"}
          </span>
          <span>
            {progress ? `${progress.completed} / ${progress.total} 项` : ""}
          </span>
        </div>
        {!loading && failed && (
          <div className="startup-errors" role="alert">
            {contentError && <p>游戏定义加载失败：{contentError}</p>}
            {assetError && <p>{assetError}</p>}
            {!!progress?.failures.length && (
              <>
                <p>
                  有 {progress.failures.length}{" "}
                  项资源未能下载。可重试，或暂缺这些画面和音乐进入游戏。
                </p>
                <details>
                  <summary>查看未完成的资源</summary>
                  <ul>
                    {progress.failures.map((failure) => (
                      <li key={failure.path}>
                        {failure.path.split("/").pop()}：{failure.message}
                      </li>
                    ))}
                  </ul>
                </details>
              </>
            )}
            <div className="startup-actions">
              <button onClick={retry}>重试下载</button>
              {!contentError && (
                <button onClick={continueWithoutMedia}>
                  暂缺资源，继续进入
                </button>
              )}
            </div>
          </div>
        )}
        <p className="startup-note">
          首次启程需备齐画卷与乐曲；已下载的资源会由浏览器缓存。
          <br />
          音乐将在操作后奏起，可在系统菜单中调节。
        </p>
      </div>
    </main>
  );
}

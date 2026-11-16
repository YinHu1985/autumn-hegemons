import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const publicRoot = join(dirname(fileURLToPath(import.meta.url)), "../public");
const kinds = {
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".webp": "image",
  ".avif": "image",
  ".svg": "image",
  ".gif": "image",
  ".mp3": "audio",
  ".wav": "audio",
  ".ogg": "audio",
  ".m4a": "audio",
  ".woff": "font",
  ".woff2": "font",
  ".ttf": "font",
  ".otf": "font",
  ".json": "data",
};

async function scan(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? scan(path) : [path];
      }),
    )
  ).flat();
}

// Content definitions are loaded and validated by loadBaseContent in parallel.
// Keep this list generated: designers adding art or music need no code changes.
const paths = [
  ...(await scan(join(publicRoot, "assets"))),
  ...(await scan(join(publicRoot, "map"))),
  join(publicRoot, "music.json"),
]
  .filter((path) => kinds[extname(path).toLowerCase()])
  .sort();
const assets = await Promise.all(
  paths.map(async (path) => {
    const bytes = await readFile(path);
    return {
      path: relative(publicRoot, path).split("\\").join("/"),
      kind: kinds[extname(path).toLowerCase()],
      bytes: bytes.length,
      hash: createHash("sha256").update(bytes).digest("hex").slice(0, 16),
    };
  }),
);
const manifest = { version: 1, assets };
await writeFile(
  join(publicRoot, "preload.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  `Preload: ${assets.length} assets, ${(assets.reduce((sum, asset) => sum + asset.bytes, 0) / 1024 / 1024).toFixed(2)} MiB`,
);

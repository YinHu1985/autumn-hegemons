import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = join(repository, "assets-source");
const publicRoot = join(repository, "web/public");
const checkOnly = process.argv.slice(2).includes("--check");
if (process.argv.slice(2).some((argument) => argument !== "--check"))
  throw new Error("用法：npm run images:build [-- --check]");

function fileWithin(root, relative) {
  if (
    typeof relative !== "string" ||
    isAbsolute(relative) ||
    /[\\\0]/.test(relative) ||
    relative.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error(`图片清单包含无效相对路径：${relative}`);
  return join(root, relative);
}

/** Read dimensions without introducing an image library into normal game builds. */
function imageSize(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")))
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  if (
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    for (let position = 12; position + 8 < bytes.length;) {
      const kind = bytes.toString("ascii", position, position + 4);
      const length = bytes.readUInt32LE(position + 4);
      const start = position + 8;
      if (kind === "VP8X")
        return [
          1 + bytes.readUIntLE(start + 4, 3),
          1 + bytes.readUIntLE(start + 7, 3),
        ];
      if (kind === "VP8 ")
        return [
          bytes.readUInt16LE(start + 6) & 0x3fff,
          bytes.readUInt16LE(start + 8) & 0x3fff,
        ];
      if (kind === "VP8L") {
        const bits = bytes.readUInt32LE(start + 1);
        return [1 + (bits & 0x3fff), 1 + ((bits >>> 14) & 0x3fff)];
      }
      position = start + length + (length % 2);
    }
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    const frames = new Set([
      0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
      0xcf,
    ]);
    let position = 2;
    while (position + 9 < bytes.length && bytes[position] === 0xff) {
      while (bytes[position] === 0xff) position++;
      const marker = bytes[position++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const length = bytes.readUInt16BE(position);
      if (length < 2) break;
      if (frames.has(marker))
        return [
          bytes.readUInt16BE(position + 5),
          bytes.readUInt16BE(position + 3),
        ];
      position += length;
    }
  }
  throw new Error("无法读取图片尺寸（仅支持 PNG、JPEG、WebP）");
}

function verifySize(bytes, definition, path) {
  const [width, height] = imageSize(bytes);
  if (width !== definition.width || height !== definition.height)
    throw new Error(
      `${path} 尺寸应为 ${definition.width}×${definition.height}，实际为 ${width}×${height}`,
    );
}

async function loadImages() {
  const manifest = JSON.parse(
    await readFile(join(sourceRoot, "manifest.json"), "utf8"),
  );
  if (
    manifest.version !== 1 ||
    !Array.isArray(manifest.images) ||
    !manifest.images.length
  )
    throw new Error("不支持的原图清单格式");
  const outputs = new Set();
  return Promise.all(
    manifest.images.map(async (definition) => {
      const source = fileWithin(sourceRoot, definition.source);
      const output = fileWithin(publicRoot, definition.output);
      if (!definition.output.startsWith("assets/") || outputs.has(output))
        throw new Error(
          `发布图片路径必须唯一且位于 assets/：${definition.output}`,
        );
      outputs.add(output);
      if (
        ![definition.width, definition.height].every(
          (value) => Number.isInteger(value) && value > 0,
        )
      )
        throw new Error(`图片清单缺少有效尺寸：${definition.source}`);
      const encoding = definition.encoding;
      if (encoding?.format === "webp") {
        if (
          extname(output) !== ".webp" ||
          !Number.isFinite(encoding.quality) ||
          encoding.quality < 0 ||
          encoding.quality > 100 ||
          !Number.isInteger(encoding.method) ||
          encoding.method < 0 ||
          encoding.method > 6 ||
          typeof encoding.multithread !== "boolean"
        )
          throw new Error(`WebP 编码参数无效：${definition.source}`);
      } else if (
        encoding?.format !== "copy" ||
        extname(source) !== extname(output)
      )
        throw new Error(`图片编码方式无效：${definition.source}`);
      const bytes = await readFile(source);
      const hash = createHash("sha256").update(bytes).digest("hex");
      if (hash !== definition.sha256)
        throw new Error(
          `原图散列不符：${definition.source}。若有意替换原图，请更新 manifest.json 中的散列与尺寸。`,
        );
      verifySize(bytes, definition, definition.source);
      return { definition, source, output, bytes };
    }),
  );
}

async function run() {
  const images = await loadImages();
  let directory;
  let total = 0;
  try {
    if (!checkOnly) directory = await mkdtemp(join(tmpdir(), "autumn-images-"));
    // Stage all files before touching published assets, so an encoder failure cannot publish a partial set.
    const staged = [];
    for (const [index, image] of images.entries()) {
      const { definition, source, output } = image;
      const destination = checkOnly
        ? output
        : join(directory, `${index}${extname(output)}`);
      if (!checkOnly) {
        if (definition.encoding.format === "copy")
          await copyFile(source, destination);
        else {
          const { quality, method, multithread } = definition.encoding;
          const args = [
            "-quiet",
            "-q",
            String(quality),
            "-m",
            String(method),
            ...(multithread ? ["-mt"] : []),
            source,
            "-o",
            destination,
          ];
          const result = spawnSync("cwebp", args, { encoding: "utf8" });
          if (result.error?.code === "ENOENT")
            throw new Error(
              "未找到 cwebp。安装 WebP 编码工具后再运行 images:build；普通开发和 Pages 构建不需要该工具。",
            );
          if (result.error || result.status !== 0)
            throw new Error(
              `编码失败 ${definition.source}：${result.error?.message ?? result.stderr}`,
            );
        }
      }
      const bytes = await readFile(destination);
      verifySize(bytes, definition, definition.output);
      if (definition.encoding.format === "copy" && !bytes.equals(image.bytes))
        throw new Error(`应保持原始字节的图片不一致：${definition.output}`);
      total += bytes.length;
      staged.push({ destination, output });
      console.log(
        `${checkOnly ? "Checked" : "Encoded"} ${definition.output} ${definition.width}×${definition.height} ${(bytes.length / 1024).toFixed(1)} KiB`,
      );
    }
    if (!checkOnly)
      for (const { destination, output } of staged) {
        await mkdir(dirname(output), { recursive: true });
        await copyFile(destination, output);
      }
    console.log(
      `${images.length} images verified; source ${(images.reduce((sum, image) => sum + image.bytes.length, 0) / 1024 / 1024).toFixed(2)} MiB; published ${(total / 1024 / 1024).toFixed(2)} MiB.`,
    );
    if (!checkOnly)
      console.log(
        "Run npm run preload:build after changing the published asset set.",
      );
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}

await run();

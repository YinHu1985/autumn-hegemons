import type { Content } from "../definitions/types";
import { validateContent } from "../definitions/validate";
import type { WorldState } from "../simulation/state";
import { validateSavedWorld } from "./validate-save";
export const SAVE_VERSION = 7;
export interface SaveGame {
  version: typeof SAVE_VERSION;
  savedAt: string;
  content: Content;
  world: WorldState;
}
const KEY = `autumn-hegemons-save-v${SAVE_VERSION}`;
export function createSave(content: Content, world: WorldState): SaveGame {
  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    content,
    world,
  };
}
export function saveGame(content: Content, world: WorldState) {
  const save = createSave(content, world);
  localStorage.setItem(KEY, JSON.stringify(save));
  return save;
}
export function parseSave(text: string): SaveGame {
  const s = JSON.parse(text);
  if (
    !s ||
    typeof s !== "object" ||
    s.version !== SAVE_VERSION ||
    !s.world ||
    !s.content
  )
    throw new Error("不支持的存档格式，请使用当前版本存档或新建战局");
  const content = validateContent(s.content);
  const world = validateSavedWorld(s.world, content);
  if (typeof s.savedAt !== "string" || !Number.isFinite(Date.parse(s.savedAt)))
    throw new Error("存档时间无效");
  return { version: SAVE_VERSION, savedAt: s.savedAt, content, world };
}
export function loadGame() {
  const text = localStorage.getItem(KEY);
  return text ? parseSave(text) : null;
}
export function downloadJSON(value: unknown, filename: string) {
  const u = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = u;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}

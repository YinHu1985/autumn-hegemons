import { defineConfig } from "vite";

// GitHub Pages 的项目站点使用 /仓库名/；本地开发仍使用 /。
export default defineConfig(({ mode }) => ({
  base: mode === "pages" ? "/autumn-hegemons/" : "/",
}));

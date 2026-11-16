import { CONTENT_FILES } from "./types";
import { validateContent } from "./validate";
import type { Content, ContentTexts, Scenario } from "./types";
import { parseScenarioCatalogue } from "./scenarios";

export async function loadBaseContent(signal?: AbortSignal): Promise<{
  content: Content;
  texts: ContentTexts;
  scenarios: Scenario[];
}> {
  const root = `${import.meta.env.BASE_URL}content/base/`;
  const manifestResponse = await fetch(`${root}manifest.json`, { signal });
  if (!manifestResponse.ok)
    throw new Error(`无法读取内容清单：${manifestResponse.status}`);
  const manifest = (await manifestResponse.json()) as Record<string, unknown>;
  if (manifest.version !== 1) throw new Error("不支持的内容清单版本");
  const names = CONTENT_FILES;
  const entries = await Promise.all(
    names.map(async (name) => {
      const file = manifest[name];
      if (typeof file !== "string" || !/^[a-z0-9_-]+\.json$/i.test(file))
        throw new Error(`内容清单中的 ${name} 文件名无效`);
      const response = await fetch(root + file, { signal });
      if (!response.ok) throw new Error(`无法读取 ${file}：${response.status}`);
      return [name, await response.text()] as const;
    }),
  );
  const texts = Object.fromEntries(entries) as unknown as ContentTexts;
  const common = Object.fromEntries(
    entries.map(([name, value]) => [name, JSON.parse(value)]),
  );
  const catalogueResponse = await fetch(`${root}scenarios.json`, { signal });
  if (!catalogueResponse.ok)
    throw new Error(`无法读取剧本目录：${catalogueResponse.status}`);
  const catalogue = parseScenarioCatalogue(await catalogueResponse.json());
  const scenarios = await Promise.all(
    catalogue.entries.map(async (entry) => {
      let raw = common.scenario;
      if (entry.file !== manifest.scenario) {
        const response = await fetch(root + entry.file, { signal });
        if (!response.ok)
          throw new Error(`无法读取剧本 ${entry.file}：${response.status}`);
        raw = await response.json();
      }
      const scenario = validateContent({ ...common, scenario: raw }).scenario;
      if (scenario.id !== entry.id)
        throw new Error(`剧本 ${entry.file} 的 ID 与目录不符`);
      return scenario;
    }),
  );
  const selected = scenarios.find(
    (scenario) => scenario.id === catalogue.defaultScenario,
  )!;
  const content = validateContent({ ...common, scenario: selected });
  return {
    content,
    texts: { ...texts, scenario: JSON.stringify(selected, null, 2) },
    scenarios,
  };
}

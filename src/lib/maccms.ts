import { cleanXmlText, ddBlocks, textBetween, videoBlocks } from "./xml";

export interface VodItem {
  id: string;
  source: number;
  name: string;
  type: string;
  pic: string;
  note: string;
  actor: string;
  director: string;
  area: string;
  lang: string;
  year: string;
  desc: string;
  last: string;
  episodes: Episode[];
}

export interface Episode {
  index: number;
  name: string;
  url: string;
  player: string;
}

export async function listVod(api: string, page = 1): Promise<VodItem[]> {
  const xml = await fetchXml(api, { ac: "detail", pg: String(page) });
  return videoBlocks(xml).map((block) => parseVideoBlock(block, 0));
}

export async function listVodAll(env: Env, page = 1, limit = 24): Promise<VodItem[]> {
  const lists = await Promise.allSettled(
    maccmsApis(env).map(async (api, source) => {
      const xml = await fetchXml(api, { ac: "detail", pg: String(page) });
      return videoBlocks(xml).map((block) => parseVideoBlock(block, source));
    })
  );

  return uniqueVod(
    lists.flatMap((result) => result.status === "fulfilled" ? result.value : [])
  ).slice(0, limit);
}

export async function searchVod(api: string, keyword: string): Promise<VodItem[]> {
  if (!keyword.trim()) return [];
  const xml = await fetchXml(api, { ac: "detail", wd: keyword.trim() });
  return videoBlocks(xml).map((block) => parseVideoBlock(block, 0));
}

export async function searchVodAll(env: Env, keyword: string, limit = 60): Promise<VodItem[]> {
  if (!keyword.trim()) return [];
  const lists = await Promise.allSettled(
    maccmsApis(env).map(async (api, source) => {
      const xml = await fetchXml(api, { ac: "detail", wd: keyword.trim() });
      return videoBlocks(xml).map((block) => parseVideoBlock(block, source));
    })
  );

  return uniqueVod(
    lists.flatMap((result) => result.status === "fulfilled" ? result.value : [])
  ).slice(0, limit);
}

export async function getVodDetail(api: string, id: string): Promise<VodItem | null> {
  const xml = await fetchXml(api, { ac: "detail", ids: id });
  const block = videoBlocks(xml)[0];
  return block ? parseVideoBlock(block, 0) : null;
}

export async function getVodDetailFromSources(env: Env, id: string, source?: number): Promise<VodItem | null> {
  const apis = maccmsApis(env);
  const sources = Number.isInteger(source) && source! >= 0 && source! < apis.length
    ? [source!]
    : apis.map((_, index) => index);

  for (const sourceIndex of sources) {
    const xml = await fetchXml(apis[sourceIndex], { ac: "detail", ids: id });
    const block = videoBlocks(xml)[0];
    if (block) {
      return parseVideoBlock(block, sourceIndex);
    }
  }

  return null;
}

export function parseVideoBlock(block: string, source = 0): VodItem {
  const episodes = ddBlocks(block).flatMap((dd) => parseEpisodeText(dd.body, dd.flag));

  return {
    id: textBetween(block, "id"),
    source,
    name: textBetween(block, "name"),
    type: textBetween(block, "type"),
    pic: textBetween(block, "pic"),
    note: textBetween(block, "note"),
    actor: textBetween(block, "actor"),
    director: textBetween(block, "director"),
    area: textBetween(block, "area"),
    lang: textBetween(block, "lang"),
    year: textBetween(block, "year"),
    desc: stripTags(textBetween(block, "des")),
    last: textBetween(block, "last"),
    episodes
  };
}

export function parseEpisodeText(text: string, player = "url"): Episode[] {
  return text
    .split("#")
    .map((line, index) => {
      const [name, url] = line.split("$");
      return {
        index,
        name: (name || `第${index + 1}集`).trim(),
        url: (url || "").trim(),
        player
      };
    })
    .filter((item) => item.url);
}

export function isDirectVideo(url: string): boolean {
  return /\.m3u8(\?|$)/i.test(url) || /\.mp4(\?|$)/i.test(url);
}

export function detailUrl(vod: Pick<VodItem, "id" | "source">): string {
  return `/detail/${vod.id}?source=${vod.source || 0}`;
}

export function playUrl(vod: Pick<VodItem, "id" | "source">, episodeIndex: number): string {
  return `/play/${vod.id}/${episodeIndex}?source=${vod.source || 0}`;
}

export function maccmsApis(env: Pick<Env, "MACCMS_API" | "MACCMS_APIS">): string[] {
  const values = [
    ...(env.MACCMS_APIS || "").split(/\r?\n|,/),
    env.MACCMS_API
  ];

  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function stripTags(value: string): string {
  return cleanXmlText(value.replace(/<[^>]+>/g, " "));
}

function uniqueVod(list: VodItem[]): VodItem[] {
  const seen = new Set<string>();
  const result: VodItem[] = [];

  for (const vod of list) {
    const key = `${vod.name}-${vod.year}-${vod.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(vod);
  }

  return result;
}

async function fetchXml(api: string, params: Record<string, string>): Promise<string> {
  const url = new URL(api);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url.toString(), {
    headers: {
      "user-agent": "movie-nav-worker/1.0"
    },
    cf: {
      cacheTtl: 300,
      cacheEverything: true
    }
  });
  if (!response.ok) {
    throw new Error(`MacCMS API HTTP ${response.status}`);
  }
  return response.text();
}

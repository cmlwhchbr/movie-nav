import { ddBlocks, textBetween, videoBlocks } from "./xml";

export interface VodItem {
  id: string;
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
  const xml = await fetchXml(api, { ac: "list", pg: String(page) });
  return videoBlocks(xml).map(parseVideoBlock);
}

export async function searchVod(api: string, keyword: string): Promise<VodItem[]> {
  if (!keyword.trim()) return [];
  const xml = await fetchXml(api, { ac: "detail", wd: keyword.trim() });
  return videoBlocks(xml).map(parseVideoBlock);
}

export async function getVodDetail(api: string, id: string): Promise<VodItem | null> {
  const xml = await fetchXml(api, { ac: "detail", ids: id });
  const block = videoBlocks(xml)[0];
  return block ? parseVideoBlock(block) : null;
}

export function parseVideoBlock(block: string): VodItem {
  const episodes = ddBlocks(block).flatMap((dd) => parseEpisodeText(dd.body, dd.flag));

  return {
    id: textBetween(block, "id"),
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

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, "").trim();
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

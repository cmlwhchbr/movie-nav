import { searchVodAll, type VodItem } from "./maccms";

export interface TopItem {
  title: string;
  query: string;
  hotScore: string;
  image: string;
  desc: string;
  category: "movie" | "teleplay";
  vod?: VodItem | null;
}

const TOP_PAGES = [
  { category: "movie" as const, url: "https://top.baidu.com/board?tab=movie", suffix: "电影" },
  { category: "teleplay" as const, url: "https://top.baidu.com/board?tab=teleplay", suffix: "电视剧" }
];

export async function getCachedTop(env: Env): Promise<TopItem[]> {
  const key = env.TOP_CACHE_KEY || "baidu-top-v1";
  const cached = await env.TOP_CACHE.get(key, "json");
  if (Array.isArray(cached) && cached.length > 0) {
    return cached as TopItem[];
  }
  const fresh = await refreshTop(env);
  return fresh;
}

export async function refreshTop(env: Env): Promise<TopItem[]> {
  const merged: TopItem[] = [];

  for (const page of TOP_PAGES) {
    const items = await fetchBaiduTopPage(page.url, page.category, page.suffix);
    for (const item of items.slice(0, 12)) {
      const result = await searchVodAll(env, item.title, 8);
      merged.push({
        ...item,
        vod: result[0] || null
      });
    }
  }

  const key = env.TOP_CACHE_KEY || "baidu-top-v1";
  const ttl = Number(env.TOP_CACHE_TTL || 86400);
  await env.TOP_CACHE.put(key, JSON.stringify(merged), {
    expirationTtl: Math.max(3600, ttl)
  });
  await env.TOP_CACHE.put(`${key}:updated_at`, new Date().toISOString(), {
    expirationTtl: Math.max(3600, ttl)
  });

  return merged;
}

export async function topUpdatedAt(env: Env): Promise<string> {
  return (await env.TOP_CACHE.get(`${env.TOP_CACHE_KEY || "baidu-top-v1"}:updated_at`)) || "";
}

async function fetchBaiduTopPage(url: string, category: TopItem["category"], suffix: string): Promise<TopItem[]> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 movie-nav-worker/1.0"
    },
    cf: {
      cacheTtl: 3600,
      cacheEverything: true
    }
  });
  if (!response.ok) {
    throw new Error(`Baidu top HTTP ${response.status}`);
  }

  const html = await response.text();
  const raw = html.match(/<!--s-data:(\{"data"[\s\S]*?\})-->/)?.[1];
  if (!raw) {
    return fallbackParse(html, category, suffix);
  }

  const json = JSON.parse(raw);
  const content = json?.data?.cards?.[0]?.content || [];
  return content.map((item: any) => ({
    title: String(item.word || "").trim(),
    query: String(item.query || `${item.word} ${suffix}`).trim(),
    hotScore: String(item.hotScore || ""),
    image: String(item.img || ""),
    desc: String(item.desc || ""),
    category
  })).filter((item: TopItem) => item.title);
}

function fallbackParse(html: string, category: TopItem["category"], suffix: string): TopItem[] {
  return [...html.matchAll(/"word":"([^"]+)"/g)]
    .map((match) => decodeUnicode(match[1] || ""))
    .filter(Boolean)
    .slice(0, 12)
    .map((title) => ({
      title,
      query: `${title} ${suffix}`,
      hotScore: "",
      image: "",
      desc: "",
      category
    }));
}

function decodeUnicode(value: string): string {
  try {
    return JSON.parse(`"${value.replace(/"/g, "\\\"")}"`);
  } catch {
    return value;
  }
}

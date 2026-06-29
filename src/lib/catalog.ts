import { parseVideoBlock, type VodItem } from "./maccms";
import { listMeta, videoBlocks } from "./xml";

const AOSIKA_SOURCE_KEY = "aosika";
const AOSIKA_API = "https://aosikazy1.com/api.php/provide/vod/at/xml";

export interface CollectResult {
  source_key: string;
  start_page: number;
  next_page: number;
  page_count: number;
  record_count: number;
  pages_collected: number;
  videos_collected: number;
  episodes_collected: number;
}

export async function collectAosika(env: Env, pages = 3): Promise<CollectResult> {
  const db = env.CATALOG_DB;
  const safePages = Math.min(Math.max(Math.floor(pages) || 1, 1), 20);
  const state = await getState(db);
  let page = state.next_page || 1;
  const startPage = page;
  let pageCount = state.page_count || 0;
  let recordCount = state.record_count || 0;
  let pagesCollected = 0;
  let videosCollected = 0;
  let episodesCollected = 0;

  try {
    for (let index = 0; index < safePages; index += 1) {
      const xml = await fetchAosikaPage(page);
      const meta = listMeta(xml);
      pageCount = meta.pageCount || pageCount;
      recordCount = meta.recordCount || recordCount;

      const items = videoBlocks(xml).map((block) => parseVideoBlock(block, 3));
      if (items.length === 0) break;

      for (const item of items) {
        const result = await upsertVideo(db, item);
        videosCollected += 1;
        episodesCollected += result.episodes;
      }

      pagesCollected += 1;
      page += 1;
      if (pageCount && page > pageCount) page = 1;
    }

    await db.prepare(`
      INSERT INTO collect_state (source_key, next_page, page_count, record_count, last_run_at, last_error)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, NULL)
      ON CONFLICT(source_key) DO UPDATE SET
        next_page = excluded.next_page,
        page_count = excluded.page_count,
        record_count = excluded.record_count,
        last_run_at = CURRENT_TIMESTAMP,
        last_error = NULL
    `).bind(AOSIKA_SOURCE_KEY, page, pageCount, recordCount).run();
  } catch (error) {
    await db.prepare(`
      INSERT INTO collect_state (source_key, next_page, page_count, record_count, last_run_at, last_error)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(source_key) DO UPDATE SET
        last_run_at = CURRENT_TIMESTAMP,
        last_error = excluded.last_error
    `).bind(AOSIKA_SOURCE_KEY, page, pageCount, recordCount, error instanceof Error ? error.message : "collect failed").run();
    throw error;
  }

  return {
    source_key: AOSIKA_SOURCE_KEY,
    start_page: startPage,
    next_page: page,
    page_count: pageCount,
    record_count: recordCount,
    pages_collected: pagesCollected,
    videos_collected: videosCollected,
    episodes_collected: episodesCollected
  };
}

export async function searchCatalog(env: Env, keyword: string, limit = 40): Promise<VodItem[]> {
  const q = keyword.trim();
  if (!q) return [];

  const rows = await env.CATALOG_DB.prepare(`
    SELECT
      source_vod_id, name, type, pic, note, actor, director, area, lang, year,
      description, source_updated_at
    FROM videos
    WHERE name LIKE ? OR actor LIKE ? OR director LIKE ? OR description LIKE ?
    ORDER BY source_updated_at DESC, id DESC
    LIMIT ?
  `).bind(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, limit).all<CatalogVideoRow>();

  return (rows.results || []).map(rowToVod);
}

export async function catalogStats(env: Env): Promise<{
  videos: number;
  episodes: number;
  state: Record<string, unknown> | null;
}> {
  const videos = await env.CATALOG_DB.prepare("SELECT COUNT(*) AS count FROM videos").first<{ count: number }>();
  const episodes = await env.CATALOG_DB.prepare("SELECT COUNT(*) AS count FROM episodes").first<{ count: number }>();
  const state = await env.CATALOG_DB.prepare("SELECT * FROM collect_state WHERE source_key = ?").bind(AOSIKA_SOURCE_KEY).first<Record<string, unknown>>();

  return {
    videos: videos?.count || 0,
    episodes: episodes?.count || 0,
    state: state || null
  };
}

async function fetchAosikaPage(page: number): Promise<string> {
  const url = new URL(AOSIKA_API);
  url.searchParams.set("ac", "detail");
  url.searchParams.set("pg", String(page));

  const response = await fetch(url.toString(), {
    headers: {
      "user-agent": "movie-nav-collector/1.0"
    },
    cf: {
      cacheTtl: 60,
      cacheEverything: true
    }
  });

  if (!response.ok) {
    throw new Error(`Aosika API HTTP ${response.status}`);
  }

  return response.text();
}

interface CatalogVideoRow {
  source_vod_id: string;
  name: string;
  type: string;
  pic: string;
  note: string;
  actor: string;
  director: string;
  area: string;
  lang: string;
  year: string;
  description: string;
  source_updated_at: string;
}

function rowToVod(row: CatalogVideoRow): VodItem {
  return {
    id: row.source_vod_id,
    source: 3,
    name: row.name,
    type: row.type || "",
    pic: row.pic || "",
    note: row.note || "",
    actor: row.actor || "",
    director: row.director || "",
    area: row.area || "",
    lang: row.lang || "",
    year: row.year || "",
    desc: row.description || "",
    last: row.source_updated_at || "",
    episodes: []
  };
}

async function getState(db: D1Database): Promise<{ next_page: number; page_count: number; record_count: number }> {
  const state = await db.prepare(`
    SELECT next_page, page_count, record_count
    FROM collect_state
    WHERE source_key = ?
  `).bind(AOSIKA_SOURCE_KEY).first<{ next_page: number; page_count: number; record_count: number }>();

  return state || { next_page: 1, page_count: 0, record_count: 0 };
}

async function upsertVideo(db: D1Database, item: VodItem): Promise<{ episodes: number }> {
  await db.prepare(`
    INSERT INTO videos (
      source_key, source_vod_id, name, type, pic, note, actor, director,
      area, lang, year, description, source_updated_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(source_key, source_vod_id) DO UPDATE SET
      name = excluded.name,
      type = excluded.type,
      pic = excluded.pic,
      note = excluded.note,
      actor = excluded.actor,
      director = excluded.director,
      area = excluded.area,
      lang = excluded.lang,
      year = excluded.year,
      description = excluded.description,
      source_updated_at = excluded.source_updated_at,
      updated_at = CURRENT_TIMESTAMP
  `).bind(
    AOSIKA_SOURCE_KEY,
    item.id,
    item.name,
    item.type,
    item.pic,
    item.note,
    item.actor,
    item.director,
    item.area,
    item.lang,
    item.year,
    item.desc,
    item.last
  ).run();

  const row = await db.prepare(`
    SELECT id FROM videos WHERE source_key = ? AND source_vod_id = ?
  `).bind(AOSIKA_SOURCE_KEY, item.id).first<{ id: number }>();

  if (!row) {
    throw new Error(`video not found after upsert: ${item.id}`);
  }

  for (const episode of item.episodes) {
    await db.prepare(`
      INSERT INTO episodes (video_id, episode_index, name, url, player, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(video_id, episode_index) DO UPDATE SET
        name = excluded.name,
        url = excluded.url,
        player = excluded.player,
        updated_at = CURRENT_TIMESTAMP
    `).bind(row.id, episode.index, episode.name, episode.url, episode.player).run();
  }

  return { episodes: item.episodes.length };
}

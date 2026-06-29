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

export interface CatalogVideo {
  id: number;
  source_vod_id: string;
  name: string;
  type: string;
  type_id: number;
  parent_type_id: number;
  tags: string;
  pic: string;
  note: string;
  actor: string;
  director: string;
  area: string;
  lang: string;
  year: string;
  description: string;
  hits: number;
  source_updated_at: string;
  first_source_index: number;
  first_episode_index: number;
  play_sources?: CatalogPlaySource[];
}

export interface CatalogPlaySource {
  id: number;
  source_index: number;
  source_code: string;
  server_code: string;
  note: string;
  episodes: CatalogEpisode[];
}

export interface CatalogEpisode {
  id: number;
  source_index: number;
  episode_index: number;
  name: string;
  url: string;
  player: string;
}

export interface ActressItem {
  name: string;
  count: number;
  pic: string;
}

export interface CatalogType {
  type_id: number;
  type_pid: number;
  type_name: string;
  type_en: string;
}

export async function listCatalogVideos(env: Env, options: {
  keyword?: string;
  type?: string;
  tag?: string;
  actor?: string;
  order?: "latest" | "hot";
  limit?: number;
  offset?: number;
} = {}): Promise<CatalogVideo[]> {
  const limit = Math.min(Math.max(options.limit || 24, 1), 80);
  const offset = Math.max(options.offset || 0, 0);
  const where = ["source_key = 'maccms'", "EXISTS (SELECT 1 FROM episodes e WHERE e.video_id = videos.id LIMIT 1)"];
  const params: unknown[] = [];

  addLike(where, params, options.keyword, ["name", "actor", "director", "type", "tags", "description"]);
  addLike(where, params, options.type, ["type", "tags"]);
  addLike(where, params, options.tag, ["tags", "name", "type", "actor", "description"]);
  addLike(where, params, options.actor, ["actor"]);

  const orderSql = options.order === "hot"
    ? "hits DESC, source_updated_at DESC, id DESC"
    : "source_updated_at DESC, id DESC";

  const rows = await env.CATALOG_DB.prepare(`
    SELECT
      id, source_vod_id, name, type, COALESCE(type_id, 0) AS type_id,
      COALESCE(parent_type_id, 0) AS parent_type_id, COALESCE(tags, '') AS tags,
      pic, note, actor, director, area, lang, year, description,
      COALESCE(hits, 0) AS hits, source_updated_at,
      COALESCE((SELECT e.source_index FROM episodes e WHERE e.video_id = videos.id ORDER BY e.source_index ASC, e.episode_index ASC LIMIT 1), 0) AS first_source_index,
      COALESCE((SELECT e.episode_index FROM episodes e WHERE e.video_id = videos.id ORDER BY e.source_index ASC, e.episode_index ASC LIMIT 1), 0) AS first_episode_index
    FROM videos
    WHERE ${where.join(" AND ")}
    ORDER BY ${orderSql}
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all<CatalogVideoRow>();

  return (rows.results || []).map(rowToCatalogVideo);
}

export async function getCatalogVideo(env: Env, id: string): Promise<CatalogVideo | null> {
  const row = await env.CATALOG_DB.prepare(`
    SELECT
      id, source_vod_id, name, type, COALESCE(type_id, 0) AS type_id,
      COALESCE(parent_type_id, 0) AS parent_type_id, COALESCE(tags, '') AS tags,
      pic, note, actor, director, area, lang, year, description,
      COALESCE(hits, 0) AS hits, source_updated_at,
      COALESCE((SELECT e.source_index FROM episodes e WHERE e.video_id = videos.id ORDER BY e.source_index ASC, e.episode_index ASC LIMIT 1), 0) AS first_source_index,
      COALESCE((SELECT e.episode_index FROM episodes e WHERE e.video_id = videos.id ORDER BY e.source_index ASC, e.episode_index ASC LIMIT 1), 0) AS first_episode_index
    FROM videos
    WHERE source_key = 'maccms' AND (source_vod_id = ? OR id = ?)
    LIMIT 1
  `).bind(id, Number(id) || -1).first<CatalogVideoRow>();

  if (!row) return null;

  const video = rowToCatalogVideo(row);
  const episodes = await env.CATALOG_DB.prepare(`
    SELECT
      e.id, e.source_index, e.episode_index, e.name, e.url, e.player,
      ps.id AS play_source_id, ps.source_code, ps.server_code, ps.note AS source_note
    FROM episodes e
    LEFT JOIN play_sources ps ON ps.id = e.play_source_id
    WHERE e.video_id = ?
    ORDER BY e.source_index ASC, e.episode_index ASC
  `).bind(video.id).all<CatalogEpisodeRow>();

  video.play_sources = groupPlaySources(episodes.results || []);
  return video;
}

export async function relatedCatalogVideos(env: Env, video: CatalogVideo, limit = 12): Promise<CatalogVideo[]> {
  const keyword = firstToken(video.type || video.tags || video.actor);
  if (!keyword) return listCatalogVideos(env, { order: "hot", limit });

  const rows = await listCatalogVideos(env, { tag: keyword, order: "hot", limit: limit + 1 });
  return rows.filter((item) => item.id !== video.id).slice(0, limit);
}

export async function listCatalogTypes(env: Env): Promise<CatalogType[]> {
  const rows = await env.CATALOG_DB.prepare(`
    SELECT type_id, type_pid, type_name, COALESCE(type_en, '') AS type_en
    FROM maccms_types
    WHERE type_status = 1
    ORDER BY type_sort DESC, type_id ASC
  `).all<CatalogType>();

  return rows.results || [];
}

export async function listActresses(env: Env, options: {
  limit?: number;
  offset?: number;
  scanLimit?: number;
} = {}): Promise<ActressItem[]> {
  const limit = Math.min(Math.max(options.limit || 80, 1), 500);
  const offset = Math.max(options.offset || 0, 0);
  const scanLimit = Math.min(Math.max(options.scanLimit || 12000, limit + offset), 60000);
  const rows = await env.CATALOG_DB.prepare(`
    SELECT actor, pic
    FROM videos
    WHERE source_key = 'maccms' AND actor IS NOT NULL AND actor != ''
    ORDER BY source_updated_at DESC, id DESC
    LIMIT ?
  `).bind(scanLimit).all<{ actor: string; pic: string }>();

  const map = new Map<string, ActressItem>();
  for (const row of rows.results || []) {
    for (const name of splitNames(row.actor)) {
      const item = map.get(name);
      if (item) {
        item.count += 1;
        if (!item.pic && row.pic) item.pic = row.pic;
      } else {
        map.set(name, { name, count: 1, pic: row.pic || "" });
      }
    }
  }

  return [...map.values()].sort((a, b) => b.count - a.count).slice(offset, offset + limit);
}

export function catalogDetailUrl(video: Pick<CatalogVideo, "source_vod_id">): string {
  return `/detail/${encodeURIComponent(video.source_vod_id)}?source=maccms`;
}

export function catalogPlayUrl(video: Pick<CatalogVideo, "source_vod_id">, sourceIndex: number, episodeIndex: number): string {
  return `/play/${encodeURIComponent(video.source_vod_id)}/${episodeIndex}?source=maccms&line=${sourceIndex}`;
}

export function catalogPrimaryPlayUrl(video: Pick<CatalogVideo, "source_vod_id" | "first_source_index" | "first_episode_index">): string {
  return catalogPlayUrl(video, video.first_source_index || 0, video.first_episode_index || 0);
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
  id?: number;
  source_vod_id: string;
  name: string;
  type: string;
  type_id?: number;
  parent_type_id?: number;
  tags?: string;
  pic: string;
  note: string;
  actor: string;
  director: string;
  area: string;
  lang: string;
  year: string;
  description: string;
  hits?: number;
  source_updated_at: string;
  first_source_index?: number;
  first_episode_index?: number;
}

interface CatalogEpisodeRow {
  id: number;
  source_index: number;
  episode_index: number;
  name: string;
  url: string;
  player: string;
  play_source_id: number;
  source_code: string;
  server_code: string;
  source_note: string;
}

function rowToVod(row: CatalogVideoRow): VodItem {
  return {
    id: row.source_vod_id,
    source: 99,
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

function rowToCatalogVideo(row: CatalogVideoRow): CatalogVideo {
  return {
    id: row.id || 0,
    source_vod_id: row.source_vod_id,
    name: row.name,
    type: row.type || "",
    type_id: row.type_id || 0,
    parent_type_id: row.parent_type_id || 0,
    tags: row.tags || "",
    pic: row.pic || "",
    note: cleanText(row.note || ""),
    actor: cleanText(row.actor || ""),
    director: cleanText(row.director || ""),
    area: row.area || "",
    lang: row.lang || "",
    year: row.year || "",
    description: cleanText(row.description || ""),
    hits: row.hits || 0,
    source_updated_at: row.source_updated_at || "",
    first_source_index: row.first_source_index || 0,
    first_episode_index: row.first_episode_index || 0,
    play_sources: []
  };
}

function groupPlaySources(rows: CatalogEpisodeRow[]): CatalogPlaySource[] {
  const map = new Map<number, CatalogPlaySource>();

  for (const row of rows) {
    const sourceIndex = row.source_index || 0;
    const source = map.get(sourceIndex) || {
      id: row.play_source_id || 0,
      source_index: sourceIndex,
      source_code: row.source_code || row.player || `line${sourceIndex + 1}`,
      server_code: row.server_code || "",
      note: row.source_note || "",
      episodes: []
    };

    source.episodes.push({
      id: row.id,
      source_index: sourceIndex,
      episode_index: row.episode_index,
      name: row.name,
      url: row.url,
      player: row.player || source.source_code
    });
    map.set(sourceIndex, source);
  }

  return [...map.values()].sort((a, b) => a.source_index - b.source_index);
}

function addLike(where: string[], params: unknown[], value: string | undefined, fields: string[]): void {
  const q = value?.trim();
  if (!q) return;
  where.push(`(${fields.map((field) => `${field} LIKE ?`).join(" OR ")})`);
  for (let index = 0; index < fields.length; index += 1) {
    params.push(`%${q}%`);
  }
}

function splitNames(value: string): string[] {
  return value
    .split(/[,，/、\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && item.length <= 24 && !/未知|匿名|佚名|演员/.test(item));
}

function firstToken(value: string): string {
  return value.split(/[,，/、\s]+/).map((item) => item.trim()).find(Boolean) || "";
}

function cleanText(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

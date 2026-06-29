import mysql from "mysql2/promise";

const mysqlConfig = {
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "videos",
  password: process.env.MYSQL_PASSWORD || "q1w2e3..",
  database: process.env.MYSQL_DATABASE || "videos",
  charset: "utf8mb4",
  waitForConnections: true,
  connectionLimit: 3,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
};

const cf = {
  accountId: required("CF_ACCOUNT_ID"),
  d1Id: required("D1_DATABASE_ID"),
  email: required("CLOUDFLARE_EMAIL"),
  apiKey: required("CLOUDFLARE_API_KEY")
};

const phase = process.argv[2] || "all";
const batchSize = Number(process.env.BATCH_SIZE || 200);
const maxBatches = Number(process.env.MAX_BATCHES || 0);

const db = mysql.createPool(mysqlConfig);

try {
  if (phase === "types" || phase === "all") {
    await migrateTypes();
  }
  if (phase === "vod" || phase === "all") {
    await migrateVod();
  }
} finally {
  await db.end();
}

async function migrateTypes() {
  const [rows] = await db.query(`
    SELECT type_id, type_pid, type_mid, type_name, type_en, type_sort, type_status, type_pic
    FROM mac_type
    ORDER BY type_id
  `);

  const statements = rows.map((row) => ({
    sql: `
      INSERT INTO maccms_types (
        type_id, type_pid, type_mid, type_name, type_en, type_sort, type_status, type_pic, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(type_id) DO UPDATE SET
        type_pid = excluded.type_pid,
        type_mid = excluded.type_mid,
        type_name = excluded.type_name,
        type_en = excluded.type_en,
        type_sort = excluded.type_sort,
        type_status = excluded.type_status,
        type_pic = excluded.type_pic,
        updated_at = CURRENT_TIMESTAMP
    `,
    params: [
      row.type_id,
      row.type_pid,
      row.type_mid,
      row.type_name,
      row.type_en,
      row.type_sort,
      row.type_status,
      row.type_pic
    ]
  }));

  await d1Batch(statements);
  console.log(`types migrated: ${rows.length}`);
}

async function migrateVod() {
  const total = await mysqlScalar("SELECT COUNT(*) AS count FROM mac_vod");
  await setMigrationTotal(total);

  let lastId = await migrationLastId();
  let batches = 0;

  while (true) {
    if (maxBatches > 0 && batches >= maxBatches) break;

    const [rows] = await db.query(`
      SELECT
        vod_id, type_id, type_id_1, vod_name, vod_sub, vod_en, vod_status,
        vod_tag, vod_class, vod_pic, vod_pic_thumb, vod_pic_slide,
        vod_actor, vod_director, vod_blurb, vod_remarks, vod_area,
        vod_lang, vod_year, vod_version, vod_state, vod_hits,
        vod_time, vod_time_add, vod_content, vod_play_from,
        vod_play_server, vod_play_note, vod_play_url
      FROM mac_vod
      WHERE vod_id > ?
      ORDER BY vod_id
      LIMIT ?
    `, [lastId, batchSize]);

    if (rows.length === 0) break;

    const statements = [];
    const videoRefs = [];

    for (const row of rows) {
      statements.push(upsertVideoStatement(row));
      videoRefs.push({
        vodId: row.vod_id,
        videoId: d1VideoId(row.vod_id),
        sources: parsePlaySources(row)
      });
    }

    await d1Batch(statements);

    for (const ref of videoRefs) {
      const playStatements = [];
      for (const source of ref.sources) {
        playStatements.push(upsertPlaySourceStatement(ref.videoId, source));
      }
      if (playStatements.length > 0) {
        await d1Batch(playStatements);
      }

      const episodeStatements = [];
      for (const source of ref.sources) {
        const playSourceId = d1PlaySourceId(ref.videoId, source.index);
        episodeStatements.push(...source.episodes.map((episode) =>
          upsertEpisodeStatement(ref.videoId, playSourceId, source.index, source.code, episode)
        ));
      }
      if (episodeStatements.length > 0) {
        await d1Batch(episodeStatements);
      }
    }

    lastId = rows[rows.length - 1].vod_id;
    batches += 1;
    await setMigrationProgress(lastId, rows.length);
    console.log(`vod batch ${batches}: migrated ${rows.length}, last_id=${lastId}`);
  }
}

function upsertVideoStatement(row) {
  return {
    sql: `
      INSERT INTO videos (
        id, source_key, source_vod_id, name, type, pic, note, actor, director,
        area, lang, year, description, source_updated_at, collected_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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
    `,
    params: [
      d1VideoId(row.vod_id),
      "maccms",
      String(row.vod_id),
      clean(row.vod_name),
      clean(row.vod_class) || clean(row.type_id),
      clean(row.vod_pic),
      clean(row.vod_remarks || row.vod_blurb),
      clean(row.vod_actor),
      clean(row.vod_director),
      clean(row.vod_area),
      clean(row.vod_lang),
      clean(row.vod_year),
      cleanHtml(row.vod_content),
      String(row.vod_time || row.vod_time_add || "")
    ]
  };
}

function upsertPlaySourceStatement(videoId, source) {
  return {
    sql: `
      INSERT INTO play_sources (
        id, video_id, source_index, source_code, server_code, note, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(video_id, source_index) DO UPDATE SET
        source_code = excluded.source_code,
        server_code = excluded.server_code,
        note = excluded.note,
        updated_at = CURRENT_TIMESTAMP
    `,
    params: [d1PlaySourceId(videoId, source.index), videoId, source.index, source.code, source.server, source.note]
  };
}

function upsertEpisodeStatement(videoId, playSourceId, sourceIndex, player, episode) {
  return {
    sql: `
      INSERT INTO episodes (
        video_id, play_source_id, source_index, episode_index, name, url, player, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(video_id, play_source_id, episode_index) DO UPDATE SET
        play_source_id = excluded.play_source_id,
        source_index = excluded.source_index,
        name = excluded.name,
        url = excluded.url,
        player = excluded.player,
        updated_at = CURRENT_TIMESTAMP
    `,
    params: [videoId, playSourceId, sourceIndex, episode.index, episode.name, episode.url, player]
  };
}

function parsePlaySources(row) {
  const froms = splitMulti(row.vod_play_from);
  const servers = splitMulti(row.vod_play_server);
  const notes = splitMulti(row.vod_play_note);
  const urlGroups = splitMulti(row.vod_play_url);
  const max = Math.max(froms.length, urlGroups.length);
  const sources = [];

  for (let index = 0; index < max; index += 1) {
    const code = clean(froms[index] || `source${index + 1}`);
    const text = urlGroups[index] || "";
    const episodes = parseEpisodes(text);
    if (!code && episodes.length === 0) continue;

    sources.push({
      index,
      code,
      server: clean(servers[index] || ""),
      note: clean(notes[index] || ""),
      episodes
    });
  }

  return sources;
}

function parseEpisodes(text) {
  return splitMultiEpisode(text)
    .map((line, index) => {
      const pos = line.indexOf("$");
      const name = pos >= 0 ? line.slice(0, pos) : `第${index + 1}集`;
      const url = pos >= 0 ? line.slice(pos + 1) : line;
      return {
        index,
        name: clean(name) || `第${index + 1}集`,
        url: clean(url)
      };
    })
    .filter((item) => item.url);
}

function splitMulti(value) {
  return String(value || "").split("$$$");
}

function splitMultiEpisode(value) {
  return String(value || "").split("#").filter(Boolean);
}

function clean(value) {
  return String(value ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanHtml(value) {
  return clean(String(value ?? "").replace(/<[^>]+>/g, " "));
}

function d1VideoId(vodId) {
  return 1_000_000_000 + Number(vodId);
}

function d1PlaySourceId(videoId, sourceIndex) {
  return (Number(videoId) * 1000) + Number(sourceIndex);
}

async function mysqlScalar(sql) {
  const [rows] = await db.query(sql);
  return Number(rows[0]?.count || 0);
}

async function migrationLastId() {
  const value = await d1FirstValue(
    "SELECT last_id FROM migration_state WHERE name = ?",
    ["maccms_vod"],
    "last_id"
  );
  return Number(value || 0);
}

async function setMigrationTotal(total) {
  await d1Batch([{
    sql: `
      INSERT INTO migration_state (name, last_id, total, migrated, last_run_at, last_error)
      VALUES (?, 0, ?, 0, CURRENT_TIMESTAMP, NULL)
      ON CONFLICT(name) DO UPDATE SET
        total = excluded.total,
        last_run_at = CURRENT_TIMESTAMP,
        last_error = NULL
    `,
    params: ["maccms_vod", total]
  }]);
}

async function setMigrationProgress(lastId, migratedDelta) {
  await d1Batch([{
    sql: `
      UPDATE migration_state
      SET last_id = ?,
          migrated = migrated + ?,
          last_run_at = CURRENT_TIMESTAMP,
          last_error = NULL
      WHERE name = ?
    `,
    params: [lastId, migratedDelta, "maccms_vod"]
  }]);
}

async function d1FirstValue(sql, params, key) {
  const results = await d1Query({ sql, params });
  return results[0]?.results?.[0]?.[key];
}

async function d1Batch(statements) {
  const size = Number(process.env.D1_STATEMENTS_PER_REQUEST || 75);
  for (let i = 0; i < statements.length; i += size) {
    const sql = statements.slice(i, i + size).map(renderStatement).join(";\n");
    await d1Query({ sql });
  }
}

async function d1Query(statement) {
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${cf.accountId}/d1/database/${cf.d1Id}/query`,
    {
      method: "POST",
      headers: {
        "X-Auth-Email": cf.email,
        "X-Auth-Key": cf.apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(statement)
    }
  );

  const body = await response.json();
  if (!response.ok || !body.success) {
    throw new Error(`D1 query failed: ${JSON.stringify(body.errors || body)}`);
  }
  return body.result || [];
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function renderStatement(statement) {
  let index = 0;
  return statement.sql.replace(/\?/g, () => sqlLiteral(statement.params[index++]));
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "bigint") return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

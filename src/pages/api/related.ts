import type { APIRoute } from "astro";
import { catalogPrimaryPlayUrl, getCatalogVideo, relatedCatalogVideos } from "../../lib/catalog";

export const GET: APIRoute = async ({ locals, request }) => {
  const runtime = locals.runtime.env as Env;
  const url = new URL(request.url);
  const id = url.searchParams.get("id") || "";
  const batch = Math.min(Math.max(Number(url.searchParams.get("batch") || 0), 0), 30);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 8), 1), 12);
  const video = await getCatalogVideo(runtime, id);

  if (!video) {
    return new Response(JSON.stringify({ ok: false, items: [] }), {
      status: 404,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      }
    });
  }

  const items = await relatedCatalogVideos(runtime, video, limit, batch * limit);

  return new Response(JSON.stringify({
    ok: true,
    batch,
    items: items.map((item) => ({
      name: item.name,
      pic: item.pic,
      type: item.type,
      year: item.year,
      actor: item.actor,
      area: item.area,
      hits: item.hits,
      playUrl: catalogPrimaryPlayUrl(item)
    }))
  }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
};

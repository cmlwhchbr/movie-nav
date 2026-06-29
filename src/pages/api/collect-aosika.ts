import type { APIRoute } from "astro";
import { collectAosika } from "../../lib/catalog";

export const GET: APIRoute = async ({ locals, request }) => {
  const runtime = locals.runtime.env as Env;
  const url = new URL(request.url);
  const pages = Number(url.searchParams.get("pages") || 3);
  const result = await collectAosika(runtime, pages);

  return new Response(JSON.stringify({ ok: true, ...result }), {
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });
};

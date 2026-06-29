import type { APIRoute } from "astro";
import { catalogStats } from "../../lib/catalog";

export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env as Env;
  const stats = await catalogStats(env);

  return new Response(JSON.stringify({ ok: true, ...stats }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
};

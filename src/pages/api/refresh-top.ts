import type { APIRoute } from "astro";
import { refreshTop } from "../../lib/top";

export const GET: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env as Env;
  const list = await refreshTop(env);

  return new Response(JSON.stringify({
    ok: true,
    count: list.length,
    updated_at: new Date().toISOString()
  }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
};

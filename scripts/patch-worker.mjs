import { readFileSync, writeFileSync } from "node:fs";

const file = new URL("../dist/_worker.js/index.js", import.meta.url);
let code = readFileSync(file, "utf8");

if (!code.includes("movie-nav scheduled refresh")) {
  code += `

// movie-nav scheduled refresh
const scheduled = async (event, env, ctx) => {
  const refreshRequest = new Request("https://movie.wp-bocai.xyz/api/refresh-top?source=cron", {
    headers: { "user-agent": "movie-nav-cron/1.0" }
  });
  const collectRequest = new Request("https://movie.wp-bocai.xyz/api/collect-aosika?pages=5&source=cron", {
    headers: { "user-agent": "movie-nav-cron/1.0" }
  });
  ctx.waitUntil(Promise.all([
    __astrojsSsrVirtualEntry.fetch(refreshRequest, env, ctx),
    __astrojsSsrVirtualEntry.fetch(collectRequest, env, ctx)
  ]));
};

export { scheduled };
`;
  writeFileSync(file, code);
}

const assetsIgnore = new URL("../dist/.assetsignore", import.meta.url);
writeFileSync(assetsIgnore, "_worker.js\n_routes.json\n");

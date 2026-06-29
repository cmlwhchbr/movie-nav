import { readFileSync, writeFileSync } from "node:fs";

const file = new URL("../dist/_worker.js/index.js", import.meta.url);
let code = readFileSync(file, "utf8");

if (!code.includes("movie-nav scheduled refresh")) {
  code += `

// movie-nav scheduled refresh
const scheduled = async (event, env, ctx) => {
  const request = new Request("https://movie.wp-bocai.xyz/api/refresh-top?source=cron", {
    headers: { "user-agent": "movie-nav-cron/1.0" }
  });
  ctx.waitUntil(__astrojsSsrVirtualEntry.fetch(request, env, ctx));
};

export { scheduled };
`;
  writeFileSync(file, code);
}

const assetsIgnore = new URL("../dist/.assetsignore", import.meta.url);
writeFileSync(assetsIgnore, "_worker.js\n_routes.json\n");

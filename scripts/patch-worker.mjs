import { readFileSync, writeFileSync } from "node:fs";

const file = new URL("../dist/_worker.js/index.js", import.meta.url);
let code = readFileSync(file, "utf8");

const assetsIgnore = new URL("../dist/.assetsignore", import.meta.url);
writeFileSync(assetsIgnore, "_worker.js\n_routes.json\n");

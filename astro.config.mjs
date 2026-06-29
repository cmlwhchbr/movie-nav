import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  output: "server",
  vite: {
    plugins: [tailwindcss()]
  },
  adapter: cloudflare({
    platformProxy: {
      enabled: true
    }
  })
});

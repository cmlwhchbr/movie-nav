/// <reference types="astro/client" />

type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {}
}

interface Env {
  SITE_NAME: string;
  MACCMS_API: string;
  MACCMS_APIS?: string;
  TOP_CACHE: KVNamespace;
  TOP_CACHE_KEY: string;
  TOP_CACHE_TTL: string;
}

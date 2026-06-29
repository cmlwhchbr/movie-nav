import { defineMiddleware } from "astro:middleware";

const allowedCrawlerPattern = /(baiduspider|sogou\s*(web|inst|pic|news)?\s*spider|sogou)/i;
const crawlerPattern = new RegExp([
  "bot",
  "spider",
  "crawler",
  "slurp",
  "googlebot",
  "bingbot",
  "duckduckbot",
  "yandex",
  "bytespider",
  "petalbot",
  "applebot",
  "ahrefs",
  "semrush",
  "mj12bot",
  "dotbot",
  "ccbot",
  "gptbot",
  "claudebot",
  "anthropic-ai",
  "facebookexternalhit",
  "twitterbot",
  "telegrambot",
  "discordbot",
  "linkedinbot",
  "pinterest",
  "python-requests",
  "scrapy",
  "curl",
  "wget"
].join("|"), "i");

export const onRequest = defineMiddleware(async (context, next) => {
  if (new URL(context.request.url).pathname === "/robots.txt") {
    return next();
  }

  const userAgent = context.request.headers.get("user-agent") || "";

  if (crawlerPattern.test(userAgent) && !allowedCrawlerPattern.test(userAgent)) {
    return new Response("Forbidden crawler", {
      status: 403,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-robots-tag": "noindex, nofollow"
      }
    });
  }

  return next();
});

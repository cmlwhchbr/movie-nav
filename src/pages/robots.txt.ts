export function GET(): Response {
  return new Response([
    "User-agent: Baiduspider",
    "Allow: /",
    "",
    "User-agent: Sogou web spider",
    "Allow: /",
    "",
    "User-agent: Sogou inst spider",
    "Allow: /",
    "",
    "User-agent: Sogou spider",
    "Allow: /",
    "",
    "User-agent: *",
    "Disallow: /",
    ""
  ].join("\n"), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=300"
    }
  });
}

export function textBetween(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return cleanXmlText(match?.[1] || "");
}

export function cleanXmlText(value: string): string {
  return value
    .replace(/^<!\[CDATA\[/, "")
    .replace(/\]\]>$/, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .trim();
}

export function videoBlocks(xml: string): string[] {
  return [...xml.matchAll(/<video>([\s\S]*?)<\/video>/gi)].map((match) => match[1] || "");
}

export function ddBlocks(xml: string): Array<{ flag: string; body: string }> {
  return [...xml.matchAll(/<dd[^>]*flag=["']?([^"'>\s]+)["']?[^>]*>([\s\S]*?)<\/dd>/gi)]
    .map((match) => ({
      flag: match[1] || "url",
      body: cleanXmlText(match[2] || "")
    }));
}

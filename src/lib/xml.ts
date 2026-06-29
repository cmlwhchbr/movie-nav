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
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number.parseInt(code, 10)))
    .replace(/\s+/g, " ")
    .trim();
}

export function videoBlocks(xml: string): string[] {
  return [...xml.matchAll(/<video>([\s\S]*?)<\/video>/gi)].map((match) => match[1] || "");
}

export function listMeta(xml: string): { page: number; pageCount: number; pageSize: number; recordCount: number } {
  const match = xml.match(/<list\b([^>]*)>/i);
  const attrs = match?.[1] || "";

  return {
    page: attrNumber(attrs, "page"),
    pageCount: attrNumber(attrs, "pagecount"),
    pageSize: attrNumber(attrs, "pagesize"),
    recordCount: attrNumber(attrs, "recordcount")
  };
}

export function ddBlocks(xml: string): Array<{ flag: string; body: string }> {
  return [...xml.matchAll(/<dd[^>]*flag=["']?([^"'>\s]+)["']?[^>]*>([\s\S]*?)<\/dd>/gi)]
    .map((match) => ({
      flag: match[1] || "url",
      body: cleanXmlText(match[2] || "")
    }));
}

function attrNumber(attrs: string, name: string): number {
  const match = attrs.match(new RegExp(`${name}=["']?(\\d+)`, "i"));
  return Number(match?.[1] || 0);
}

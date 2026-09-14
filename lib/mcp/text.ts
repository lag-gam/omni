const TOOL_TEXT_MAX = 16000;

const KEEP =
  /order|#\d+|qty|quantity|total|subtotal|price|\$\s?\d|item|product|sku|ship|deliver|size|color|qty\.|amount/i;

export function clipToolText(raw: string, max = TOOL_TEXT_MAX): string {
  const text = looksLikeHtml(raw) ? htmlToText(raw) : raw;
  const collapsed = text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  if (collapsed.length <= max) return collapsed;
  return keepUseful(collapsed, max);
}

function looksLikeHtml(text: string): boolean {
  return /<\/?(?:html|body|table|div|span|p|br|style|img)\b/i.test(text);
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|tr|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function keepUseful(text: string, max: number): string {
  const head = Math.floor(max * 0.4);
  const tail = Math.floor(max * 0.2);
  const midBudget = max - head - tail - 16;
  const interesting = collectInteresting(text, midBudget);
  return `${text.slice(0, head)}\n…\n${interesting}\n…\n${text.slice(-tail)}`;
}

function collectInteresting(text: string, budget: number): string {
  const lines = text.split("\n");
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !KEEP.test(trimmed)) continue;
    if (used + trimmed.length + 1 > budget) break;
    kept.push(trimmed);
    used += trimmed.length + 1;
  }
  return kept.join("\n");
}

import { callMcpTool } from "./pool";

export async function callGoogleTool(
  tool: string,
  args: Record<string, unknown>
): Promise<string> {
  if (tool !== "gmcp_gmail_search_emails") {
    return callMcpTool("google", tool, args);
  }

  const next = { ...args };
  next.include_body = false;
  const limit = Number(next.max_results);
  next.max_results = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 5) : 5;

  const listing = await callMcpTool("google", tool, next);
  const ids = messageIds(listing).slice(0, 2);
  if (ids.length === 0) return listing;

  const bodies = await Promise.all(
    ids.map((id) =>
      callMcpTool("google", "gmcp_gmail_get_email", {
        message_id: id,
        include_body: true,
      })
    )
  );
  return [`Search:\n${listing}`, ...bodies].join("\n\n");
}

function messageIds(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const patterns = [
    /\*\*ID\*\*:\s*([a-zA-Z0-9]+)/g,
    /\*\*Message ID\*\*:\s*([a-zA-Z0-9]+)/g,
    /"id"\s*:\s*"([a-zA-Z0-9]+)"/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const id = match[1];
      if (!id || seen.has(id) || id.length < 10) continue;
      seen.add(id);
      found.push(id);
    }
  }
  return found;
}

import { callMcpTool } from "./pool";

type Group = {
  display_name?: string;
  chat_identifier?: string;
};

const g = globalThis as typeof globalThis & {
  __omniGroups?: { at: number; rows: Group[] };
};

export async function callImessageTool(
  tool: string,
  args: Record<string, unknown>
): Promise<string> {
  const query = String(args.name ?? args.group_chat ?? "").trim();
  const next = { ...args };

  if (
    query &&
    (tool === "get_group_chat" || tool === "search_messages")
  ) {
    const hit = await resolveGroupChat(query);
    if (hit && hit.name !== query) {
      if (tool === "get_group_chat") next.name = hit.name;
      if (tool === "search_messages") next.group_chat = hit.name;
    }
  }

  if (tool === "search_messages" || tool === "get_conversation") {
    fixDayRange(next);
    if (next.contact) next.include_all = true;
  }

  return callMcpTool("imessage", tool, next);
}

function fixDayRange(args: Record<string, unknown>) {
  const to = typeof args.date_to === "string" ? args.date_to : "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    args.date_to = addDay(to);
  }
}

function addDay(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const next = new Date(year ?? 0, (month ?? 1) - 1, (day ?? 1) + 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
}

async function resolveGroupChat(
  query: string
): Promise<{ name: string; score: number } | null> {
  const groups = await listGroups();
  let best: { name: string; score: number } | null = null;
  for (const group of groups) {
    const name = group.display_name?.trim();
    if (!name) continue;
    const score = nameScore(query, name);
    if (!best || score > best.score) best = { name, score };
  }
  if (!best || best.score < 70) return null;
  return best;
}

async function listGroups(): Promise<Group[]> {
  const cached = g.__omniGroups;
  if (cached && Date.now() - cached.at < 5 * 60 * 1000) return cached.rows;
  const listed = await callMcpTool("imessage", "list_group_chats", {
    limit: 200,
    sort_by: "recent",
  });
  const rows = parseGroups(listed);
  g.__omniGroups = { at: Date.now(), rows };
  return rows;
}

function parseGroups(text: string): Group[] {
  const start = text.indexOf("[");
  if (start === -1) return [];
  try {
    const parsed = JSON.parse(text.slice(start)) as unknown;
    return Array.isArray(parsed) ? (parsed as Group[]) : [];
  } catch {
    return [];
  }
}

function nameScore(query: string, name: string): number {
  const q = normalize(query);
  const n = normalize(name);
  if (!q || !n) return 0;
  if (n === q) return 100;
  if (n.includes(q) || q.includes(n)) return 92;

  const qc = q.replace(/ /g, "");
  const nc = n.replace(/ /g, "");
  if (nc.includes(qc) || qc.includes(nc)) return 88;

  const maxLen = Math.max(qc.length, nc.length);
  const edit = 100 * (1 - levenshtein(qc, nc) / maxLen);

  const qTokens = q.split(" ");
  const nTokens = n.split(" ");
  let hits = 0;
  for (const token of qTokens) {
    if (
      nTokens.some(
        (other) =>
          other === token ||
          other.includes(token) ||
          token.includes(other) ||
          levenshtein(token, other) <= 1
      )
    ) {
      hits += 1;
    }
  }
  const tokens = (100 * hits) / qTokens.length;
  return Math.round(Math.max(edit, tokens));
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(group|chat|the|our|my|imessage|messages?)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const grid = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i++) grid[i]![0] = i;
  for (let j = 0; j < cols; j++) grid[0]![j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      grid[i]![j] = Math.min(
        (grid[i - 1]![j] ?? 0) + 1,
        (grid[i]![j - 1] ?? 0) + 1,
        (grid[i - 1]![j - 1] ?? 0) + cost
      );
    }
  }
  return grid[a.length]![b.length] ?? 99;
}

import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  Tool,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";
import { loadConfig } from "../config";
import { conversationScratch, saveSession } from "../conversation";
import { ANTHROPIC_MODEL } from "../providers/anthropic";
import { localContextBlock } from "../local-context";
import type { Citation, HudCard, StreamEvent } from "../types";
import { saveNote, searchNotes } from "./builtin";
import { clipToolText } from "./text";
import { callGoogleTool } from "./google";
import { callImessageTool } from "./imessage";
import { callN8nWebhook, getN8nTools } from "../n8n";
import {
  anthropicToolName,
  callMcpTool,
  getMcpTools,
  type McpTool,
} from "./pool";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BUILTIN: Tool[] = [
  {
    name: "omni_search_notes",
    description:
      "Search notes the user has saved in Omni. Use for things they told Omni directly.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "omni_save_note",
    description: "Save a short fact or reminder into Omni's local notes.",
    input_schema: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    },
  },
];

const SYSTEM = `You are Jarvis. British. Dry. Your words are spoken out loud, then shown as a short caption. People wake you by saying Jarvis.

Rules:
- Two to five short sentences. Spoken British English. No markdown, no bullets, no bold, no links, no URLs.
- Warm but not ominous. No dossier tone. Don't spell codes or prices like a threat.
- No preambles ("it looks like", "I can see that", "from my earlier search").
- Never narrate tool use. Do not say you will search, try again, or look something up. The app already says "Checking." Then answer with what you found.
- No offers ("would you like me to"). If something is missing, say so in one line.
- Previous turns are this same conversation. Resolve pronouns (him, her, that, it) from that context. Do not ask who "him" is if the name is already in the thread.
- You take actions, not only look things up. If they ask you to send, draft, reply, schedule, or create something, call the write tool. Do not save that request as an Omni note.
- "Email myself" or "to myself" means send or draft to the connected Gmail account. If you need the address, take it from earlier mail results or the authenticated profile. If send fails, create a draft and say so.
- Tasks: name, status, due date if it exists. Skip empty fields. Three or four items max, then a count of the rest.
- Use tools for mail, calendar, Notion, messages, and Omni notes. Never invent those.
- Mail search is only a list. If they ask what they bought, the price, or any detail missing from the snippet, open that message with get_email. Never say the body was cut off.
- Prefer one tool call, then answer, unless the first result is a snippet. For iMessage, search_messages or get_conversation. Put the person in contact, not query. For today, set date_from only. Do not list groups first.`;

type ConnectorCapability =
  | "mail-search"
  | "mail-get"
  | "mail-send"
  | "mail-draft"
  | "mail-reply"
  | "mail-manage"
  | "calendar-list"
  | "calendar-get"
  | "calendar-create"
  | "calendar-manage";
type Route = {
  server: string;
  tool: string;
  capability?: ConnectorCapability;
};

export async function* runAgentStream(
  question: string,
  history: MessageParam[] = [],
  traceId = "agent"
): AsyncGenerator<StreamEvent> {
  const tag = `agent ${traceId}`;
  console.log(`[omni] ${tag} preparing`);
  yield { type: "log", text: `${tag} preparing` };
  const mcpTools = await getMcpTools();
  const n8nEnabled = loadConfig().n8n?.enabled === true;
  const n8nTools = n8nEnabled ? await getN8nTools() : [];
  const routes = new Map<string, Route>();
  const tools: Tool[] = [...BUILTIN];
  const googleFallbacks = buildGoogleFallbacks(mcpTools);
  const n8nCapabilities = new Set(
    n8nTools
      .map((tool) => connectorCapability(tool.name, tool.description))
      .filter((value): value is ConnectorCapability => value !== null)
  );

  for (const t of [...mcpTools, ...n8nTools]) {
    const capability = connectorCapability(t.name, t.description);
    if (
      t.server === "google" &&
      capability &&
      n8nCapabilities.has(capability)
    ) {
      continue;
    }
    if (!keepTool(t.server, t.name)) continue;
    const name = anthropicToolName(t.server, t.name);
    routes.set(name, {
      server: t.server,
      tool: t.name,
      ...(capability ? { capability } : {}),
    });
    tools.push({
      name,
      description: `[${t.server}] ${t.description}`,
      input_schema: t.inputSchema as Tool["input_schema"],
    });
  }
  console.log(
    `[omni] ${tag} tools ready builtin=${BUILTIN.length} mcp=${mcpTools.length} n8n=${
      n8nEnabled ? n8nTools.length : "off"
    }`
  );
  yield { type: "log", text: `${tag} requesting response` };

  const used = new Set<string>();
  const scratch = conversationScratch();
  const messages: MessageParam[] = [
    ...history.filter(
      (m) => typeof m.content === "string" && m.content.trim().length > 0
    ),
    { role: "user", content: question },
  ];
  const system = [
    SYSTEM,
    localContextBlock(),
    scratch
      ? `Earlier findings from this conversation (use silently; do not read them aloud):\n${scratch}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  let spoken = "";
  let announced = false;

  for (let i = 0; i < 4; i++) {
    const turnStarted = Date.now();
    console.log(
      `[omni] ${tag} model turn=${i + 1} messages=${messages.length} tools=${tools.length}`
    );
    const stream = client.messages.stream({
      model: ANTHROPIC_MODEL,
      max_tokens: 500,
      system,
      tools,
      messages,
    });

    let turnText = "";
    let spokenOut = "";
    let toolTurn = false;
    let streamingLogged = false;
    for await (const event of stream) {
      if (
        event.type === "content_block_start" &&
        event.content_block.type === "tool_use"
      ) {
        toolTurn = true;
        if (!announced) {
          announced = true;
          const name = event.content_block.name ?? "";
          yield { type: "token", text: fillerLine(name) };
          yield { type: "status", text: "Checking…" };
        }
      }
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        if (!streamingLogged) {
          streamingLogged = true;
          console.log(`[omni] ${tag} response streaming`);
        }
        turnText += event.delta.text;
        if (toolTurn) continue;
        for (const piece of takeSentences(turnText, spokenOut, false)) {
          spokenOut += piece;
          yield { type: "token", text: piece };
        }
      }
    }

    const res = await stream.finalMessage();
    console.log(
      `[omni] ${tag} model complete turn=${i + 1} stop=${res.stop_reason ?? "unknown"} blocks=${res.content.length} ${Date.now() - turnStarted}ms`
    );
    const toolUses = res.content.filter(
      (b): b is ToolUseBlock => b.type === "tool_use"
    );

    if (toolUses.length === 0) {
      if (!spokenOut) {
        for (const piece of speakablePieces(turnText)) {
          yield { type: "token", text: piece };
        }
      } else {
        const rest = turnText.slice(spokenOut.length).trim();
        if (rest) yield { type: "token", text: ` ${rest}` };
      }
      spoken += turnText;
      const response = spoken.trim();
      console.log(`[omni] ${tag} response ${JSON.stringify(response)}`);
      yield { type: "log", text: `${tag} response ${response}` };
      messages.push({ role: "assistant", content: spoken.trim() });
      saveSession(messages);
      yield {
        type: "done",
        result: {
          type: "answer",
          text: response,
          source: used.size > 0 ? "memory" : "general",
          citations: citationsFrom(used),
        },
      };
      return;
    }

    messages.push({ role: "assistant", content: res.content });
    for (const call of toolUses) {
      const label = toolLabel(call.name, routes);
      const line = `mcp ${label} ${brief(call.input)}`;
      console.log(`[omni] ${line}`);
      yield { type: "log", text: line };
    }
    const packed = await Promise.all(
      toolUses.map(async (call) => {
        used.add(call.name);
        const started = Date.now();
        const content = await executeTool(
          call.name,
          call.input,
          routes,
          googleFallbacks
        );
        const label = toolLabel(call.name, routes);
        const line = `mcp ${label} ${Date.now() - started}ms ${content.length}c`;
        console.log(`[omni] ${line}`);
        return {
          type: "tool_result" as const,
          tool_use_id: call.id,
          content,
          line,
          card: toolCard(call.id, label, content),
        };
      })
    );
    for (const row of packed) {
      yield { type: "log", text: row.line };
      yield { type: "card", card: row.card };
    }
    console.log(
      `[omni] agent turn ${i} ${toolUses.length} tools ${Date.now() - turnStarted}ms`
    );
    messages.push({
      role: "user",
      content: packed.map(({ type, tool_use_id, content }) => ({
        type,
        tool_use_id,
        content,
      })),
    });
  }

  const fallback = spoken.trim() || "That took too many steps.";
  console.log(`[omni] ${tag} response ${JSON.stringify(fallback)}`);
  yield { type: "log", text: `${tag} response ${fallback}` };
  yield {
    type: "done",
    result: {
      type: "answer",
      text: fallback,
      source: used.size > 0 ? "memory" : "general",
      citations: citationsFrom(used),
    },
  };
}

async function executeTool(
  name: string,
  input: unknown,
  routes: Map<string, Route>,
  googleFallbacks: Map<ConnectorCapability, Route>
): Promise<string> {
  const args = (input ?? {}) as Record<string, unknown>;
  if (name === "omni_search_notes") return searchNotes(String(args.query ?? ""));
  if (name === "omni_save_note") return saveNote(String(args.text ?? ""));
  const route = routes.get(name);
  if (!route) return `Unknown tool: ${name}`;
  if (route.server === "n8n-hook") {
    const result = await callN8nWebhook(route.tool, args);
    const capability = route.capability ?? connectorCapability(route.tool);
    const fallback = capability ? googleFallbacks.get(capability) : undefined;
    if (capability && fallback && n8nCallFailed(result)) {
      console.warn(
        `[omni] n8n ${route.tool} failed; falling back to google.${fallback.tool}`
      );
      return callGoogleTool(
        fallback.tool,
        googleFallbackArgs(capability, args)
      );
    }
    return result;
  }
  if (route.server === "imessage") return callImessageTool(route.tool, args);
  if (route.server === "google") return callGoogleTool(route.tool, args);
  return callMcpTool(route.server, route.tool, args);
}

function toolLabel(name: string, routes: Map<string, Route>): string {
  const route = routes.get(name);
  return route ? `${route.server}.${route.tool}` : name;
}

function brief(input: unknown): string {
  try {
    return JSON.stringify(input ?? {}).slice(0, 160);
  } catch {
    return "";
  }
}

function fillerLine(name: string): string {
  if (/gmail|email|mail/i.test(name)) return "Checking your mail. ";
  if (/calendar|event/i.test(name)) return "Checking the calendar. ";
  if (/imessage|message|sms/i.test(name)) return "Checking your messages. ";
  if (/notion/i.test(name)) return "Checking Notion. ";
  return "Checking. ";
}

function keepTool(server: string, name: string): boolean {
  if (server === "imessage") {
    return /^(search_messages|get_conversation|list_group_chats|get_group_chat|resolve_contact|get_contact)$/.test(
      name
    );
  }
  if (server === "google") {
    return /search|get_email|send|draft|reply|event|calendar|create/i.test(name);
  }
  return true;
}

function connectorCapability(
  name: string,
  description = ""
): ConnectorCapability | null {
  const tool = name.toLowerCase().replace(/[_-]+/g, " ");
  const key = `${tool} ${description.toLowerCase()}`;
  if (/\b(gmail|email|mail)\b/.test(key)) {
    if (/\breply\b|\bforward\b/.test(tool)) return "mail-reply";
    if (/\bdraft\b/.test(tool)) return "mail-draft";
    if (/\bsend\b/.test(tool)) return "mail-send";
    if (/\bget\b|\bread\b|\bthread\b|\battachment\b/.test(tool)) {
      return "mail-get";
    }
    if (/\bmodify\b|\bdelete\b|\barchive\b|\btrash\b|\blabel\b/.test(tool)) {
      return "mail-manage";
    }
    return "mail-search";
  }
  if (/\b(calendar|event)\b/.test(key)) {
    if (/\bcreate\b/.test(tool)) return "calendar-create";
    if (/\bupdate\b|\bdelete\b|\bcancel\b|\bmodify\b/.test(tool)) {
      return "calendar-manage";
    }
    if (/\bget\b/.test(tool)) return "calendar-get";
    return "calendar-list";
  }
  return null;
}

const GOOGLE_FALLBACK_TOOLS: Partial<
  Record<ConnectorCapability, string>
> = {
  "mail-search": "gmcp_gmail_search_emails",
  "mail-get": "gmcp_gmail_get_email",
  "mail-send": "gmcp_gmail_send_email",
  "mail-draft": "gmcp_gmail_create_draft",
  "mail-reply": "gmcp_gmail_reply",
  "mail-manage": "gmcp_gmail_modify_labels",
  "calendar-list": "gmcp_calendar_list_events",
  "calendar-get": "gmcp_calendar_get_event",
  "calendar-create": "gmcp_calendar_create_event",
};

function buildGoogleFallbacks(
  tools: McpTool[]
): Map<ConnectorCapability, Route> {
  const available = new Set(
    tools
      .filter((tool) => tool.server === "google")
      .map((tool) => tool.name)
  );
  const routes = new Map<ConnectorCapability, Route>();
  for (const [capability, tool] of Object.entries(GOOGLE_FALLBACK_TOOLS)) {
    if (tool && available.has(tool)) {
      routes.set(capability as ConnectorCapability, {
        server: "google",
        tool,
        capability: capability as ConnectorCapability,
      });
    }
  }
  return routes;
}

function n8nCallFailed(result: string): boolean {
  return /^(?:n8n .+ (?:is disabled|is unavailable|failed:)|Unknown n8n workflow)/i.test(
    result.trim()
  );
}

function googleFallbackArgs(
  capability: ConnectorCapability,
  args: Record<string, unknown>
): Record<string, unknown> {
  if (capability !== "calendar-list") return args;
  const mapped = { ...args };
  if (mapped.time_min === undefined && mapped.from !== undefined) {
    mapped.time_min = mapped.from;
  }
  if (mapped.time_max === undefined && mapped.to !== undefined) {
    mapped.time_max = mapped.to;
  }
  delete mapped.from;
  delete mapped.to;
  return mapped;
}

function speakablePieces(text: string): string[] {
  return takeSentences(text, "", true);
}

function takeSentences(
  full: string,
  already: string,
  force: boolean
): string[] {
  const rest = full.slice(already.length);
  const parts = rest
    .split(/(?<=[.!?])\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return [];
  const last = parts[parts.length - 1] ?? "";
  const lastDone = /[.!?]$/.test(last);
  const ready = force || lastDone ? parts : parts.slice(0, -1);
  if (ready.length === 0) return [];
  return ready.map((s, i) => (already.length === 0 && i === 0 ? s : ` ${s}`));
}

function toolCard(id: string, label: string, content: string): HudCard {
  return {
    id,
    kind: "tool",
    title: friendlyTool(label),
    body: clipToolText(content, 700),
  };
}

function friendlyTool(label: string): string {
  if (/gmail|email|mail/i.test(label)) return "Gmail";
  if (/calendar|event/i.test(label)) return "Calendar";
  if (label.startsWith("google.")) return "Google";
  if (label.startsWith("imessage.")) return "Messages";
  if (/notion/i.test(label)) return "Notion";
  if (label.startsWith("n8n.")) return label.slice(4).replace(/_/g, " ");
  if (label.startsWith("omni_")) return "Notes";
  return label.replace(/[._]/g, " ");
}

function citationsFrom(used: Set<string>): Citation[] {
  return [...used].map((name) => ({
    kind: name.startsWith("omni_") ? "note" : "tool",
    title: name,
    display: name.startsWith("omni_") ? "your notes" : name.replace(/_/g, " "),
  }));
}

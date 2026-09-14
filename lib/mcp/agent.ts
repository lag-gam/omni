import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  Tool,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";
import { ANTHROPIC_MODEL } from "../providers/anthropic";
import { localContextBlock } from "../local-context";
import type { Citation, StreamEvent } from "../types";
import { saveNote, searchNotes } from "./builtin";
import { anthropicToolName, callMcpTool, getMcpTools } from "./pool";

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

const SYSTEM = `You are Jarvis. Your words are spoken out loud, then shown as a short caption.

Rules:
- Two to five short sentences. Spoken English. No markdown, no bullets, no bold, no links, no URLs.
- No preambles ("it looks like", "I can see that", "from my earlier search").
- No offers ("would you like me to"). If something is missing, say so in one line.
- Tasks: name, status, due date if it exists. Skip empty fields. Three or four items max, then a count of the rest.
- Use tools for mail, calendar, Notion, messages, and Omni notes. Never invent those.`;

type Route = { server: string; tool: string };

export async function* runAgentStream(
  question: string
): AsyncGenerator<StreamEvent> {
  const mcpTools = await getMcpTools();
  const routes = new Map<string, Route>();
  const tools: Tool[] = [...BUILTIN];

  for (const t of mcpTools) {
    const name = anthropicToolName(t.server, t.name);
    routes.set(name, { server: t.server, tool: t.name });
    tools.push({
      name,
      description: `[${t.server}] ${t.description}`,
      input_schema: t.inputSchema as Tool["input_schema"],
    });
  }

  const used = new Set<string>();
  const messages: MessageParam[] = [{ role: "user", content: question }];
  let spoken = "";

  for (let i = 0; i < 6; i++) {
    if (i > 0) yield { type: "status", text: "Checking…" };

    const stream = client.messages.stream({
      model: ANTHROPIC_MODEL,
      max_tokens: 220,
      system: `${SYSTEM}\n${localContextBlock()}`,
      tools,
      messages,
    });

    let turnText = "";
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        turnText += event.delta.text;
        yield { type: "token", text: event.delta.text };
      }
    }

    const res = await stream.finalMessage();
    const toolUses = res.content.filter(
      (b): b is ToolUseBlock => b.type === "tool_use"
    );
    spoken += turnText;

    if (toolUses.length === 0) {
      yield {
        type: "done",
        result: {
          type: "answer",
          text: spoken.trim(),
          source: used.size > 0 ? "memory" : "general",
          citations: citationsFrom(used),
        },
      };
      return;
    }

    messages.push({ role: "assistant", content: res.content });
    const results: {
      type: "tool_result";
      tool_use_id: string;
      content: string;
    }[] = [];

    for (const call of toolUses) {
      used.add(call.name);
      results.push({
        type: "tool_result",
        tool_use_id: call.id,
        content: await executeTool(call.name, call.input, routes),
      });
    }
    messages.push({ role: "user", content: results });
  }

  yield {
    type: "done",
    result: {
      type: "answer",
      text: spoken.trim() || "That took too many steps.",
      source: used.size > 0 ? "memory" : "general",
      citations: citationsFrom(used),
    },
  };
}

async function executeTool(
  name: string,
  input: unknown,
  routes: Map<string, Route>
): Promise<string> {
  const args = (input ?? {}) as Record<string, unknown>;
  if (name === "omni_search_notes") return searchNotes(String(args.query ?? ""));
  if (name === "omni_save_note") return saveNote(String(args.text ?? ""));
  const route = routes.get(name);
  if (!route) return `Unknown tool: ${name}`;
  return callMcpTool(route.server, route.tool, args);
}

function citationsFrom(used: Set<string>): Citation[] {
  return [...used].map((name) => ({
    kind: name.startsWith("omni_") ? "note" : "tool",
    title: name,
    display: name.startsWith("omni_") ? "your notes" : name.replace(/_/g, " "),
  }));
}

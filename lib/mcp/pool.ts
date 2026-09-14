import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  isHttpServer,
  loadConfig,
  requiredMissing,
  type McpServerConfig,
} from "../config";

export type McpTool = {
  server: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

type Entry = {
  client: Client;
  tools: McpTool[];
};

const pool = new Map<string, Entry>();

function cleanEnv(
  raw: NodeJS.ProcessEnv | Record<string, string | undefined>
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value !== undefined) env[key] = value;
  }
  return env;
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32);
}

export function anthropicToolName(server: string, tool: string): string {
  const n = `${sanitize(server)}_${tool}`.slice(0, 64);
  return n.replace(/[^a-zA-Z0-9_-]/g, "_");
}

async function connect(name: string, config: McpServerConfig): Promise<Entry> {
  const client = new Client({ name: "omni", version: "0.1.0" });

  if (isHttpServer(config)) {
    const headers = new Headers(config.headers);
    const transport = new StreamableHTTPClientTransport(new URL(config.url), {
      requestInit: { headers },
    });
    await client.connect(transport);
  } else {
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      cwd: config.cwd,
      env: cleanEnv({
        ...process.env,
        PATH: `${path.join(os.homedir(), ".bun", "bin")}:${process.env.PATH ?? ""}`,
        ...config.env,
      }),
      stderr: "pipe",
    });
    await client.connect(transport);
  }

  const listed = await client.listTools();
  const tools: McpTool[] = (listed.tools ?? []).map((t) => ({
    server: name,
    name: t.name,
    description: t.description ?? t.name,
    inputSchema: (t.inputSchema ?? {
      type: "object",
      properties: {},
    }) as Record<string, unknown>,
  }));

  return { client, tools };
}

export async function getMcpTools(): Promise<McpTool[]> {
  const { mcpServers } = loadConfig();
  const names = Object.keys(mcpServers);
  const tools: McpTool[] = [];

  for (const name of names) {
    const missing = requiredMissing(mcpServers[name]);
    if (missing.length > 0) {
      console.warn(
        `[omni] MCP server "${name}" skipped — missing ${missing.join(", ")}`
      );
      continue;
    }
    try {
      if (!pool.has(name)) {
        pool.set(name, await connect(name, mcpServers[name]));
      }
      tools.push(...pool.get(name)!.tools);
    } catch (err) {
      pool.delete(name);
      console.warn(
        `[omni] MCP server "${name}" failed:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return tools;
}

export async function callMcpTool(
  server: string,
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  const { mcpServers } = loadConfig();
  const config = mcpServers[server];
  if (!config) return `Unknown MCP server: ${server}`;

  try {
    if (!pool.has(server)) {
      pool.set(server, await connect(server, config));
    }
    const result = await pool.get(server)!.client.callTool({
      name,
      arguments: args,
    });
    const blocks = Array.isArray(result.content) ? result.content : [];
    const text = blocks
      .filter((b) => b && typeof b === "object" && "type" in b && b.type === "text")
      .map((b) => ("text" in b ? String(b.text) : ""))
      .join("\n");
    if (text) return text.slice(0, 8000);
    if ("structuredContent" in result && result.structuredContent) {
      return JSON.stringify(result.structuredContent).slice(0, 8000);
    }
    return JSON.stringify(result).slice(0, 8000);
  } catch (err) {
    pool.delete(server);
    return err instanceof Error ? err.message : "MCP tool failed";
  }
}

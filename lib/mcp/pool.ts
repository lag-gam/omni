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
import { clipToolText } from "./text";

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

const g = globalThis as typeof globalThis & {
  __omniMcp?: Map<string, Entry>;
  __omniMcpWait?: Map<string, Promise<Entry>>;
  __omniMcpWarm?: Promise<McpTool[]>;
  __omniCapture?: Promise<void>;
};

const pool = (g.__omniMcp ??= new Map<string, Entry>());
const waiting = (g.__omniMcpWait ??= new Map<string, Promise<Entry>>());

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
  const started = Date.now();
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

  console.log(`[omni] mcp ${name} up ${Date.now() - started}ms (${tools.length} tools)`);
  return { client, tools };
}

async function ensure(name: string, config: McpServerConfig): Promise<Entry> {
  const existing = pool.get(name);
  if (existing) return existing;
  const pending = waiting.get(name);
  if (pending) return pending;
  const job = connect(name, config)
    .then((entry) => {
      pool.set(name, entry);
      waiting.delete(name);
      return entry;
    })
    .catch((err) => {
      waiting.delete(name);
      throw err;
    });
  waiting.set(name, job);
  return job;
}

function toolsFromPool(): McpTool[] {
  return [...pool.values()].flatMap((entry) => entry.tools);
}

export async function getMcpTools(): Promise<McpTool[]> {
  const { mcpServers } = loadConfig();
  const jobs = Object.entries(mcpServers).flatMap(([name, config]) => {
    const missing = requiredMissing(config);
    if (missing.length > 0) {
      console.warn(
        `[omni] MCP server "${name}" skipped — missing ${missing.join(", ")}`
      );
      return [];
    }
    return [
      {
        name,
        promise: ensure(name, config).catch((err) => {
          pool.delete(name);
          console.warn(
            `[omni] MCP server "${name}" failed:`,
            err instanceof Error ? err.message : err
          );
          return null;
        }),
      },
    ];
  });

  if (jobs.length === 0) return toolsFromPool();
  const google = jobs.find((job) => job.name === "google");
  if (google) {
    const deadline = Date.now() + 15_000;
    await settleWithin([google.promise], 15_000);
    await settleWithin(
      jobs.map((job) => job.promise),
      Math.min(2_000, Math.max(0, deadline - Date.now()))
    );
  } else {
    await settleWithin(
      jobs.map((job) => job.promise),
      5_000
    );
  }
  return toolsFromPool();
}

async function settleWithin(
  jobs: Promise<unknown>[],
  timeoutMs: number
): Promise<void> {
  if (jobs.length === 0 || timeoutMs <= 0) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.allSettled(jobs),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    }),
  ]);
  if (timer) clearTimeout(timer);
}

export function warmMcp() {
  g.__omniMcpWarm ??= getMcpTools().catch((err) => {
    g.__omniMcpWarm = undefined;
    console.warn("[omni] mcp warm failed:", err);
    return [];
  });
  return g.__omniMcpWarm;
}

export async function callMcpTool(
  server: string,
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  const { mcpServers } = loadConfig();
  const config = mcpServers[server];
  if (!config) return `Unknown MCP server: ${server}`;

  const started = Date.now();
  try {
    const entry = await ensure(server, config);
    const result = await entry.client.callTool({
      name,
      arguments: args,
    });
    console.log(`[omni] tool ${server}.${name} ${Date.now() - started}ms`);
    return textOf(result);
  } catch (first) {
    pool.delete(server);
    try {
      const entry = await ensure(server, config);
      const result = await entry.client.callTool({
        name,
        arguments: args,
      });
      console.log(`[omni] tool ${server}.${name} retry ${Date.now() - started}ms`);
      return textOf(result);
    } catch (err) {
      pool.delete(server);
      console.warn(
        `[omni] tool ${server}.${name} failed ${Date.now() - started}ms`,
        err instanceof Error ? err.message : err
      );
      return first instanceof Error ? first.message : "MCP tool failed";
    }
  }
}

function textOf(result: unknown): string {
  const row =
    result && typeof result === "object"
      ? (result as Record<string, unknown>)
      : {};
  const blocks = Array.isArray(row.content) ? row.content : [];
  const text = blocks
    .filter((b) => b && typeof b === "object" && "type" in b && b.type === "text")
    .map((b) => ("text" in b ? String(b.text) : ""))
    .join("\n");
  if (text) return clipToolText(text);
  if (row.structuredContent) {
    return clipToolText(JSON.stringify(row.structuredContent));
  }
  return clipToolText(JSON.stringify(result));
}

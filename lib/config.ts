import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type McpStdioServer = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  requires?: string[];
};

export type McpHttpServer = {
  url: string;
  headers?: Record<string, string>;
  requires?: string[];
};

export type McpServerConfig = McpStdioServer | McpHttpServer;

export type OmniConfig = {
  mcpServers: Record<string, McpServerConfig>;
};

export function isHttpServer(s: McpServerConfig): s is McpHttpServer {
  return "url" in s;
}

function interpolate(value: string): string {
  return value.replace(/\$\{(\w+)\}/g, (_, key: string) => process.env[key] ?? "");
}

function walk<T>(value: T): T {
  if (typeof value === "string") return interpolate(value) as T;
  if (Array.isArray(value)) return value.map((v) => walk(v)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = walk(v);
    return out as T;
  }
  return value;
}

export function requiredMissing(config: McpServerConfig): string[] {
  const keys = config.requires ?? [];
  return keys.filter((key) => {
    const value = process.env[key]?.trim();
    if (!value) return true;
    if (key.endsWith("_PATH") && !existsSync(path.resolve(value))) return true;
    return false;
  });
}

export function loadConfig(): OmniConfig {
  const file = path.resolve(process.cwd(), "omni.config.json");
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as {
      mcpServers?: Record<string, McpServerConfig>;
    };
    return walk({ mcpServers: raw.mcpServers ?? {} });
  } catch {
    return { mcpServers: {} };
  }
}

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

export type N8nWebhook = {
  name: string;
  path: string;
  description?: string;
  schema?: Record<string, unknown>;
};

export type N8nConfig = {
  enabled?: boolean;
  baseUrl?: string;
  apiKey?: string;
  mcpUrl?: string;
  webhooks?: N8nWebhook[];
};

export type OmniConfig = {
  mcpServers: Record<string, McpServerConfig>;
  n8n?: N8nConfig;
};

export function isHttpServer(s: McpServerConfig): s is McpHttpServer {
  return "url" in s;
}

function interpolate(value: string): string {
  return value.replace(/\$\{(\w+)\}/g, (_, key: string) => process.env[key] ?? "");
}

function n8nEnabled(configured?: boolean): boolean {
  const raw = process.env.OMNI_N8N_ENABLED?.trim();
  if (raw !== undefined && raw !== "") {
    return /^(1|true|yes|on)$/i.test(raw);
  }
  return configured === true;
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
      n8n?: N8nConfig;
    };
    const n8n = walk((raw.n8n ?? {}) as N8nConfig);
    n8n.enabled = n8nEnabled(n8n.enabled);
    if (!n8n.baseUrl && process.env.N8N_BASE_URL) n8n.baseUrl = process.env.N8N_BASE_URL;
    if (!n8n.apiKey && process.env.N8N_API_KEY) n8n.apiKey = process.env.N8N_API_KEY;
    if (!n8n.mcpUrl && process.env.N8N_MCP_URL) n8n.mcpUrl = process.env.N8N_MCP_URL;
    const mcpServers = walk(raw.mcpServers ?? {});
    if (!n8n.enabled) {
      delete mcpServers.n8n;
    } else if (n8n.mcpUrl && !mcpServers.n8n) {
      mcpServers.n8n = {
        url: n8n.mcpUrl,
        headers: n8n.apiKey
          ? { Authorization: `Bearer ${n8n.apiKey}` }
          : undefined,
      };
    }
    return { mcpServers, n8n };
  } catch {
    const n8n: N8nConfig = {
      enabled: n8nEnabled(),
      baseUrl: process.env.N8N_BASE_URL,
      apiKey: process.env.N8N_API_KEY,
      mcpUrl: process.env.N8N_MCP_URL,
    };
    const mcpServers: Record<string, McpServerConfig> = {};
    if (n8n.enabled && n8n.mcpUrl) {
      mcpServers.n8n = {
        url: n8n.mcpUrl,
        headers: n8n.apiKey
          ? { Authorization: `Bearer ${n8n.apiKey}` }
          : undefined,
        requires: undefined,
      };
    }
    return { mcpServers, n8n };
  }
}

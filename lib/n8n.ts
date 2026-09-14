import { clipToolText } from "./mcp/text";
import { loadConfig, type N8nWebhook } from "./config";

export type N8nTool = {
  server: "n8n-hook";
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  path: string;
};

const g = globalThis as typeof globalThis & {
  __omniN8n?: Promise<N8nTool[]>;
  __omniN8nHealth?: {
    baseUrl: string;
    checkedAt: number;
    up: boolean;
  };
};

export async function getN8nTools(): Promise<N8nTool[]> {
  const { n8n } = loadConfig();
  if (!n8n?.enabled || !n8n.baseUrl) return [];
  if (!(await n8nAvailable(n8n.baseUrl))) return [];
  const listed = n8n.webhooks?.map(fromConfig) ?? [];
  if (listed.length > 0) return listed;
  if (!n8n.apiKey) return [];
  try {
    return await discover(n8n.baseUrl, n8n.apiKey);
  } catch (err) {
    console.warn("[omni] n8n discover", err instanceof Error ? err.message : err);
    return [];
  }
}

export function warmN8n() {
  if (loadConfig().n8n?.enabled !== true) return Promise.resolve([]);
  g.__omniN8n ??= getN8nTools().catch((err) => {
    g.__omniN8n = undefined;
    console.warn("[omni] n8n warm failed:", err);
    return [];
  });
  return g.__omniN8n;
}

export async function callN8nWebhook(
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  const { n8n } = loadConfig();
  if (!n8n?.enabled) return `n8n ${name} is disabled.`;
  const tools = await getN8nTools();
  const tool = tools.find((t) => t.name === name);
  if (!tool || !n8n?.baseUrl) return `Unknown n8n workflow: ${name}`;
  if (!(await n8nAvailable(n8n.baseUrl))) {
    return `n8n ${name} is unavailable.`;
  }

  const root = n8n.baseUrl.replace(/\/$/, "");
  const url = `${root}/webhook/${tool.path.replace(/^\//, "")}`;
  const started = Date.now();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (n8n.apiKey) headers["X-N8N-API-KEY"] = n8n.apiKey;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(8000),
    });
    const raw = await res.text();
    console.log(`[omni] n8n ${name} ${res.status} ${Date.now() - started}ms`);
    if (!res.ok) return `n8n ${name} failed: ${res.status} ${raw.slice(0, 240)}`;
    return clipToolText(pretty(raw));
  } catch (err) {
    console.warn(
      `[omni] n8n ${name} unavailable ${Date.now() - started}ms`,
      err instanceof Error ? err.message : err
    );
    return `n8n ${name} is unavailable.`;
  }
}

async function n8nAvailable(baseUrl: string): Promise<boolean> {
  const root = baseUrl.replace(/\/$/, "");
  const cached = g.__omniN8nHealth;
  if (
    cached?.baseUrl === root &&
    Date.now() - cached.checkedAt < 3000
  ) {
    return cached.up;
  }

  let up = false;
  try {
    const res = await fetch(`${root}/healthz`, {
      cache: "no-store",
      signal: AbortSignal.timeout(1200),
    });
    up = res.ok;
  } catch {
    up = false;
  }
  g.__omniN8nHealth = { baseUrl: root, checkedAt: Date.now(), up };
  if (!up) console.warn("[omni] n8n unavailable");
  return up;
}

function fromConfig(hook: N8nWebhook): N8nTool {
  return {
    server: "n8n-hook",
    name: hook.name,
    description: hook.description || `n8n workflow ${hook.name}`,
    path: hook.path,
    inputSchema: hook.schema ?? {
      type: "object",
      properties: { query: { type: "string" } },
    },
  };
}

async function discover(baseUrl: string, apiKey: string): Promise<N8nTool[]> {
  const root = baseUrl.replace(/\/$/, "");
  const res = await fetch(`${root}/api/v1/workflows?active=true`, {
    headers: { "X-N8N-API-KEY": apiKey },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    console.warn("[omni] n8n workflows", res.status);
    return [];
  }
  const data = (await res.json()) as {
    data?: Array<{
      id: string;
      name: string;
      active?: boolean;
      nodes?: Array<{
        type?: string;
        parameters?: { path?: string };
      }>;
    }>;
  };
  const tools: N8nTool[] = [];
  for (const wf of data.data ?? []) {
    if (wf.active === false) continue;
    const webhook = wf.nodes?.find((n) => /webhook/i.test(n.type ?? ""));
    const path = webhook?.parameters?.path;
    if (!path) continue;
    tools.push({
      server: "n8n-hook",
      name: slug(wf.name) || path,
      description: `n8n: ${wf.name}`,
      path,
      inputSchema: {
        type: "object",
        properties: { query: { type: "string" } },
      },
    });
  }
  console.log(`[omni] n8n ${tools.length} webhook workflows`);
  return tools;
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
}

function pretty(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed[0] && typeof parsed[0] === "object") {
      const row = parsed[0] as { json?: unknown };
      if (row.json !== undefined) return JSON.stringify(row.json, null, 2);
    }
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
}

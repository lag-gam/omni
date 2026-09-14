import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

function bunxBin(): string {
  const local = path.join(os.homedir(), ".bun", "bin", "bunx");
  if (existsSync(local)) return local;
  return "bunx";
}

function loadDotEnv() {
  const file = path.resolve(process.cwd(), ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotEnv();

const secretsDir = path.resolve(process.cwd(), "secrets");
mkdirSync(secretsDir, { recursive: true });

const creds = process.env.GOOGLE_CREDENTIALS_PATH
  ? path.resolve(process.env.GOOGLE_CREDENTIALS_PATH)
  : path.join(secretsDir, "google-oauth.json");
const token = process.env.GOOGLE_TOKEN_PATH
  ? path.resolve(process.env.GOOGLE_TOKEN_PATH)
  : path.join(secretsDir, "google-token.json");
const notion = process.env.NOTION_TOKEN?.trim() ?? "";

function line(ok: boolean, label: string, detail: string) {
  console.log(`${ok ? "ok " : "--"}  ${label}  ${detail}`);
}

function status() {
  const n8nEnabled = /^(1|true|yes|on)$/i.test(
    process.env.OMNI_N8N_ENABLED?.trim() ?? ""
  );
  const n8nUrl = process.env.N8N_BASE_URL?.trim() ?? "";
  const n8nKey = process.env.N8N_API_KEY?.trim() ?? "";
  const n8nMcp = process.env.N8N_MCP_URL?.trim() ?? "";

  console.log("\nOmni connectors\n");
  line(
    existsSync(creds),
    "Gmail + Calendar  (default MCP) Google OAuth JSON",
    existsSync(creds) ? creds : "required for Gmail and Calendar"
  );
  line(
    existsSync(token),
    "Gmail + Calendar  (default MCP) signed-in token",
    existsSync(token) ? token : "run npm run auth:google"
  );
  line(
    notion.startsWith("ntn_") || notion.startsWith("secret_"),
    "Notion            (legacy MCP) integration token",
    notion ? "NOTION_TOKEN is set" : "optional if n8n handles Notion"
  );
  line(true, "iMessage          local chat.db", "needs Full Disk Access on Terminal");
  line(
    Boolean(n8nEnabled && n8nUrl && n8nKey),
    "n8n              optional workflow override",
    !n8nEnabled
      ? "off; Omni will not contact it"
      : n8nUrl && n8nKey
      ? `${n8nUrl}${n8nMcp ? " + MCP" : ""}`
      : "enabled but missing N8N_BASE_URL or N8N_API_KEY"
  );
  console.log(`
Next steps:

1) Google MCP (default)
   • Set GOOGLE_CREDENTIALS_PATH and GOOGLE_TOKEN_PATH
   • Run: npm run auth:google

2) iMessage (this Mac only)
   • System Settings → Privacy & Security → Full Disk Access
   • Enable Terminal (and Electron if you use npm run desktop)
   • Quit and reopen Terminal, then:  npx -y imessage-mcp doctor

3) Restart Omni
   • npm run desktop
   • Try: "what's on my calendar tomorrow"
           "any unread mail from …"
           "what did I text …"

4) Optional n8n (later)
   • Configure and activate the workflows first
   • Only then set OMNI_N8N_ENABLED=true and restart Omni
`);
}

async function authGoogle() {
  if (!existsSync(creds)) {
    console.error(`Missing ${creds}\nDownload the Desktop OAuth client JSON first.`);
    process.exit(1);
  }
  await new Promise<void>((resolve, reject) => {
    const bunBin = path.join(os.homedir(), ".bun", "bin");
    const child = spawn(bunxBin(), ["--bun", "gmcp", "auth"], {
      stdio: "inherit",
      env: {
        ...process.env,
        PATH: `${bunBin}:${process.env.PATH ?? ""}`,
        GOOGLE_CREDENTIALS_PATH: creds,
        GOOGLE_TOKEN_PATH: token,
        GOOGLE_SCOPES: "gmail.readonly,gmail.send,calendar.events",
      },
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`gmcp auth exited ${code}`));
    });
  });
}

const mode = process.argv.includes("--auth-google") ? "auth" : "status";
if (mode === "auth") {
  authGoogle().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
} else {
  status();
}

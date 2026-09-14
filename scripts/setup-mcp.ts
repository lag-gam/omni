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
  console.log("\nOmni connectors\n");
  line(
    existsSync(creds),
    "Gmail + Calendar  Google OAuth client JSON",
    existsSync(creds) ? creds : `put downloaded client here: ${creds}`
  );
  line(
    existsSync(token),
    "Gmail + Calendar  signed-in token",
    existsSync(token) ? token : "run: npm run auth:google"
  );
  line(
    notion.startsWith("ntn_") || notion.startsWith("secret_"),
    "Notion            integration token",
    notion ? "NOTION_TOKEN is set" : "add NOTION_TOKEN=ntn_… to .env.local"
  );
  line(true, "iMessage          local chat.db", "needs Full Disk Access on Terminal");
  console.log(`
Next steps (do these in order):

1) Gmail + Google Calendar
   • https://console.cloud.google.com → new project (or pick one)
   • Enable "Gmail API" and "Google Calendar API"
   • APIs & Services → OAuth consent screen → External → your email as test user
   • APIs & Services → Credentials → Create credentials → OAuth client ID
     Application type: Desktop app
   • Download the JSON → save as:
     ${creds}
   • Then:  npm run auth:google
     Browser opens, sign in, allow Gmail + Calendar.

2) Notion
   • https://www.notion.so/my-integrations → New integration
   • Copy the Internal Integration Secret
   • Put it in .env.local as  NOTION_TOKEN=ntn_…
   • In Notion, open each page/database Omni should see → ⋯ → Connections → your integration

3) iMessage (this Mac only)
   • System Settings → Privacy & Security → Full Disk Access
   • Enable Terminal (and Electron if you use npm run desktop)
   • Quit and reopen Terminal, then:  npx -y imessage-mcp doctor

4) Restart Omni
   • Stop npm run dev, start it again so it picks up tokens
   • Try: "what's on my calendar tomorrow"
           "any unread mail from …"
           "search notion for …"
           "what did I text …"
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

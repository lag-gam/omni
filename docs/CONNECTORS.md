# Personal connectors

Gmail and Calendar use the local Google MCP by default. iMessage stays local
on this Mac, and notes stay in Omni. n8n is optional and is never contacted
unless it is explicitly enabled.

Run `npm run setup:mcp` anytime to see what's still missing.

## 1. Google MCP (default)

Set `GOOGLE_CREDENTIALS_PATH` and `GOOGLE_TOKEN_PATH` in `.env.local`, then
run:

```bash
npm run auth:google
```

Omni uses this MCP for Gmail and Calendar without requiring n8n.

## 2. n8n (optional override)

Omni does not start or contact n8n by default. When the integration is ready,
set `OMNI_N8N_ENABLED=true` in `.env.local` (or set `"enabled": true` in
`omni.config.json`) and restart Omni.

When enabled, matching n8n workflows take priority. Failed or unavailable
workflows fall back to Google MCP.

To configure it later:

1. Run n8n ([desktop](https://n8n.io/download) or `npx n8n`).
2. Create an API key under **Settings → n8n API**.
3. Set `N8N_BASE_URL` and `N8N_API_KEY` in `.env.local`.
4. Build and activate the webhook workflows from `omni.config.json`.
5. Enable the flag only after those workflows are ready.

## 3. iMessage

This reads your local Messages database. Nothing is uploaded.

1. **System Settings → Privacy & Security → Full Disk Access**
2. Enable **Terminal** (the app you use to run `npm run dev`).
   If you use the desktop overlay, enable **Electron** too.
3. Quit and reopen that app.
4. Check access:

```bash
npx -y imessage-mcp doctor
```

You want `chat.db` readable. If Messages in iCloud is on, open Messages.app
once so this Mac has a local copy of the history.

## 4. Restart Omni

```bash
npm run desktop
```

Then try:

- `what's on my calendar tomorrow`
- `any unread mail from last week`
- `search notion for the enclosure notes`
- `what did I text about dinner`

Servers with missing credentials are skipped so Omni still runs.

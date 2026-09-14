# Personal connectors

Omni talks to Gmail, Google Calendar, Notion, and iMessage through MCP
servers. You authorize them once; Omni does not store your mail or messages
itself.

Run `npm run setup:mcp` anytime to see what's still missing.

## 1. Gmail + Google Calendar (one Google login)

1. Open [Google Cloud Console](https://console.cloud.google.com).
2. Create a project (or pick one).
3. Enable **Gmail API** and **Google Calendar API**.
4. **APIs & Services → OAuth consent screen**
   - User type: External
   - Add yourself as a test user
5. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Desktop app**
6. Download the JSON and save it as `secrets/google-oauth.json`.
7. From the Omni folder:

```bash
npm run auth:google
```

Sign in and allow Gmail + Calendar. A token is written to
`secrets/google-token.json` (gitignored).

## 2. Notion

1. Open [Notion integrations](https://www.notion.so/my-integrations).
2. **New integration** → copy the Internal Integration Secret (`ntn_…`).
3. Add to `.env.local`:

```
NOTION_TOKEN=ntn_…
```

4. In Notion, open every page or database Omni should read.
   **⋯ → Connections →** select the integration.
   Tokens cannot see a page until you share it.

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
npm run dev
```

Then try:

- `what's on my calendar tomorrow`
- `any unread mail from last week`
- `search notion for the enclosure notes`
- `what did I text about dinner`

Servers with missing credentials are skipped so Omni still runs.

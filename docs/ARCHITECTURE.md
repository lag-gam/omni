# Architecture

## Principle

There is one input and one loop:

```
you type or dictate
        │
        ▼
  intent router  ──►  SAVE   ──►  store + embed  ──►  quiet confirmation
        │
        └────────►  RECALL  ──►  semantic search + synthesize  ──►  answer
```

The router is what makes this feel like Siri instead of a notes app: the
person never says which mode they're in. That means the router has to be
right almost all the time, so it's the piece worth the most iteration.

## Components

**`components/omni-bar.tsx`**
The entire UI surface for capture. One text field, one line of status text
below it. No separate "save" and "ask" buttons — submission (Enter, or
Wispr Flow's dictation-stop) is the only action. The response — a
confirmation, or a synthesized answer — replaces the status line in place.

**`lib/intent.ts`**
Given the raw input, classifies it as `SAVE`, `RECALL`, or `CHAT` (small talk
/ commands that are neither). Phase 5 in the roadmap. Starts as a single
Claude call with a few-shot prompt; the main failure mode to design against
is a statement that's phrased like a question ("gotta remember to call the
dentist tomorrow") — bias the prompt toward SAVE when ambiguous, since a
false RECALL (answering nothing) is more annoying than a false SAVE (storing
a stray line).

**`lib/memory.ts`**
Orchestrates both paths: on SAVE, writes the row and kicks off embedding; on
RECALL, runs retrieval and asks Claude to answer using only the retrieved
notes, saying plainly when nothing relevant is stored rather than guessing.

**`lib/embeddings.ts`**
Generates an embedding per note on save and does cosine-similarity search at
query time. Starts as a brute-force scan (fine up to a few thousand notes);
the roadmap's stretch phase swaps this for `sqlite-vec` if it gets slow.

**`lib/db.ts`**
SQLite via `better-sqlite3`. One table to start:

```sql
notes (
  id INTEGER PRIMARY KEY,
  content TEXT NOT NULL,
  embedding BLOB,
  created_at TEXT NOT NULL,
  tags TEXT           -- comma-separated, optional, LLM-suggested
)
```

**`app/api/capture/route.ts`**
The one endpoint the UI calls: takes raw text, runs it through
`lib/memory.ts`, returns either `{type: "saved"}` or `{type: "answer", text}`.

**`app/api/notes/route.ts`**
Read-only listing for the browse view (Phase 9) — not used by the capture
loop itself.

## Why local-first

This is a personal memory tool, not a product with users, so SQLite on disk
beats standing up Postgres. If it ever needs to sync across devices, the
clean seam is swapping `lib/db.ts` for a hosted Postgres + pgvector client —
nothing above that layer should need to change.

## Design constraints (carry through every phase)

- No color beyond black, white, and grayscale — no semantic color for
  success/error states either; say it in words, not in red or green.
- One typeface, one type scale. No icon unless it replaces a word more
  clearly than the word would.
- shadcn/ui primitives only (`Button`, `Input`, `Card`, etc.) — no ad hoc
  component libraries, no custom icon packs.
- The omni-bar never shows a mode switch. If a feature needs one, it's the
  wrong feature for this surface — put it in the browse view instead.

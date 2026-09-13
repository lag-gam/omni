# Architecture

## Principle

There is one input and one loop:

```
you type or dictate
        │
        ▼
  intent router (SAVE / QUESTION)
        │
        ├──► SAVE ─────────────────────────────► store + embed ─► quiet confirmation
        │
        └──► QUESTION ─► search your notes ─┬─► good match  ─► answer grounded
                                             │                   in your notes
                                             │                   (source: memory)
                                             └─► no good match ─► general-knowledge
                                                                  model completion
                                                                  (source: general)
```

The router only ever picks SAVE vs QUESTION — that's the one decision that
has to feel invisible, like Siri. What kind of answer a QUESTION gets
(your own notes vs. general knowledge) is decided one layer down, by
whether anything in memory is actually relevant. This is the Jarvis part:
you ask "what's the formula for X" mid-research the same way you'd ask
"what did I decide about the enclosure material" — same input, same lack
of ceremony, Omni sorts out where the answer comes from.

The router is the piece worth the most iteration, since it's what makes
this feel ambient instead of like operating a form.

## Components

**`components/omni-bar.tsx`**
The entire UI surface for capture. One text field, one line of status text
below it. No separate "save" and "ask" buttons — submission (Enter, or
Wispr Flow's dictation-stop) is the only action. The response — a
confirmation, or a synthesized answer — replaces the status line in place.

**`lib/intent.ts`**
Given the raw input, classifies it as `SAVE` or `QUESTION` — nothing more.
Phase 5 in the roadmap. Starts as a single model call with a few-shot
prompt; the main failure mode to design against is a statement that's
phrased like a question ("gotta remember to call the dentist tomorrow") —
bias the prompt toward SAVE when ambiguous, since an unanswerable QUESTION
is more annoying than a stray line saved that didn't need to be.

**`lib/memory.ts`**
Orchestrates every path. `SAVE` writes the row and kicks off embedding.
`QUESTION` runs retrieval first: if a stored note clears a similarity
threshold, it asks the model to answer using only the retrieved notes
(`source: "memory"`), saying plainly when nothing relevant is stored rather
than guessing. If nothing clears the threshold, it falls through to a
general-knowledge completion instead (`source: "general"`) — this is the
Phase 6b addition that lets Omni answer things like "what's the chemical
formula for X" without those ever being mistaken for something you told it.

**`lib/providers/`**
A small interface (`ModelProvider.complete(prompt)`) so each call site —
intent classification, memory-grounded recall, general-knowledge fallback —
can run on whichever model fits, chosen by an env var
(`MODEL_PROVIDER=anthropic|huggingface`), not hardcoded. `anthropic.ts` is
the default. `huggingface.ts` calls Hugging Face's hosted Inference API for
an open instruct model (Llama, Mistral, Qwen, etc.) — a reasonable choice
specifically for the general-knowledge fallback, since plain factual Q&A
doesn't need a frontier model and it keeps that path cheap. The two paths
don't have to use the same provider.

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

# Roadmap

Each phase is meant to be one real commit (or a couple, if it's easier to
split), in order. Build and commit them yourself as you go — that's what
gives the repo an honest history instead of one giant drop.

## Phase 0 — Scaffold (done in this drop)
Next.js + TypeScript + Tailwind + shadcn/ui installed, monochrome theme
tokens set, empty folder structure.
`chore: scaffold Omni — Next.js, Tailwind, shadcn, monochrome theme`

## Phase 1 — Static omni-bar
Build the input UI with no backend behind it yet: centered bar, focus ring,
placeholder copy, submit does nothing but clear the field. Get the type
scale and spacing right before anything is wired up.
`feat: static omni-bar shell`

## Phase 2 — Storage layer
`lib/db.ts` + the `notes` table. A tiny script (`scripts/seed.ts`) to insert
a few fake rows so you have something to query against later.
`feat: sqlite schema and db client`

## Phase 3 — Dumb capture (save-only)
Wire the omni-bar to `POST /api/capture`, which just inserts the raw text
and returns `{type: "saved"}`. No intent routing yet — everything is a save.
Confirmation renders as a one-line status under the bar, not a toast or
dialog.
`feat: basic capture endpoint, everything saves`

## Phase 4 — Embeddings
On save, generate and store an embedding. Add a brute-force
cosine-similarity search function in `lib/embeddings.ts` (unused by the UI
yet — exercise it from a script or test).
`feat: embed notes on save`

## Phase 5 — Intent router
`lib/intent.ts`: one model call classifies input as `SAVE` or `QUESTION` —
that's the whole job, nothing more. This is the phase to spend real time
on — write down 15–20 example inputs (statements, questions,
statement-shaped-like-questions) and check the classifier against all of
them before moving on.
`feat: intent classification layer`

## Phase 6 — Memory-grounded recall
On `QUESTION`, run the similarity search from Phase 4. If a note clears the
threshold, ask the model to answer using only the retrieved notes —
including saying plainly when nothing relevant is stored. At this point
every question either gets a memory-grounded answer or an honest "nothing
stored about that."
`feat: memory-grounded recall`

## Phase 7 — Model provider abstraction + general-knowledge fallback
Add `lib/providers/` (an interface plus `anthropic.ts` and
`huggingface.ts`, selected via `MODEL_PROVIDER`). Then: when Phase 6's
similarity search comes up empty, fall through to a plain completion
instead of returning nothing — this is the "ask about a chemical formula
mid-research" case. Tag the result with `source: "memory" | "general"` so
later UI work can (subtly, no color) show which one answered.
`feat: model provider abstraction + general-knowledge fallback`

## Phase 8 — Unified ambient flow
Collapse save and both answer sources into the one response area under the
omni-bar: a saved note gets a quiet acknowledgment, a question gets its
answer, in the same spot, same styling, regardless of where the answer
came from. No branching UI.
`feat: unified response flow`

## Phase 9 — Voice capture workflow
Document (and script, if your OS supports it) the actual hands-free path:
global hotkey → app window focused → Wispr Flow dictates into the omni-bar →
Enter. This is a workflow/README phase more than a code phase.
`feat: voice capture workflow via Wispr Flow`

## Phase 10 — Browse view
A second, separate route (`/notes`) listing everything stored, searchable,
still monochrome. This is where "mode switching" is allowed to live, since
it's not the capture surface.
`feat: notes browse view`

## Phase 11 — Polish
Empty states, keyboard-only usability, reduced-motion handling, README
screenshots, and a pass through `docs/ARCHITECTURE.md` to fix anything that
drifted from what you actually built.
`polish: interactions, accessibility, docs`

## Stretch (post-portfolio-ready)
- Swap brute-force search for `sqlite-vec` if the note count makes it slow.
- Tauri wrapper for a true system-wide overlay (Spotlight-style) instead of
  a browser tab.
- Tagging/clustering pass over stored notes for a "what have I been thinking
  about" view.

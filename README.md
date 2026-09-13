# Omni

A single input that remembers things and answers things — no modes, no buttons.

Type or dictate (built to pair with [Wispr Flow](https://wisprflow.ai)) into one bar.
Omni decides for itself whether what you said is new information worth keeping
or a question that needs an answer from what you've already told it, the same
way you'd talk to a person rather than operate a form.

- **One input.** No "save" vs "ask" toggle. Intent is inferred, not selected.
- **Local-first memory.** Notes live in SQLite on your machine; nothing leaves
  it except the model calls needed to classify intent and search.
- **Monochrome UI.** Black, white, and the grays between. One type family.
  [shadcn/ui](https://ui.shadcn.com) primitives only, no icon soup.

## Status

Early scaffold. See [docs/ROADMAP.md](docs/ROADMAP.md) for the build plan and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit together.

## Getting started

```bash
npm install
npm run dev
```

Requires an Anthropic API key in `.env.local` (`ANTHROPIC_API_KEY=...`) once
the intent/recall layer lands — the UI shell runs without one.

## Stack

Next.js (App Router) · TypeScript · Tailwind · shadcn/ui · SQLite (better-sqlite3) · Claude API for intent classification and recall synthesis

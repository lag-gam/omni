# Omni

A single input that remembers things and answers things — no modes, no buttons.

Type or dictate (built to pair with [Wispr Flow](https://wisprflow.ai)) into one bar.
Omni decides for itself whether what you said is new information worth keeping
or a question that needs an answer from what you've already told it, the same
way you'd talk to a person rather than operate a form.

- **One input.** No "save" vs "ask" toggle. Intent is inferred, not selected.
- **Noise filtering.** Throwaway input ("yo", "ok", "lol") is caught instantly
  by a local pre-filter — no API call, no wasted save.
- **Local-first memory.** Notes live in SQLite on your machine; nothing leaves
  it except the model calls needed to classify intent and search.
- **Answers, not just recall.** Ask something with nothing stored about it —
  "what's the formula for X" — and Omni falls back to general knowledge
  instead of coming up empty. Model choice per call is swappable between
  Claude and an open Hugging Face model.
- **Voice-native.** Designed for the Wispr Flow dictation workflow —
  `fn+Opt` to focus, `fn`-hold to dictate, release to submit.
  See [docs/VOICE.md](docs/VOICE.md).
- **Monochrome UI.** Black, white, and the grays between. One type family.
  [shadcn/ui](https://ui.shadcn.com) primitives only, no icon soup.

## Getting started

```bash
npm install
npm run dev
```

Create `.env.local` with your Anthropic key:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Optional — for the HuggingFace general-knowledge provider:

```
HF_API_TOKEN=hf_...
GK_PROVIDER=huggingface
```

Seed some sample notes for development:

```bash
npm run seed
```

## Keyboard shortcuts

| Key | Action |
|-----|--------|
| Enter | Submit input |
| Escape | Clear input and response |

## Docs

- [Architecture](docs/ARCHITECTURE.md) — how the pieces fit together
- [Roadmap](docs/ROADMAP.md) — the build plan
- [Voice workflow](docs/VOICE.md) — hands-free setup with Wispr Flow

## Stack

Next.js (App Router) · TypeScript · Tailwind · shadcn/ui · SQLite
(better-sqlite3) · Claude API for intent classification and recall ·
swappable Hugging Face provider for general-knowledge answers

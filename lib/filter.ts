export type FilterResult =
  | { pass: true }
  | { pass: false; reason: string };

const NOISE_PHRASES = new Set([
  "yo",
  "hey",
  "hi",
  "hello",
  "sup",
  "hola",
  "heya",
  "heyy",
  "hii",
  "howdy",
  "what's up",
  "whats up",
  "wassup",
  "wazzup",
  "ok",
  "okay",
  "k",
  "kk",
  "sure",
  "yep",
  "yup",
  "yeah",
  "yea",
  "ya",
  "nah",
  "nope",
  "no",
  "yes",
  "mhm",
  "hmm",
  "hm",
  "uh",
  "um",
  "umm",
  "ah",
  "oh",
  "ooh",
  "wow",
  "lol",
  "lmao",
  "haha",
  "hahaha",
  "ha",
  "heh",
  "bruh",
  "bro",
  "dude",
  "nice",
  "cool",
  "damn",
  "dang",
  "ugh",
  "meh",
  "idk",
  "idc",
  "nvm",
  "nevermind",
  "never mind",
  "whatever",
  "anyway",
  "anyways",
  "thanks",
  "thank you",
  "thx",
  "ty",
  "please",
  "pls",
  "sorry",
  "my bad",
  "oops",
  "test",
  "testing",
  "testing testing",
  "hello world",
  "asdf",
  "asd",
]);

const NOISE_PREFIXES = ["hey ", "hi ", "hello ", "yo "];

const EMOJI_RE = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;
const REPEATED_CHAR_RE = /^(.)\1{2,}$/;

function normalize(text: string): string {
  return text.toLowerCase().trim().replace(/[.!?,;:]+$/, "");
}

function isAllPunctuation(text: string): boolean {
  return /^[\s\p{P}\p{S}]+$/u.test(text);
}

function isAllEmoji(text: string): boolean {
  const stripped = text.replace(EMOJI_RE, "").replace(/\s/g, "");
  return stripped.length === 0;
}

function wordCount(text: string): number {
  const stripped = text
    .replace(EMOJI_RE, "")
    .replace(/[^\w\s'-]/g, "")
    .trim();
  if (stripped.length === 0) return 0;
  return stripped.split(/\s+/).filter((w) => w.length > 0).length;
}

/**
 * Fast local pre-filter. Catches obvious noise without any API call.
 * Substantive input passes through to the capture pipeline untouched.
 */
export function filterInput(raw: string): FilterResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { pass: false, reason: "Nothing to save." };
  }

  const norm = normalize(trimmed);

  if (NOISE_PHRASES.has(norm)) {
    return { pass: false, reason: "Nothing to save." };
  }

  for (const prefix of NOISE_PREFIXES) {
    if (norm.startsWith(prefix)) {
      const rest = norm.slice(prefix.length).trim();
      if (rest.length === 0 || NOISE_PHRASES.has(rest)) {
        return { pass: false, reason: "Nothing to save." };
      }
    }
  }

  if (isAllPunctuation(trimmed)) {
    return { pass: false, reason: "Nothing to save." };
  }

  if (isAllEmoji(trimmed)) {
    return { pass: false, reason: "Nothing to save." };
  }

  if (REPEATED_CHAR_RE.test(norm)) {
    return { pass: false, reason: "Nothing to save." };
  }

  if (wordCount(trimmed) < 2) {
    return { pass: false, reason: "Too brief to be useful." };
  }

  return { pass: true };
}

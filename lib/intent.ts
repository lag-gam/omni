import type { Intent } from "./types";
import { getProvider } from "./providers/types";

const CLASSIFY_PROMPT = `You are an intent classifier for a personal memory assistant. Given the user's input, respond with exactly one word: SAVE, QUESTION, or DISCARD.

Rules:
- SAVE: the user is stating a fact to remember — a decision, note, reminder, idea, list, observation. Not a request to do something.
- QUESTION: the user wants an answer OR wants you to act — search mail, send or draft an email, reply, schedule, look something up.
- DISCARD: the input is meaningless noise, a greeting with no substance, or gibberish.

When it could be a command, prefer QUESTION. Only SAVE a bare statement of fact.

Examples:
"Gotta remember to call the dentist tomorrow" → SAVE
"Can you remember that I take magnesium at night" → SAVE
"Write me an email to myself saying I'm cool" → QUESTION
"Send Andy the deck" → QUESTION
"Is the dentist tomorrow" → QUESTION
"What did I decide about the enclosure material?" → QUESTION
"just checking" → DISCARD

Input: "{INPUT}"

Respond with one word:`;

const QUESTION_LEADS =
  /^(what|what's|whats|when|when's|whens|where|where's|wheres|who|who's|whos|why|why's|how|how's|which|whose)\b/i;

const ASK_LEADS =
  /^(tell me|explain|what about|how come|remind me (what|when|where|who|why|how|which))\b/i;

const FOLLOW_UP_LEADS =
  /^(and|also|then|so|but|ok,?|okay,?)\s+(what|what's|whats|when|where's|who|why|how|which|did|do|does|is|are|can|could)\b/i;

const FOLLOW_UP_PRONOUN =
  /\b(him|her|them|that|this|those|these|he|she|they|it)\b/i;

const FOLLOW_UP_TOPIC =
  /^(the|that|this|those)\b.+\b(email|mail|message|event|meeting|note|one|request)\b/i;

const ACTION_LEADS =
  /^(write|send|email|draft|compose|reply|forward|schedule|book|cancel|invite|text|message|mail)\b/i;

/** Auxiliaries that might be a question ("is the dentist tomorrow") or a
 *  request to save ("can you remember that I take magnesium"). */
const AMBIGUOUS_LEADS =
  /^(is|are|am|do|does|did|can|could|should|would|will|won't|wasn't|isn't|aren't|have|has|had|was|were)\b/i;

/**
 * Instant local classify for the obvious cases so we skip a model round-trip.
 * Returns null when the phrasing is ambiguous and the model should decide.
 */
export function classifyLocal(
  text: string,
  inConversation = false
): Intent | null {
  const t = text.trim();
  if (/\?\s*$/.test(t)) return "QUESTION";
  if (
    QUESTION_LEADS.test(t) ||
    ASK_LEADS.test(t) ||
    FOLLOW_UP_LEADS.test(t) ||
    ACTION_LEADS.test(t)
  ) {
    return "QUESTION";
  }
  if (inConversation && FOLLOW_UP_TOPIC.test(t)) return "QUESTION";
  if (inConversation && FOLLOW_UP_PRONOUN.test(t) && t.split(/\s+/).length <= 16) {
    return "QUESTION";
  }
  if (/^remind me\b/i.test(t)) return "QUESTION";
  if (/^(check my|look at my|show me my|search my)\b/i.test(t)) {
    return "QUESTION";
  }
  if (AMBIGUOUS_LEADS.test(t)) return null;
  return "SAVE";
}

export async function classifyIntent(
  text: string,
  inConversation = false
): Promise<Intent> {
  const local = classifyLocal(text, inConversation);
  if (local) return local;

  const provider = getProvider("anthropic");
  const prompt = CLASSIFY_PROMPT.replace("{INPUT}", text.replace(/"/g, '\\"'));
  const raw = await provider.complete(prompt, { maxTokens: 8 });
  const token = raw.trim().toUpperCase();

  if (token === "QUESTION") return "QUESTION";
  if (token === "DISCARD") return "DISCARD";
  return "SAVE";
}

const WAKE =
  /(?:hey|ok|okay|hi)?\s*jarvis\b[,!.]?\s*/i;

export function wokeJarvis(transcript: string): boolean {
  return /\bjarvis\b/i.test(transcript);
}

export function takeCommand(
  transcript: string,
  armed: boolean,
  armedUntil = 0
): { command?: string; armed: boolean; woke: boolean; armedUntil: number } {
  const text = transcript.replace(/\s+/g, " ").trim();
  if (!text) return { armed, woke: false, armedUntil };

  const match = text.match(WAKE);
  if (match && match.index !== undefined) {
    const rest = text.slice(match.index + match[0].length).trim();
    if (rest.length >= 2) {
      return { command: rest, armed: false, woke: true, armedUntil: 0 };
    }
    return { armed: true, woke: true, armedUntil: Date.now() + 8000 };
  }

  if (armed && armedUntil > Date.now() && text.length >= 2) {
    return { command: text, armed: false, woke: false, armedUntil: 0 };
  }

  return { armed: false, woke: false, armedUntil: 0 };
}

/** After wake, strip leftover "jarvis" and keep the request. Empty means hang up. */
export function commandAfterWake(transcript: string): string | undefined {
  let text = transcript.replace(/\s+/g, " ").trim();
  text = text.replace(/^[.\s,;:!?-]+/, "").trim();
  text = text.replace(/\bJ-+\s*$/i, "").trim();
  while (true) {
    const match = text.match(WAKE);
    if (!match || match.index === undefined) break;
    text = `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`
      .replace(/\s+/g, " ")
      .trim();
  }
  return text.length >= 2 ? text : undefined;
}

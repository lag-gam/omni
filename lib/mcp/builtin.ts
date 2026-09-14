import { db } from "../db";
import { embed, embedAndStore, topMatches } from "../embeddings";

export async function searchNotes(query: string): Promise<string> {
  const vec = await embed(query);
  const hits = topMatches(vec, 6).filter((h) => h.score >= 0.25);
  if (hits.length === 0) return "No matching Omni notes.";
  return hits.map((h, i) => `${i + 1}. ${h.content}`).join("\n");
}

export async function saveNote(text: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return "Nothing to save.";
  const info = db
    .prepare("INSERT INTO notes (content, created_at) VALUES (?, datetime('now'))")
    .run(trimmed);
  await embedAndStore(Number(info.lastInsertRowid), trimmed);
  return "Saved.";
}

import type { Note } from "./types";
import { db } from "./db";

const VECTOR_DIM = 256;

/**
 * Generate a dense embedding for a string. Uses a local word/character
 * n-gram hash approach — instant, no network, good enough for lexical
 * similarity over a personal note corpus. Can be swapped for an API-based
 * embedding model later (signature is already async for that reason).
 */
export async function embed(text: string): Promise<number[]> {
  return localEmbed(text);
}

function localEmbed(text: string): number[] {
  const vec = new Float64Array(VECTOR_DIM);
  const norm = text.toLowerCase().replace(/[^\w\s'-]/g, "");
  const words = norm.split(/\s+/).filter(Boolean);

  for (const w of words) {
    vec[hash(w) % VECTOR_DIM] += 1;
  }
  for (let i = 0; i < words.length - 1; i++) {
    vec[hash(words[i] + " " + words[i + 1]) % VECTOR_DIM] += 1;
  }
  for (const w of words) {
    for (let j = 0; j <= w.length - 3; j++) {
      vec[hash(w.slice(j, j + 3)) % VECTOR_DIM] += 0.5;
    }
  }

  return l2Normalize(Array.from(vec));
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function l2Normalize(vec: number[]): number[] {
  const mag = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  if (mag === 0) return vec;
  return vec.map((v) => v / mag);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/** Brute-force top-k search over all notes with embeddings. */
export function topMatches(
  queryVec: number[],
  k = 5
): (Note & { score: number })[] {
  const rows = db
    .prepare("SELECT id, content, embedding, created_at, tags FROM notes WHERE embedding IS NOT NULL")
    .all() as { id: number; content: string; embedding: Buffer; created_at: string; tags: string | null }[];

  return rows
    .map((r) => {
      const emb: number[] = JSON.parse(r.embedding.toString());
      return {
        id: r.id,
        content: r.content,
        embedding: emb,
        createdAt: r.created_at,
        tags: r.tags ? r.tags.split(",").map((t) => t.trim()) : [],
        score: cosineSimilarity(queryVec, emb),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/** Embed text and store the vector on an existing note row. */
export async function embedAndStore(noteId: number, text: string): Promise<void> {
  const vec = await embed(text);
  db.prepare("UPDATE notes SET embedding = ? WHERE id = ?").run(
    Buffer.from(JSON.stringify(vec)),
    noteId
  );
}

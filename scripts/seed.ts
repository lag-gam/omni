import { db } from "../lib/db";
import { embedAndStore } from "../lib/embeddings";

const seeds = [
  "The melting point of gallium is 29.76 °C — it melts in your hand.",
  "Meeting with Priya moved to Thursday 3 PM.",
  "Enclosure material decision: go with 6061 aluminum, not acrylic. Acrylic cracks under repeated thermal cycling.",
  "Grocery list: oat milk, tahini, lemons, black garlic.",
  "The half-life of caffeine in the human body is roughly 5 hours.",
  "Idea: a CLI that watches a directory and auto-tags files by content using a local embedding model.",
  "Dentist appointment next Tuesday at 10 AM.",
  "Useful SQL trick: window functions with PARTITION BY for running totals without a self-join.",
];

const insert = db.prepare(
  "INSERT INTO notes (content, created_at) VALUES (?, datetime('now', ?))"
);

const insertAll = db.transaction(() => {
  for (let i = 0; i < seeds.length; i++) {
    insert.run(seeds[i], `-${seeds.length - 1 - i} minutes`);
  }
});

insertAll();

async function embedAll() {
  const rows = db
    .prepare("SELECT id, content FROM notes WHERE embedding IS NULL")
    .all() as { id: number; content: string }[];
  for (const row of rows) {
    await embedAndStore(row.id, row.content);
  }
  console.log(`Embedded ${rows.length} notes.`);
}

const count = db.prepare("SELECT COUNT(*) as n FROM notes").get() as {
  n: number;
};
console.log(`Seeded ${count.n} notes.`);
embedAll();

import Database from "better-sqlite3";
import path from "node:path";

const DB_PATH = path.resolve(process.cwd(), "omni.db");

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id         INTEGER PRIMARY KEY,
    content    TEXT NOT NULL,
    embedding  BLOB,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    tags       TEXT
  )
`);

export { db };

import Database from "better-sqlite3";
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const LEGACY_DB_PATH = path.resolve(process.cwd(), "omni.db");
const DB_PATH = process.env.OMNI_DB_PATH
  ? path.resolve(process.env.OMNI_DB_PATH)
  : path.join(os.homedir(), ".omni", "omni.db");

mkdirSync(path.dirname(DB_PATH), { recursive: true });
migrateLegacyDatabase();

const db = new Database(DB_PATH);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id         INTEGER PRIMARY KEY,
    content    TEXT NOT NULL,
    embedding  BLOB,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    tags       TEXT
  );

  CREATE TABLE IF NOT EXISTS conversation (
    id         INTEGER PRIMARY KEY,
    role       TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS conversation_session (
    id   INTEGER PRIMARY KEY CHECK (id = 1),
    json TEXT NOT NULL
  );
`);

function migrateLegacyDatabase() {
  if (
    DB_PATH === LEGACY_DB_PATH ||
    existsSync(DB_PATH) ||
    !existsSync(LEGACY_DB_PATH)
  ) {
    return;
  }

  const legacy = new Database(LEGACY_DB_PATH);
  try {
    const destination = DB_PATH.replace(/'/g, "''");
    legacy.exec(`VACUUM INTO '${destination}'`);
    console.log(`[omni] migrated database to ${DB_PATH}`);
  } catch (err) {
    rmSync(DB_PATH, { force: true });
    copyFileSync(LEGACY_DB_PATH, DB_PATH);
    console.warn(
      "[omni] database snapshot failed; copied legacy database:",
      err instanceof Error ? err.message : err
    );
  } finally {
    legacy.close();
  }
}

export { db };

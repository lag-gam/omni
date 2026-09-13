// Phase 2: SQLite schema + client.
//
// Planned shape (see docs/ARCHITECTURE.md):
//
//   CREATE TABLE notes (
//     id INTEGER PRIMARY KEY,
//     content TEXT NOT NULL,
//     embedding BLOB,
//     created_at TEXT NOT NULL,
//     tags TEXT
//   );
//
// import Database from "better-sqlite3";
// export const db = new Database("omni.db");
// db.exec(`CREATE TABLE IF NOT EXISTS notes (...)`);

export {};

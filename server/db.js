import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "radios.db");
export const db = new Database(dbPath);

export function initDb() {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS people (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rut TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS radios_expected (
      code TEXT PRIMARY KEY,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      radio_code TEXT NOT NULL,
      person_rut TEXT NOT NULL,
      assigned_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (radio_code) REFERENCES radios_expected(code) ON DELETE CASCADE,
      FOREIGN KEY (person_rut) REFERENCES people(rut) ON DELETE CASCADE,
      UNIQUE(radio_code)
    );
  `);
}
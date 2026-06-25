import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dataDir = path.join(__dirname, "../../data");
const databasePath = process.env.DATABASE_PATH || path.join(dataDir, "roster-calculator.sqlite");

fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export function transaction(fn) {
  return db.transaction(fn);
}

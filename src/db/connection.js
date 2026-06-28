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
db.exec(`
  CREATE TABLE IF NOT EXISTS excluded_flights (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_fingerprint TEXT NOT NULL UNIQUE,
    operational_key TEXT UNIQUE,
    deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

migrateFlightIdentity();

function migrateFlightIdentity() {
  const flightsTable = db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'flights'"
  ).get();
  if (!flightsTable) return;

  const columns = db.prepare("PRAGMA table_info(flights)").all();
  if (!columns.some((column) => column.name === "operational_key")) {
    db.exec("ALTER TABLE flights ADD COLUMN operational_key TEXT");
  }

  db.transaction(() => {
    db.exec(`
      UPDATE flights
      SET operational_key =
        trim(flight_date) || '|' ||
        upper(trim(COALESCE(aircraft_registration, ''))) || '|' ||
        upper(trim(COALESCE(departure_airport, ''))) || '|' ||
        trim(COALESCE(departure_time, '')) || '|' ||
        upper(trim(COALESCE(arrival_airport, ''))) || '|' ||
        trim(COALESCE(arrival_time, ''))
      WHERE operational_key IS NULL
        AND (
          trim(COALESCE(departure_time, '')) <> ''
          OR trim(COALESCE(arrival_time, '')) <> ''
        );

      DELETE FROM flights AS duplicate
      WHERE duplicate.operational_key IS NOT NULL
        AND duplicate.id <> (
          SELECT candidate.id
          FROM flights AS candidate
          WHERE candidate.operational_key = duplicate.operational_key
          ORDER BY
            CASE candidate.source_format
              WHEN 'safelog_csv' THEN 0
              WHEN 'airline_export_csv' THEN 1
              ELSE 2
            END,
            candidate.id
          LIMIT 1
        );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_flights_operational_key
      ON flights (operational_key)
      WHERE operational_key IS NOT NULL;
    `);
  })();
}

export function transaction(fn) {
  return db.transaction(fn);
}

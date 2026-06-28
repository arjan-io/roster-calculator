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
  );

  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

migrateFlightIdentity();

function migrateFlightIdentity() {
  if (!tableExists("flights")) return;

  const columns = db.prepare("PRAGMA table_info(flights)").all();
  if (!columns.some((column) => column.name === "operational_key")) {
    db.exec("ALTER TABLE flights ADD COLUMN operational_key TEXT");
  }

  const version = db.prepare(
    "SELECT value FROM app_meta WHERE key = 'flight_identity_version'"
  ).get()?.value;
  if (version === "3") return;

  const beforeCount = db.prepare("SELECT COUNT(*) AS count FROM flights").get().count;
  db.transaction(() => {
    db.exec("DROP INDEX IF EXISTS idx_flights_operational_key");

    if (tableExists("airports") && tableExists("airport_aliases")) {
      db.exec(`
        UPDATE flights
        SET departure_airport = COALESCE((
          SELECT COALESCE(airports.iata, airports.code)
          FROM airports
          LEFT JOIN airport_aliases ON airport_aliases.airport_id = airports.id
          WHERE airports.code = flights.departure_airport
             OR airports.iata = flights.departure_airport
             OR airports.icao = flights.departure_airport
             OR airport_aliases.alias = flights.departure_airport
          LIMIT 1
        ), departure_airport);

        UPDATE flights
        SET arrival_airport = COALESCE((
          SELECT COALESCE(airports.iata, airports.code)
          FROM airports
          LEFT JOIN airport_aliases ON airport_aliases.airport_id = airports.id
          WHERE airports.code = flights.arrival_airport
             OR airports.iata = flights.arrival_airport
             OR airports.icao = flights.arrival_airport
             OR airport_aliases.alias = flights.arrival_airport
          LIMIT 1
        ), arrival_airport);
      `);
    }

    db.exec(`
      UPDATE flights
      SET operational_key = CASE
        WHEN trim(COALESCE(departure_time, '')) <> ''
          OR trim(COALESCE(arrival_time, '')) <> ''
        THEN
          trim(flight_date) || '|' ||
          upper(trim(COALESCE(aircraft_registration, ''))) || '|' ||
          upper(trim(COALESCE(departure_airport, ''))) || '|' ||
          trim(COALESCE(departure_time, '')) || '|' ||
          upper(trim(COALESCE(arrival_airport, ''))) || '|' ||
          trim(COALESCE(arrival_time, ''))
        ELSE NULL
      END;

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

      CREATE UNIQUE INDEX idx_flights_operational_key
      ON flights (operational_key)
      WHERE operational_key IS NOT NULL;

      INSERT INTO app_meta (key, value)
      VALUES ('flight_identity_version', '3')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    `);
  })();

  const afterCount = db.prepare("SELECT COUNT(*) AS count FROM flights").get().count;
  const unresolvedCount = db.prepare(`
    SELECT COUNT(*) AS count
    FROM flights
    WHERE length(trim(COALESCE(departure_airport, ''))) <> 3
       OR length(trim(COALESCE(arrival_airport, ''))) <> 3
  `).get().count;
  console.log(
    `Flight identity migration complete: ${beforeCount - afterCount} duplicates consolidated; ${unresolvedCount} non-IATA flights remain.`
  );
}

function tableExists(name) {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)
  );
}

export function transaction(fn) {
  return db.transaction(fn);
}

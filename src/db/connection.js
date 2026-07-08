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

  CREATE TABLE IF NOT EXISTS base_stations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    iata TEXT NOT NULL CHECK (length(iata) = 3),
    start_date TEXT NOT NULL,
    end_date TEXT,
    UNIQUE (iata, start_date)
  );
`);

migrateFlightIdentity();
migratePaymentData();
migrateTaxRates();
migrateStatisticsData();

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

function migratePaymentData() {
  if (!tableExists("deductions")) return;
  const version = db.prepare(
    "SELECT value FROM app_meta WHERE key = 'payment_data_version'"
  ).get()?.value;
  if (version === "3") return;

  const dutyColumns = db.prepare("PRAGMA table_info(duty_types)").all();
  if (!dutyColumns.some((column) => column.name === "tax_treatment")) {
    db.exec("ALTER TABLE duty_types ADD COLUMN tax_treatment TEXT NOT NULL DEFAULT 'normal'");
  }
  if (!dutyColumns.some((column) => column.name === "payment_component_code")) {
    db.exec("ALTER TABLE duty_types ADD COLUMN payment_component_code TEXT");
  }
  if (!dutyColumns.some((column) => column.name === "payment_multiplier")) {
    db.exec("ALTER TABLE duty_types ADD COLUMN payment_multiplier REAL NOT NULL DEFAULT 1");
  }

  const componentColumns = db.prepare("PRAGMA table_info(payment_components)").all();
  if (!componentColumns.some((column) => column.name === "payment_treatment")) {
    db.exec("ALTER TABLE payment_components ADD COLUMN payment_treatment TEXT NOT NULL DEFAULT 'normal'");
  }

  const oneOffColumns = db.prepare("PRAGMA table_info(one_off_payments)").all();
  if (!oneOffColumns.some((column) => column.name === "tax_treatment")) {
    db.exec("ALTER TABLE one_off_payments ADD COLUMN tax_treatment TEXT NOT NULL DEFAULT 'special'");
  }

  const columns = db.prepare("PRAGMA table_info(deductions)").all();
  if (!columns.some((column) => column.name === "start_month")) {
    db.exec("ALTER TABLE deductions ADD COLUMN start_month TEXT");
  }
  if (!columns.some((column) => column.name === "end_month")) {
    db.exec("ALTER TABLE deductions ADD COLUMN end_month TEXT");
  }
  if (!columns.some((column) => column.name === "payment_stage")) {
    db.exec("ALTER TABLE deductions ADD COLUMN payment_stage TEXT NOT NULL DEFAULT 'net'");
  }
  if (!columns.some((column) => column.name === "calculation_type")) {
    db.exec("ALTER TABLE deductions ADD COLUMN calculation_type TEXT NOT NULL DEFAULT 'fixed'");
  }

  db.transaction(() => {
    db.exec(`
      UPDATE payment_components
      SET payment_treatment = CASE code
        WHEN 'loyalty' THEN 'special'
        WHEN 'travel' THEN 'net_reimbursement'
        WHEN 'pension' THEN 'gross_deduction'
        ELSE 'normal'
      END;

      UPDATE one_off_payments
      SET tax_treatment = 'special'
      WHERE tax_treatment IS NULL OR tax_treatment NOT IN ('normal', 'special', 'net');

      UPDATE deductions
      SET start_month = substr(effective_date, 1, 7)
      WHERE start_month IS NULL OR start_month = '';

      UPDATE deductions
      SET payment_stage = 'net'
      WHERE payment_stage IS NULL OR payment_stage NOT IN ('gross', 'net');

      UPDATE deductions
      SET payment_stage = 'gross'
      WHERE lower(description) = 'pension';
    `);

    const rows = db.prepare(`
      SELECT id, description, start_month AS startMonth
      FROM deductions
      ORDER BY lower(description), start_month, id
    `).all();
    const updateEnd = db.prepare("UPDATE deductions SET end_month = ? WHERE id = ?");

    for (let index = 0; index < rows.length; index += 1) {
      const current = rows[index];
      const next = rows[index + 1];
      const endMonth = next && next.description.toLowerCase() === current.description.toLowerCase()
        ? previousMonth(next.startMonth)
        : null;
      updateEnd.run(endMonth, current.id);
    }

    db.exec(`
      DELETE FROM deductions WHERE amount = 0;
      INSERT INTO app_meta (key, value)
      VALUES ('payment_data_version', '3')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value;
    `);
  })();
}

function migrateTaxRates() {
  if (!tableExists("payment_periods")) return;
  const version = db.prepare(
    "SELECT value FROM app_meta WHERE key = 'tax_rate_version'"
  ).get()?.value;
  if (version === "1") return;

  const columns = db.prepare("PRAGMA table_info(payment_periods)").all();
  if (!columns.some((column) => column.name === "normal_tax_rate")) {
    db.exec("ALTER TABLE payment_periods ADD COLUMN normal_tax_rate REAL NOT NULL DEFAULT 43.31");
  }
  if (!columns.some((column) => column.name === "special_tax_rate")) {
    db.exec("ALTER TABLE payment_periods ADD COLUMN special_tax_rate REAL NOT NULL DEFAULT 49.5");
  }

  db.prepare(`
    INSERT INTO app_meta (key, value)
    VALUES ('tax_rate_version', '1')
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run();
}

function migrateStatisticsData() {
  const version = db.prepare(
    "SELECT value FROM app_meta WHERE key = 'statistics_data_version'"
  ).get()?.value;
  if (version === "1") return;

  db.transaction(() => {
    const insert = db.prepare(`
      INSERT OR IGNORE INTO base_stations (iata, start_date, end_date) VALUES (?, ?, ?)
    `);
    insert.run("LGW", "2011-06-01", "2014-03-06");
    insert.run("MXP", "2014-03-07", "2016-12-15");
    insert.run("LGW", "2016-12-16", "2018-04-05");
    insert.run("AMS", "2018-04-06", null);
    db.prepare(`
      INSERT INTO app_meta (key, value) VALUES ('statistics_data_version', '1')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run();
  })();
}

function previousMonth(value) {
  const [year, month] = String(value).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function tableExists(name) {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)
  );
}

export function transaction(fn) {
  return db.transaction(fn);
}

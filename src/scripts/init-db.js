import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, transaction } from "../db/connection.js";
import { recalculateFlightDistances } from "../services/airport.service.js";
import { AIRPORT_ALIASES } from "../config/airportAliases.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.join(__dirname, "../db/schema.sql");
const schema = fs.readFileSync(schemaPath, "utf8");

transaction(() => {
  migrateExistingTables();
  db.exec(schema);
  migrateExistingData();
})();

recalculateFlightDistances();
console.log("Database initialized, migrated, and sector distances recalculated.");

function migrateExistingTables() {
  if (tableExists("airports")) {
    addColumn("airports", "iata", "TEXT");
    addColumn("airports", "icao", "TEXT");
    addColumn("airports", "coordinate_text", "TEXT");
  }

  if (tableExists("flights")) {
    addColumn("flights", "distance_nm", "REAL");
  }

  if (tableExists("misc_duties")) {
    addColumn("misc_duties", "paid", "INTEGER NOT NULL DEFAULT 0");
  }
}

function migrateExistingData() {
  db.exec(`
    UPDATE airports
    SET iata = code
    WHERE iata IS NULL AND length(code) = 3;

    UPDATE airports
    SET icao = (
      SELECT alias
      FROM airport_aliases
      WHERE airport_aliases.airport_id = airports.id
        AND length(alias) = 4
      ORDER BY airport_aliases.id
      LIMIT 1
    )
    WHERE icao IS NULL;

    INSERT OR IGNORE INTO payment_periods (effective_date, basic_salary)
    SELECT effective_date, basic_salary
    FROM salary_scales;
  `);

  migrateSalaryComponents();
  migrateAirportCodes();
  db.exec(`
    UPDATE misc_duties
    SET paid = 1
    WHERE lower(COALESCE(notes, '')) LIKE '%paid: ja%'
       OR lower(COALESCE(notes, '')) LIKE '%paid: yes%';

    DROP TABLE IF EXISTS claims;
  `);
}

function migrateSalaryComponents() {
  if (!tableExists("salary_scales")) {
    return;
  }

  const scales = db.prepare("SELECT * FROM salary_scales ORDER BY effective_date").all();
  const period = db.prepare("SELECT id, basic_salary FROM payment_periods WHERE effective_date = ?");
  const insert = db.prepare(`
    INSERT OR IGNORE INTO payment_components (
      payment_period_id, code, name, calculation_type, ratio, amount
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  const fields = [
    ["sector", "Sector", "sector_rate"],
    ["ulv", "ULV", "ulv_rate"],
    ["palv", "PALV", "palv_rate"],
    ["ddo", "DDO", "ddo_rate"],
    ["snc", "SNC", "snc_rate"],
    ["loyalty", "Loyalty", "loyalty_amount"],
    ["travel", "Travel costs", "travel_amount"],
    ["wfly", "WFLY", "wfly_amount"],
    ["pension", "Pension", "pension_amount"]
  ];

  for (const scale of scales) {
    const paymentPeriod = period.get(scale.effective_date);
    for (const [code, name, field] of fields) {
      const value = Number(scale[field] || 0);
      const ratio = paymentPeriod.basic_salary ? value / paymentPeriod.basic_salary : null;
      const isRatio = componentUsesRatio(code, ratio);
      insert.run(
        paymentPeriod.id,
        code,
        name,
        isRatio ? "ratio" : "fixed",
        isRatio ? ratio : null,
        isRatio ? null : value
      );
    }
  }
}

function migrateAirportCodes() {
  const findAirport = db.prepare("SELECT id FROM airports WHERE code = ? OR iata = ?");
  const renameAirport = db.prepare("UPDATE airports SET code = ?, iata = ? WHERE id = ?");
  const updateDeparture = db.prepare("UPDATE flights SET departure_airport = ? WHERE departure_airport = ?");
  const updateArrival = db.prepare("UPDATE flights SET arrival_airport = ? WHERE arrival_airport = ?");

  for (const [alias, canonical] of Object.entries(AIRPORT_ALIASES)) {
    if (/^[A-Z]{3}$/.test(alias) && alias !== canonical) {
      const oldAirport = findAirport.get(alias, alias);
      const canonicalAirport = findAirport.get(canonical, canonical);
      if (oldAirport && !canonicalAirport) renameAirport.run(canonical, canonical, oldAirport.id);
    }
    updateDeparture.run(canonical, alias);
    updateArrival.run(canonical, alias);
  }
}

function componentUsesRatio(code, ratio) {
  if (!Number.isFinite(ratio)) return false;
  if (code === "ulv" || code === "palv") return true;
  if (code === "ddo") return approximately(ratio, 0.0075);
  if (code === "loyalty") return approximately(ratio, 0.1) || approximately(ratio, 0.15);
  if (code === "wfly") return approximately(ratio, 0.0075) || approximately(ratio, 0.01);
  return false;
}

function approximately(value, expected) {
  return Math.abs(value - expected) < 0.0000001;
}

function tableExists(name) {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)
  );
}

function addColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

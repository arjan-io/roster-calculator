import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, transaction } from "../db/connection.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const schemaPath = path.join(__dirname, "../db/schema.sql");
const schema = fs.readFileSync(schemaPath, "utf8");

transaction(() => {
  migrateExistingTables();
  db.exec(schema);
  migrateExistingData();
})();

console.log("Database initialized and migrated.");

function migrateExistingTables() {
  if (tableExists("airports")) {
    addColumn("airports", "iata", "TEXT");
    addColumn("airports", "icao", "TEXT");
    addColumn("airports", "coordinate_text", "TEXT");
  }

  if (tableExists("flights")) {
    addColumn("flights", "distance_nm", "REAL");
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
  db.exec("DROP TABLE IF EXISTS claims");
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
      const isRatio = paymentPeriod.basic_salary && Math.abs(value) < Math.abs(paymentPeriod.basic_salary);
      insert.run(
        paymentPeriod.id,
        code,
        name,
        isRatio ? "ratio" : "fixed",
        isRatio ? value / paymentPeriod.basic_salary : null,
        isRatio ? null : value
      );
    }
  }
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

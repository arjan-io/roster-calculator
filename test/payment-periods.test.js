import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "roster-payment-test-"));
process.env.DATABASE_PATH = path.join(testDir, "payment.sqlite");

const { db } = await import("../src/db/connection.js");

db.exec(`
  CREATE TABLE payment_periods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    effective_date TEXT NOT NULL UNIQUE,
    basic_salary REAL NOT NULL,
    normal_tax_rate REAL NOT NULL,
    special_tax_rate REAL NOT NULL
  );
  CREATE TABLE payment_components (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_period_id INTEGER NOT NULL,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    calculation_type TEXT NOT NULL,
    ratio REAL,
    amount REAL,
    payment_treatment TEXT NOT NULL
  );
  CREATE TABLE flights (flight_date TEXT NOT NULL, distance_nm REAL);
  CREATE TABLE duty_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sector_value REAL NOT NULL DEFAULT 0,
    is_paid INTEGER NOT NULL DEFAULT 1,
    tax_treatment TEXT NOT NULL DEFAULT 'normal',
    payment_component_code TEXT,
    payment_multiplier REAL NOT NULL DEFAULT 1
  );
  CREATE TABLE misc_duties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    duty_date TEXT NOT NULL,
    duty_type_id INTEGER NOT NULL
  );
  CREATE TABLE one_off_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_month INTEGER NOT NULL,
    payment_year INTEGER NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    tax_treatment TEXT NOT NULL
  );
  CREATE TABLE deductions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    start_month TEXT,
    end_month TEXT,
    payment_stage TEXT NOT NULL,
    calculation_type TEXT NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL
  );
`);

const insertPeriod = db.prepare(`
  INSERT INTO payment_periods (
    effective_date, basic_salary, normal_tax_rate, special_tax_rate
  ) VALUES (?, ?, 0, 0)
`);
const septemberPeriodId = Number(insertPeriod.run("2026-09-01", 100000).lastInsertRowid);
const octoberPeriodId = Number(insertPeriod.run("2026-10-01", 120000).lastInsertRowid);

const insertComponent = db.prepare(`
  INSERT INTO payment_components (
    payment_period_id, code, name, calculation_type, ratio, amount, payment_treatment
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`);
insertComponent.run(septemberPeriodId, "sector", "Sector", "fixed", null, 10, "normal");
insertComponent.run(septemberPeriodId, "misc_rate", "Misc rate", "fixed", null, 20, "normal");
insertComponent.run(septemberPeriodId, "loyalty", "Loyalty", "ratio", 0.1, null, "special");
insertComponent.run(octoberPeriodId, "sector", "Sector", "fixed", null, 12, "normal");
insertComponent.run(octoberPeriodId, "misc_rate", "Misc rate", "fixed", null, 30, "normal");
insertComponent.run(octoberPeriodId, "loyalty", "Loyalty", "ratio", 0.12, null, "special");

db.prepare("INSERT INTO flights (flight_date, distance_nm) VALUES (?, ?)")
  .run("2026-09-15", 300);

const insertDutyType = db.prepare(`
  INSERT INTO duty_types (
    name, sector_value, is_paid, tax_treatment, payment_component_code, payment_multiplier
  ) VALUES (?, ?, 1, 'normal', ?, 1)
`);
const sectorDutyId = Number(insertDutyType.run("Sector duty", 1, null).lastInsertRowid);
const componentDutyId = Number(insertDutyType.run("Component duty", 0, "misc_rate").lastInsertRowid);
const insertDuty = db.prepare("INSERT INTO misc_duties (duty_date, duty_type_id) VALUES (?, ?)");
insertDuty.run("2026-09-10", sectorDutyId);
insertDuty.run("2026-09-20", componentDutyId);

const { calculatePaymentPreview } = await import("../src/services/payment.service.js");
const result = calculatePaymentPreview("2026-10");

assert.equal(result.rosterMonth, "2026-09");
assert.equal(result.paymentPeriod.effectiveDate, "2026-10-01");
assert.equal(result.rosterPaymentPeriod.effectiveDate, "2026-09-01");
assert.equal(result.sectorBreakdown.find((row) => row.label === "Short").amount, 8);
assert.equal(result.dutyBreakdown.find((row) => row.name === "Sector duty").normal, 10);
assert.equal(result.dutyBreakdown.find((row) => row.name === "Component duty").normal, 20);
assert.equal(result.earnings.find((row) => row.label === "Salary").normal, 10000);
assert.equal(result.earnings.find((row) => row.label === "Loyalty").special, 1200);

db.close();
fs.rmSync(testDir, { recursive: true, force: true });
console.log("Payment period tests passed.");

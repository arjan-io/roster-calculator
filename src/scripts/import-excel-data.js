import path from "node:path";
import process from "node:process";
import xlsx from "xlsx";
import { db, transaction } from "../db/connection.js";
import { canonicalAirportCode } from "../utils/airportCodes.js";
import { recalculateFlightDistances } from "../services/airport.service.js";

const workbookPath = process.argv[2];
const replaceExisting = process.argv.includes("--replace");
const airportsOnly = process.argv.includes("--airports-only");

if (!workbookPath) {
  console.error("Usage: npm run excel:import -- /path/to/Pay-calculator.xlsm --replace");
  process.exit(1);
}

const workbook = xlsx.readFile(workbookPath, {
  cellDates: true,
  raw: true
});

const stats = transaction(() => {
  if (replaceExisting) {
    airportsOnly ? clearAirportTables() : clearExcelOwnedTables();
  }

  if (airportsOnly) {
    return { airports: importAirports() };
  }

  return {
    airports: importAirports(),
    dutyTypes: importDutyTypes(),
    miscDuties: importMiscDuties(),
    salaryScales: importSalaryScales(),
    oneOffPayments: importOneOffPayments(),
    deductions: importDeductions()
  };
})();

normalizeFlightsFromAirportAliases();
recalculateFlightDistances();

console.log(`Imported Excel data from ${path.basename(workbookPath)}:`);
for (const [label, count] of Object.entries(stats)) {
  console.log(`- ${label}: ${count}`);
}

function normalizeFlightsFromAirportAliases() {
  for (const column of ["departure_airport", "arrival_airport"]) {
    db.exec(`
      UPDATE flights
      SET ${column} = (
        SELECT COALESCE(airports.iata, airports.code)
        FROM airport_aliases
        JOIN airports ON airports.id = airport_aliases.airport_id
        WHERE airport_aliases.alias = flights.${column}
      )
      WHERE EXISTS (
        SELECT 1 FROM airport_aliases
        WHERE airport_aliases.alias = flights.${column}
      )
    `);
  }
}

function clearAirportTables() {
  db.exec(`
    DELETE FROM airport_aliases;
    DELETE FROM airports;
  `);
}

function clearExcelOwnedTables() {
  db.exec(`
    DELETE FROM airport_aliases;
    DELETE FROM airports;
    DELETE FROM misc_duties;
    DELETE FROM duty_types;
    DELETE FROM payment_components;
    DELETE FROM payment_periods;
    DELETE FROM salary_scales;
    DELETE FROM one_off_payments;
    DELETE FROM deductions;
  `);
}

function importAirports() {
  const insertAirport = db.prepare(`
    INSERT INTO airports (code, iata, name, coordinate_text, latitude, longitude, updated_at)
    VALUES (@code, @code, @name, @coordinateText, @latitude, @longitude, CURRENT_TIMESTAMP)
    ON CONFLICT(code) DO UPDATE SET
      iata = excluded.iata,
      name = excluded.name,
      coordinate_text = excluded.coordinate_text,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      updated_at = CURRENT_TIMESTAMP
  `);
  const selectAirport = db.prepare("SELECT id FROM airports WHERE code = ?");
  const insertAlias = db.prepare(`
    INSERT OR IGNORE INTO airport_aliases (airport_id, alias)
    VALUES (?, ?)
  `);
  const clearIcao = db.prepare("UPDATE airports SET icao = NULL WHERE icao = ? AND id <> ?");
  const removeOldAlias = db.prepare("DELETE FROM airport_aliases WHERE alias = ? AND airport_id <> ?");
  const updateIcao = db.prepare("UPDATE airports SET icao = ? WHERE id = ?");

  function assignIcao(airportId, alias) {
    clearIcao.run(alias, airportId);
    removeOldAlias.run(alias, airportId);
    updateIcao.run(alias, airportId);
    insertAlias.run(airportId, alias);
  }

  let count = 0;
  for (const row of readTable("Data gen", "L2:U162")) {
    const code = canonicalAirportCode(row.name);
    if (!code || !isFiniteNumber(row["dec.lat"]) || !isFiniteNumber(row["dec.long"])) {
      continue;
    }

    insertAirport.run({
      code,
      name: code,
      coordinateText: decimalToLido(row["dec.lat"], row["dec.long"]),
      latitude: row["dec.lat"],
      longitude: row["dec.long"]
    });
    count += 1;
  }

  for (const row of readTable("Data gen", "A2:J161")) {
    const sourceCode = clean(row.name).toUpperCase();
    const code = canonicalAirportCode(sourceCode);
    if (!/^[A-Z]{3}$/.test(code) || !isFiniteNumber(row["dec.lat"]) || !isFiniteNumber(row["dec.long"])) {
      continue;
    }

    insertAirport.run({
      code,
      name: code,
      coordinateText: decimalToLido(row["dec.lat"], row["dec.long"]),
      latitude: row["dec.lat"],
      longitude: row["dec.long"]
    });
    const airport = selectAirport.get(code);
    assignIcao(airport.id, sourceCode);
  }

  for (const row of readTable("Data gen", "W2:X163")) {
    const code = canonicalAirportCode(row.IATA);
    const alias = clean(row.ICAO).toUpperCase();
    if (!code || !alias) {
      continue;
    }

    const mappedCode = canonicalAirportCode(alias);
    const targetCode = /^[A-Z]{3}$/.test(mappedCode) ? mappedCode : code;
    const airport = selectAirport.get(targetCode);
    if (airport) {
      assignIcao(airport.id, alias);
      insertAlias.run(airport.id, code);
    }
  }

  return count;
}

function importDutyTypes() {
  const insert = db.prepare(`
    INSERT INTO duty_types (code, name, sector_value, is_paid)
    VALUES (@code, @name, @sectorValue, @isPaid)
    ON CONFLICT(code) DO UPDATE SET
      name = excluded.name,
      sector_value = excluded.sector_value,
      is_paid = excluded.is_paid
  `);

  let count = 0;
  for (const row of readTable("Data pay", "X2:Y32")) {
    const code = clean(row.duty);
    if (!code) {
      continue;
    }

    const sectorValue = numberOrZero(row["sec verm."]);
    insert.run({
      code,
      name: code,
      sectorValue,
      isPaid: sectorValue > 0 ? 1 : 0
    });
    count += 1;
  }

  return count;
}

function importMiscDuties() {
  const selectDuty = db.prepare("SELECT id FROM duty_types WHERE code = ?");
  const insertDutyType = db.prepare(`
    INSERT INTO duty_types (code, name, sector_value, is_paid)
    VALUES (?, ?, 0, 0)
    ON CONFLICT(code) DO NOTHING
  `);
  const insert = db.prepare(`
    INSERT INTO misc_duties (duty_date, duty_type_id, paid, notes)
    VALUES (?, ?, ?, NULL)
  `);

  let count = 0;
  for (const row of readTable("Misc duties", "A1:F422")) {
    const dutyCode = clean(row.duty);
    const dutyDate = dateToIso(row.dwaarde);
    if (!dutyCode || !dutyDate) {
      continue;
    }

    insertDutyType.run(dutyCode, dutyCode);
    const dutyType = selectDuty.get(dutyCode);
    const paidText = clean(row.betaald).toLowerCase();
    insert.run(dutyDate, dutyType.id, ["ja", "yes", "true", "1"].includes(paidText) ? 1 : 0);
    count += 1;
  }

  return count;
}

function importSalaryScales() {
  const insert = db.prepare(`
    INSERT INTO salary_scales (
      effective_date,
      basic_salary,
      sector_rate,
      ulv_rate,
      palv_rate,
      ddo_rate,
      snc_rate,
      loyalty_amount,
      travel_amount,
      wfly_amount,
      pension_amount
    )
    VALUES (
      @effectiveDate,
      @basicSalary,
      @sectorRate,
      @ulvRate,
      @palvRate,
      @ddoRate,
      @sncRate,
      @loyaltyAmount,
      @travelAmount,
      @wflyAmount,
      @pensionAmount
    )
    ON CONFLICT(effective_date) DO UPDATE SET
      basic_salary = excluded.basic_salary,
      sector_rate = excluded.sector_rate,
      ulv_rate = excluded.ulv_rate,
      palv_rate = excluded.palv_rate,
      ddo_rate = excluded.ddo_rate,
      snc_rate = excluded.snc_rate,
      loyalty_amount = excluded.loyalty_amount,
      travel_amount = excluded.travel_amount,
      wfly_amount = excluded.wfly_amount,
      pension_amount = excluded.pension_amount
  `);

  let count = 0;
  for (const row of readTable("Data pay", "A2:K14")) {
    const effectiveDate = dateToIso(row.date);
    if (!effectiveDate) {
      continue;
    }

    const values = {
      effectiveDate,
      basicSalary: numberOrZero(row.basic),
      sectorRate: numberOrZero(row.sector1),
      ulvRate: numberOrZero(row.ULV),
      palvRate: numberOrZero(row.PALV),
      ddoRate: numberOrZero(row.DDO),
      sncRate: numberOrZero(row.SNC),
      loyaltyAmount: numberOrZero(row.loyalty),
      travelAmount: numberOrZero(row.reiskosten),
      wflyAmount: numberOrZero(row.WFLY),
      pensionAmount: numberOrZero(row.Pensioen)
    };
    insert.run(values);
    importPaymentPeriod(values);
    count += 1;
  }

  return count;
}

function importPaymentPeriod(values) {
  const periodResult = db.prepare(`
    INSERT INTO payment_periods (effective_date, basic_salary)
    VALUES (?, ?)
    ON CONFLICT(effective_date) DO UPDATE SET basic_salary = excluded.basic_salary
    RETURNING id
  `).get(values.effectiveDate, values.basicSalary);
  db.prepare("DELETE FROM payment_components WHERE payment_period_id = ?").run(periodResult.id);

  const components = [
    ["sector", "Sector", values.sectorRate, false],
    ["ulv", "ULV", values.ulvRate, true],
    ["palv", "PALV", values.palvRate, true],
    ["ddo", "DDO", values.ddoRate, ratioMatches(values.ddoRate, values.basicSalary, [0.0075])],
    ["snc", "SNC", values.sncRate, false],
    ["loyalty", "Loyalty", values.loyaltyAmount, ratioMatches(values.loyaltyAmount, values.basicSalary, [0.1, 0.15])],
    ["travel", "Travel costs", values.travelAmount, false],
    ["wfly", "WFLY", values.wflyAmount, ratioMatches(values.wflyAmount, values.basicSalary, [0.0075, 0.01])],
    ["pension", "Pension", values.pensionAmount, false]
  ];
  const insert = db.prepare(`
    INSERT INTO payment_components (
      payment_period_id, code, name, calculation_type, ratio, amount
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const [code, name, value, isRatio] of components) {
    insert.run(
      periodResult.id, code, name, isRatio ? "ratio" : "fixed",
      isRatio ? value / values.basicSalary : null,
      isRatio ? null : value
    );
  }
}

function ratioMatches(value, basicSalary, ratios) {
  if (!basicSalary) return false;
  const ratio = value / basicSalary;
  return ratios.some((expected) => Math.abs(ratio - expected) < 0.0000001);
}

function importOneOffPayments() {
  const insert = db.prepare(`
    INSERT INTO one_off_payments (payment_month, payment_year, description, amount)
    VALUES (?, ?, ?, ?)
  `);

  let count = 0;
  for (const row of readTable("Data pay", "M2:P17")) {
    const month = monthToNumber(row.month);
    const year = Number(row.year);
    const description = clean(row.What);
    if (!month || !year || !description) {
      continue;
    }

    insert.run(month, year, description, numberOrZero(row.Amount));
    count += 1;
  }

  return count;
}

function importDeductions() {
  const insert = db.prepare(`
    INSERT INTO deductions (effective_date, description, amount)
    VALUES (?, ?, ?)
  `);

  let count = 0;
  for (const row of readTable("Data pay", "R2:U8")) {
    const effectiveDate = dateToIso(row.date);
    if (!effectiveDate) {
      continue;
    }

    for (const description of ["vnv", "saye", "pension"]) {
      if (row[description] === null || row[description] === undefined || row[description] === "") {
        continue;
      }

      insert.run(effectiveDate, description, numberOrZero(row[description]));
      count += 1;
    }
  }

  return count;
}

function readTable(sheetName, range) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Sheet not found: ${sheetName}`);
  }

  const rows = xlsx.utils.sheet_to_json(sheet, {
    range,
    header: 1,
    defval: null,
    raw: true
  });

  const headers = rows[0].map((header) => clean(header));
  return rows.slice(1).map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? null;
    });
    return record;
  });
}

function clean(value) {
  return String(value ?? "").trim();
}

function numberOrZero(value) {
  return Number(value) || 0;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function dateToIso(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number") {
    const parsed = xlsx.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }

  const text = clean(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function decimalToLido(latitude, longitude) {
  return `${decimalPart(latitude, "N", "S", 2)} ${decimalPart(longitude, "E", "W", 3)}`;
}

function decimalPart(value, positive, negative, degreeWidth) {
  const absolute = Math.abs(Number(value));
  const degrees = Math.floor(absolute);
  const minutes = ((absolute - degrees) * 60).toFixed(1);
  const hemisphere = Number(value) < 0 ? negative : positive;
  return `${hemisphere} ${String(degrees).padStart(degreeWidth, "0")} ${minutes.padStart(4, "0")}`;
}

function monthToNumber(value) {
  const months = {
    januari: 1,
    februari: 2,
    maart: 3,
    april: 4,
    mei: 5,
    juni: 6,
    juli: 7,
    augustus: 8,
    september: 9,
    oktober: 10,
    november: 11,
    december: 12
  };

  return months[clean(value).toLowerCase()] || null;
}

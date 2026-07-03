import { db } from "../db/connection.js";

export function getStatistics({ year, month } = {}) {
  const filter = normalizeFilter(year, month);
  return {
    filter,
    availableYears: listAvailableYears(),
    overview: getOverview(filter),
    periods: getPeriods(filter),
    weekdays: getWeekdays(filter),
    sectorsPerDay: getSectorsPerDay(filter),
    routes: getRoutes(filter),
    destinations: getDestinations(filter),
    pay: getPayStatistics(filter)
  };
}

export function listBaseStations() {
  return db.prepare(`
    SELECT id, iata, start_date AS startDate, end_date AS endDate
    FROM base_stations
    ORDER BY start_date DESC, id DESC
  `).all();
}

export function saveBaseStation({ id, iata, startDate, endDate }) {
  const code = String(iata || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new Error("Enter a three-letter IATA code.");
  if (!validDate(startDate)) throw new Error("Select a valid start date.");
  if (endDate && !validDate(endDate)) throw new Error("Select a valid end date.");
  if (endDate && endDate < startDate) throw new Error("End date cannot be before start date.");
  if (!db.prepare("SELECT 1 FROM airports WHERE COALESCE(iata, code) = ?").get(code)) {
    throw new Error(`${code} is not present under Data > Airports.`);
  }

  if (id) {
    const result = db.prepare(`
      UPDATE base_stations SET iata = ?, start_date = ?, end_date = ? WHERE id = ?
    `).run(code, startDate, endDate || null, Number(id));
    if (!result.changes) throw new Error("Base period not found.");
  } else {
    db.prepare(`
      INSERT INTO base_stations (iata, start_date, end_date) VALUES (?, ?, ?)
    `).run(code, startDate, endDate || null);
  }
  return { saved: true };
}

export function deleteBaseStation(id) {
  const result = db.prepare("DELETE FROM base_stations WHERE id = ?").run(Number(id));
  if (!result.changes) throw new Error("Base period not found.");
  return { deleted: true };
}

function getOverview(filter) {
  const flight = flightWhere(filter, "flight_date");
  const duty = dutyWhere(filter, "duty_date");
  const totals = db.prepare(`
    SELECT COUNT(*) AS flights,
           COALESCE(SUM(flight_time_minutes), 0) AS flightMinutes,
           COALESCE(SUM(distance_nm), 0) AS distanceNm,
           COUNT(DISTINCT flight_date) AS flightDays
    FROM flights ${flight.sql}
  `).get(...flight.params);
  const miscDuties = db.prepare(`SELECT COUNT(*) AS count FROM misc_duties ${duty.sql}`).get(...duty.params).count;
  const workingDays = db.prepare(`
    SELECT COUNT(DISTINCT activity_date) AS count FROM (
      SELECT flight_date AS activity_date FROM flights ${flight.sql}
      UNION ALL
      SELECT duty_date AS activity_date FROM misc_duties ${duty.sql}
    )
  `).get(...flight.params, ...duty.params).count;
  const airports = db.prepare(`
    SELECT COUNT(DISTINCT airport) AS count FROM (
      SELECT departure_airport AS airport FROM flights ${flight.sql}
      UNION
      SELECT arrival_airport AS airport FROM flights ${flight.sql}
    )
  `).get(...flight.params, ...flight.params).count;

  return {
    flights: Number(totals.flights),
    flightMinutes: Number(totals.flightMinutes),
    distanceNm: Math.round(Number(totals.distanceNm)),
    airports: Number(airports),
    workingDays: Number(workingDays),
    miscDuties: Number(miscDuties),
    averageSectorsPerFlightDay: totals.flightDays ? Number(totals.flights) / Number(totals.flightDays) : 0
  };
}

function getPeriods(filter) {
  const flight = flightWhere(filter, "flight_date");
  const duty = dutyWhere(filter, "duty_date");
  const periodExpression = filter.year ? "substr(activity_date, 1, 7)" : "substr(activity_date, 1, 4)";
  return db.prepare(`
    WITH activity AS (
      SELECT flight_date AS activity_date, 1 AS flights,
             COALESCE(flight_time_minutes, 0) AS minutes,
             COALESCE(distance_nm, 0) AS distance, 0 AS duties
      FROM flights ${flight.sql}
      UNION ALL
      SELECT duty_date AS activity_date, 0, 0, 0, 1
      FROM misc_duties ${duty.sql}
    )
    SELECT ${periodExpression} AS period,
           SUM(flights) AS flights,
           SUM(minutes) AS flightMinutes,
           ROUND(SUM(distance)) AS distanceNm,
           SUM(duties) AS miscDuties,
           COUNT(DISTINCT activity_date) AS workingDays
    FROM activity
    GROUP BY period ORDER BY period
  `).all(...flight.params, ...duty.params);
}

function getWeekdays(filter) {
  const flight = flightWhere(filter, "flight_date");
  const duty = dutyWhere(filter, "duty_date");
  const rows = db.prepare(`
    SELECT CAST(strftime('%w', activity_date) AS INTEGER) AS weekday, COUNT(*) AS days
    FROM (
      SELECT DISTINCT activity_date FROM (
        SELECT flight_date AS activity_date FROM flights ${flight.sql}
        UNION ALL
        SELECT duty_date AS activity_date FROM misc_duties ${duty.sql}
      )
    )
    GROUP BY weekday ORDER BY weekday
  `).all(...flight.params, ...duty.params);
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return rows.map((row) => ({ label: names[row.weekday], count: Number(row.days) }));
}

function getSectorsPerDay(filter) {
  const flight = flightWhere(filter, "flight_date");
  return db.prepare(`
    SELECT sectors, COUNT(*) AS days,
           CASE WHEN sectors > 5 THEN GROUP_CONCAT(flight_date, ', ') ELSE NULL END AS datesToCheck
    FROM (
      SELECT flight_date, COUNT(*) AS sectors
      FROM flights ${flight.sql}
      GROUP BY flight_date
    )
    GROUP BY sectors ORDER BY sectors
  `).all(...flight.params).map((row) => ({
    sectors: Number(row.sectors),
    days: Number(row.days),
    datesToCheck: row.datesToCheck || ""
  }));
}

function getRoutes(filter) {
  const flight = flightWhere(filter, "flight_date");
  return db.prepare(`
    SELECT CASE WHEN departure_airport < arrival_airport
                THEN departure_airport || ' - ' || arrival_airport
                ELSE arrival_airport || ' - ' || departure_airport END AS route,
           COUNT(*) AS flights,
           COALESCE(SUM(flight_time_minutes), 0) AS flightMinutes,
           ROUND(COALESCE(SUM(distance_nm), 0)) AS distanceNm
    FROM flights ${flight.sql}
    GROUP BY route
    ORDER BY flights DESC, route
    LIMIT 15
  `).all(...flight.params);
}

function getDestinations(filter) {
  const flight = flightWhere(filter, "f.flight_date");
  return db.prepare(`
    SELECT f.arrival_airport AS airport, COALESCE(a.name, '') AS name, COUNT(*) AS visits
    FROM flights f
    LEFT JOIN airports a ON COALESCE(a.iata, a.code) = f.arrival_airport
    ${flight.sql}
      ${flight.sql ? "AND" : "WHERE"} NOT EXISTS (
        SELECT 1 FROM base_stations b
        WHERE b.iata = f.arrival_airport
          AND b.start_date <= f.flight_date
          AND (b.end_date IS NULL OR b.end_date = '' OR b.end_date >= f.flight_date)
      )
    GROUP BY f.arrival_airport, a.name
    ORDER BY visits DESC, airport
    LIMIT 15
  `).all(...flight.params);
}

function getPayStatistics(filter) {
  const flight = flightWhere(filter, "flight_date");
  const duty = filterConditions(filter, "m.duty_date");
  const sectors = db.prepare(`
    SELECT
      SUM(CASE WHEN distance_nm <= 399 THEN 1 ELSE 0 END) AS short,
      SUM(CASE WHEN distance_nm BETWEEN 400 AND 1000 THEN 1 ELSE 0 END) AS medium,
      SUM(CASE WHEN distance_nm BETWEEN 1001 AND 1500 THEN 1 ELSE 0 END) AS long,
      SUM(CASE WHEN distance_nm > 1500 THEN 1 ELSE 0 END) AS extraLong,
      SUM(CASE WHEN distance_nm IS NULL THEN 1 ELSE 0 END) AS unknown
    FROM flights ${flight.sql}
  `).get(...flight.params);
  const duties = db.prepare(`
    SELECT d.name, d.tax_treatment AS taxTreatment, d.is_paid AS includedInPay,
           COUNT(m.id) AS logged,
           SUM(CASE WHEN m.paid = 1 THEN 1 ELSE 0 END) AS confirmedPaid
    FROM duty_types d
    LEFT JOIN misc_duties m ON m.duty_type_id = d.id
      ${duty.clauses.length ? `AND ${duty.clauses.join(" AND ")}` : ""}
    GROUP BY d.id ORDER BY d.name
  `).all(...duty.params);
  return {
    sectors: Object.fromEntries(Object.entries(sectors).map(([key, value]) => [key, Number(value || 0)])),
    duties
  };
}

function listAvailableYears() {
  return db.prepare(`
    SELECT year FROM (
      SELECT DISTINCT substr(flight_date, 1, 4) AS year FROM flights
      UNION
      SELECT DISTINCT substr(duty_date, 1, 4) AS year FROM misc_duties
    ) WHERE year <> '' ORDER BY year DESC
  `).all().map((row) => Number(row.year));
}

function normalizeFilter(year, month) {
  const parsedYear = /^\d{4}$/.test(String(year || "")) ? Number(year) : null;
  const parsedMonth = /^(?:[1-9]|1[0-2])$/.test(String(Number(month || 0))) ? Number(month) : null;
  return { year: parsedYear, month: parsedYear ? parsedMonth : null };
}

function flightWhere(filter, column) {
  const result = filterConditions(filter, column);
  return { sql: result.clauses.length ? `WHERE ${result.clauses.join(" AND ")}` : "", params: result.params };
}

function dutyWhere(filter, column) {
  return flightWhere(filter, column);
}

function filterConditions(filter, column) {
  const clauses = [];
  const params = [];
  if (filter.year) {
    clauses.push(`substr(${column}, 1, 4) = ?`);
    params.push(String(filter.year));
  }
  if (filter.month) {
    clauses.push(`CAST(substr(${column}, 6, 2) AS INTEGER) = ?`);
    params.push(filter.month);
  }
  return { clauses, params };
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

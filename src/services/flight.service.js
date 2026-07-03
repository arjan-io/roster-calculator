import { db, transaction } from "../db/connection.js";
import { canonicalAirportCode } from "../utils/airportCodes.js";

export function listFlights({ limit = 100, issue, airport, date } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 1000);
  let where = "";
  const parameters = [];

  if (date && /^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
    where = "WHERE flight_date = ?";
    parameters.push(String(date));
  } else if (issue === "blank_airport") {
    where = "WHERE trim(COALESCE(departure_airport, '')) = '' OR trim(COALESCE(arrival_airport, '')) = ''";
  } else if (issue === "missing_airport" && airport) {
    where = "WHERE departure_airport = ? OR arrival_airport = ?";
    parameters.push(String(airport).toUpperCase(), String(airport).toUpperCase());
  }

  return db.prepare(`
    SELECT
      id,
      flight_date AS flightDate,
      flight_number AS flightNumber,
      departure_airport AS departureAirport,
      departure_time AS departureTime,
      arrival_airport AS arrivalAirport,
      arrival_time AS arrivalTime,
      aircraft_type AS aircraftType,
      aircraft_registration AS aircraftRegistration,
      flight_time_minutes AS flightTimeMinutes,
      distance_nm AS distanceNm,
      display_code AS displayCode,
      source_format AS sourceFormat
    FROM flights
    ${where}
    ORDER BY flight_date DESC, departure_time DESC, id DESC
    LIMIT ?
  `).all(...parameters, safeLimit);
}

export const deleteFlight = transaction((id) => {
  const flight = db.prepare(`
    SELECT
      id,
      flight_date AS flightDate,
      aircraft_registration AS aircraftRegistration,
      departure_airport AS departureAirport,
      departure_time AS departureTime,
      arrival_airport AS arrivalAirport,
      arrival_time AS arrivalTime,
      source_fingerprint AS sourceFingerprint
    FROM flights
    WHERE id = ?
  `).get(Number(id));

  if (!flight) throw new Error("Flight not found.");

  db.prepare(`
    INSERT OR IGNORE INTO excluded_flights (source_fingerprint, operational_key)
    VALUES (?, ?)
  `).run(flight.sourceFingerprint, operationalKey(flight));
  db.prepare("DELETE FROM flights WHERE id = ?").run(flight.id);

  return { deleted: true };
});

export function getFlightSummary() {
  return db.prepare(`
    SELECT
      COUNT(*) AS totalFlights,
      MIN(flight_date) AS firstDate,
      MAX(flight_date) AS lastDate,
      SUM(COALESCE(flight_time_minutes, 0)) AS totalMinutes
    FROM flights
  `).get();
}

function operationalKey(flight) {
  return [
    flight.flightDate,
    flight.aircraftRegistration,
    canonicalAirportCode(flight.departureAirport),
    flight.departureTime,
    canonicalAirportCode(flight.arrivalAirport),
    flight.arrivalTime
  ].join("|");
}

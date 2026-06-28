import { db } from "../db/connection.js";

export function listFlights({ limit = 100, issue, airport } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 1000);
  let where = "";
  const parameters = [];

  if (issue === "blank_airport") {
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

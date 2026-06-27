import { db } from "../db/connection.js";

export function listFlights({ limit = 100 } = {}) {
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
    ORDER BY flight_date DESC, departure_time DESC, id DESC
    LIMIT ?
  `).all(limit);
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

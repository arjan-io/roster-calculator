import { db } from "../db/connection.js";

export function listIssues() {
  const issues = [];
  const missingAirports = db.prepare(`
    SELECT airport, COUNT(*) AS occurrences
    FROM (
      SELECT departure_airport AS airport FROM flights
      UNION ALL
      SELECT arrival_airport AS airport FROM flights
    )
    WHERE NOT EXISTS (
      SELECT 1 FROM airports
      WHERE COALESCE(airports.iata, airports.code) = airport
         OR airports.icao = airport
    )
    GROUP BY airport ORDER BY occurrences DESC
  `).all();

  for (const item of missingAirports) {
    issues.push({
      type: "missing_airport",
      label: `${item.airport} is missing from Airports`,
      detail: `${item.occurrences} sector${item.occurrences === 1 ? "" : "s"} affected`,
      target: "airports"
    });
  }

  const missingCoordinates = db.prepare(`
    SELECT COALESCE(iata, code) AS airport
    FROM airports WHERE latitude IS NULL OR longitude IS NULL
    ORDER BY airport
  `).all();
  for (const item of missingCoordinates) {
    issues.push({
      type: "missing_coordinates",
      label: `${item.airport} has no coordinates`,
      detail: "Great-circle distance cannot be calculated",
      target: "airports"
    });
  }

  return issues;
}

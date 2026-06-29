import { db } from "../db/connection.js";

export function listIssues() {
  const issues = [];
  const blankAirports = db.prepare(`
    SELECT COUNT(*) AS occurrences
    FROM flights
    WHERE trim(COALESCE(departure_airport, '')) = ''
       OR trim(COALESCE(arrival_airport, '')) = ''
  `).get();
  if (blankAirports.occurrences) {
    issues.push({
      type: "blank_airport",
      label: "A flight has a blank airport code",
      detail: `${blankAirports.occurrences} sector${blankAirports.occurrences === 1 ? "" : "s"} affected`,
      target: "flights",
      flightFilter: "blank_airport"
    });
  }

  const missingAirports = db.prepare(`
    SELECT airport, COUNT(*) AS occurrences
    FROM (
      SELECT departure_airport AS airport FROM flights
      UNION ALL
      SELECT arrival_airport AS airport FROM flights
    )
    WHERE trim(COALESCE(airport, '')) <> ''
      AND NOT EXISTS (
      SELECT 1 FROM airports
      WHERE COALESCE(airports.iata, airports.code) = airport
         OR airports.icao = airport
         OR EXISTS (
           SELECT 1 FROM airport_aliases
           WHERE airport_aliases.airport_id = airports.id
             AND airport_aliases.alias = airport
         )
    )
    GROUP BY airport ORDER BY occurrences DESC
  `).all();

  for (const item of missingAirports) {
    issues.push({
      type: "missing_airport",
      label: `${item.airport} is missing from Airports`,
      detail: `${item.occurrences} sector${item.occurrences === 1 ? "" : "s"} affected`,
      target: "flights",
      flightFilter: "missing_airport",
      airport: item.airport
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

  const unpricedDutyTypes = db.prepare(`
    SELECT duty_types.code, duty_types.name, duty_types.payment_component_code AS componentCode
    FROM duty_types
    LEFT JOIN payment_components
      ON payment_components.code = duty_types.payment_component_code
     AND payment_components.payment_period_id = (
       SELECT id FROM payment_periods ORDER BY effective_date DESC LIMIT 1
     )
    WHERE duty_types.is_paid = 1
      AND duty_types.sector_value = 0
      AND (
        duty_types.payment_component_code IS NULL
        OR duty_types.payment_component_code = ''
        OR payment_components.id IS NULL
      )
    ORDER BY duty_types.name
  `).all();

  for (const dutyType of unpricedDutyTypes) {
    issues.push({
      type: "unpriced_duty_type",
      label: `${dutyType.name} has no payment rate`,
      detail: dutyType.componentCode
        ? `Component ${dutyType.componentCode} is missing from the latest Payment details`
        : "Assign a payment component or a sector value",
      target: "duty-types"
    });
  }

  return issues;
}

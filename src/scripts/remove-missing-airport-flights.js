import { db, transaction } from "../db/connection.js";
import { canonicalAirportCode } from "../utils/airportCodes.js";

const affectedFlights = db.prepare(`
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
  WHERE trim(COALESCE(departure_airport, '')) = ''
     OR trim(COALESCE(arrival_airport, '')) = ''
     OR NOT EXISTS (
       SELECT 1 FROM airports
       WHERE COALESCE(airports.iata, airports.code) = flights.departure_airport
          OR airports.icao = flights.departure_airport
          OR EXISTS (
            SELECT 1 FROM airport_aliases
            WHERE airport_aliases.airport_id = airports.id
              AND airport_aliases.alias = flights.departure_airport
          )
     )
     OR NOT EXISTS (
       SELECT 1 FROM airports
       WHERE COALESCE(airports.iata, airports.code) = flights.arrival_airport
          OR airports.icao = flights.arrival_airport
          OR EXISTS (
            SELECT 1 FROM airport_aliases
            WHERE airport_aliases.airport_id = airports.id
              AND airport_aliases.alias = flights.arrival_airport
          )
     )
`).all();

transaction(() => {
  const exclude = db.prepare(`
    INSERT OR IGNORE INTO excluded_flights (source_fingerprint, operational_key)
    VALUES (?, ?)
  `);
  const remove = db.prepare("DELETE FROM flights WHERE id = ?");

  for (const flight of affectedFlights) {
    exclude.run(flight.sourceFingerprint, operationalKey(flight));
    remove.run(flight.id);
  }
})();

console.log(`Removed and excluded ${affectedFlights.length} flights with missing airport data.`);

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

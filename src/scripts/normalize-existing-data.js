import { db, transaction } from "../db/connection.js";
import { canonicalAirportCode } from "../utils/airportCodes.js";
import { normalizeAircraftModel } from "../utils/aircraft.js";
import { buildDisplayCode } from "../utils/normalizers.js";

const flights = db.prepare(`
  SELECT
    id,
    flight_date AS flightDate,
    flight_number AS flightNumber,
    departure_airport AS departureAirport,
    departure_time AS departureTime,
    arrival_airport AS arrivalAirport,
    arrival_time AS arrivalTime,
    aircraft_type AS aircraftType,
    display_code AS displayCode
  FROM flights
`).all();

const updateFlight = db.prepare(`
  UPDATE flights
  SET
    departure_airport = @departureAirport,
    arrival_airport = @arrivalAirport,
    aircraft_type = @aircraftType,
    display_code = @displayCode
  WHERE id = @id
`);

const normalizeFlights = transaction((rows) => {
  let changed = 0;

  for (const row of rows) {
    const normalized = {
      id: row.id,
      flightDate: row.flightDate,
      flightNumber: row.flightNumber,
      departureAirport: canonicalAirportCode(row.departureAirport),
      departureTime: row.departureTime,
      arrivalAirport: canonicalAirportCode(row.arrivalAirport),
      arrivalTime: row.arrivalTime,
      aircraftType: normalizeAircraftModel(row.aircraftType)
    };

    normalized.displayCode = buildDisplayCode(normalized);

    if (
      normalized.departureAirport !== row.departureAirport ||
      normalized.arrivalAirport !== row.arrivalAirport ||
      normalized.aircraftType !== row.aircraftType ||
      normalized.displayCode !== row.displayCode
    ) {
      updateFlight.run(normalized);
      changed += 1;
    }
  }

  return changed;
});

const changed = normalizeFlights(flights);
console.log(`Normalized ${changed} existing flights.`);

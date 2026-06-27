import { db, transaction } from "../db/connection.js";
import { canonicalAirportCode } from "../utils/airportCodes.js";
import { greatCircleDistanceNm, parseLidoCoordinate } from "../utils/geo.js";

export function listAirports() {
  return db.prepare(`
    SELECT
      id,
      COALESCE(iata, code) AS iata,
      icao,
      name,
      coordinate_text AS coordinateText,
      latitude,
      longitude
    FROM airports
    ORDER BY COALESCE(iata, code)
  `).all();
}

export function saveAirport({ id, code, iata, icao, name, lidoCoordinate }) {
  const iataCode = String(iata || code || "").trim().toUpperCase();
  const icaoCode = String(icao || "").trim().toUpperCase() || null;
  validateCodes(iataCode, icaoCode);
  const coordinates = parseLidoCoordinate(lidoCoordinate);

  try {
    transaction(() => {
      if (id) {
        const existing = db.prepare("SELECT id FROM airports WHERE id = ?").get(Number(id));
        if (!existing) {
          throw new Error("Airport not found.");
        }

        db.prepare(`
          UPDATE airports
          SET code = ?, iata = ?, icao = ?, name = ?, coordinate_text = ?,
              latitude = ?, longitude = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(
          iataCode, iataCode, icaoCode, clean(name), coordinates.formatted,
          coordinates.latitude, coordinates.longitude, Number(id)
        );
      } else {
        db.prepare(`
          INSERT INTO airports (
            code, iata, icao, name, coordinate_text, latitude, longitude, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(
          iataCode, iataCode, icaoCode, clean(name), coordinates.formatted,
          coordinates.latitude, coordinates.longitude
        );
      }

      const airport = db.prepare("SELECT id FROM airports WHERE iata = ?").get(iataCode);
      db.prepare("INSERT OR IGNORE INTO airport_aliases (airport_id, alias) VALUES (?, ?)").run(airport.id, iataCode);
      db.prepare("DELETE FROM airport_aliases WHERE airport_id = ? AND length(alias) = 4").run(airport.id);
      if (icaoCode) {
        db.prepare("INSERT OR IGNORE INTO airport_aliases (airport_id, alias) VALUES (?, ?)").run(airport.id, icaoCode);
      }
      recalculateFlightDistances();
    })();
  } catch (error) {
    if (String(error.message).includes("UNIQUE constraint failed")) {
      throw new Error("That IATA or ICAO code is already assigned to another airport.");
    }
    throw error;
  }

  return findAirport(iataCode);
}

export function deleteAirport(id) {
  const used = db.prepare(`
    SELECT COUNT(*) AS count
    FROM flights
    WHERE departure_airport = (SELECT COALESCE(iata, code) FROM airports WHERE id = ?)
       OR arrival_airport = (SELECT COALESCE(iata, code) FROM airports WHERE id = ?)
  `).get(Number(id), Number(id));

  if (used.count) {
    throw new Error(`This airport is used by ${used.count} flights and cannot be deleted.`);
  }

  const result = db.prepare("DELETE FROM airports WHERE id = ?").run(Number(id));
  if (!result.changes) {
    throw new Error("Airport not found.");
  }
  return { deleted: true };
}

export function findAirport(code) {
  const airportCode = canonicalAirportCode(code);
  return db.prepare(`
    SELECT id, COALESCE(iata, code) AS code, iata, icao, name,
           coordinate_text AS coordinateText, latitude, longitude
    FROM airports
    WHERE code = ? OR iata = ? OR icao = ?
       OR id = (SELECT airport_id FROM airport_aliases WHERE alias = ?)
    LIMIT 1
  `).get(airportCode, airportCode, airportCode, airportCode);
}

export function getAirportDistance(fromCode, toCode) {
  const from = findAirport(fromCode);
  const to = findAirport(toCode);
  if (!from || !to) {
    throw new Error("Both airports must exist before distance can be calculated.");
  }
  return {
    from: from.code,
    to: to.code,
    distanceNm: Math.round(greatCircleDistanceNm(from, to))
  };
}

export function recalculateFlightDistances() {
  const flights = db.prepare(`
    SELECT f.id, dep.latitude AS dep_lat, dep.longitude AS dep_lon,
           arr.latitude AS arr_lat, arr.longitude AS arr_lon
    FROM flights f
    LEFT JOIN airports dep ON COALESCE(dep.iata, dep.code) = f.departure_airport
    LEFT JOIN airports arr ON COALESCE(arr.iata, arr.code) = f.arrival_airport
  `).all();
  const update = db.prepare("UPDATE flights SET distance_nm = ? WHERE id = ?");

  for (const flight of flights) {
    if ([flight.dep_lat, flight.dep_lon, flight.arr_lat, flight.arr_lon].some((value) => value === null)) {
      update.run(null, flight.id);
      continue;
    }
    update.run(greatCircleDistanceNm(
      { latitude: flight.dep_lat, longitude: flight.dep_lon },
      { latitude: flight.arr_lat, longitude: flight.arr_lon }
    ), flight.id);
  }
}

function validateCodes(iata, icao) {
  if (!/^[A-Z]{3}$/.test(iata)) {
    throw new Error("IATA must contain exactly three letters.");
  }
  if (icao && !/^[A-Z]{4}$/.test(icao)) {
    throw new Error("ICAO must contain exactly four letters.");
  }
}

function clean(value) {
  return String(value ?? "").trim();
}

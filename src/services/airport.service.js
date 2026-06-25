import { db } from "../db/connection.js";
import { canonicalAirportCode } from "../utils/airportCodes.js";
import { greatCircleDistanceNm, parseLidoCoordinate } from "../utils/geo.js";

const upsertAirportStatement = db.prepare(`
  INSERT INTO airports (code, name, latitude, longitude, updated_at)
  VALUES (@code, @name, @latitude, @longitude, CURRENT_TIMESTAMP)
  ON CONFLICT(code) DO UPDATE SET
    name = excluded.name,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    updated_at = CURRENT_TIMESTAMP
`);

const findAirportStatement = db.prepare(`
  SELECT
    code,
    name,
    latitude,
    longitude
  FROM airports
  WHERE code = ?
`);

export function listAirports() {
  return db.prepare(`
    SELECT
      code,
      name,
      latitude,
      longitude
    FROM airports
    ORDER BY code
  `).all();
}

export function saveAirport({ code, name, lidoCoordinate }) {
  const airportCode = canonicalAirportCode(code);
  const coordinates = parseLidoCoordinate(lidoCoordinate);

  upsertAirportStatement.run({
    code: airportCode,
    name: String(name ?? "").trim(),
    latitude: coordinates.latitude,
    longitude: coordinates.longitude
  });

  return findAirport(airportCode);
}

export function findAirport(code) {
  return findAirportStatement.get(canonicalAirportCode(code));
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

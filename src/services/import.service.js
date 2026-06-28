import { db, transaction } from "../db/connection.js";
import { isImportableFlightDate } from "../config/importRules.js";
import { canonicalAirportCode } from "../utils/airportCodes.js";

const insertBatch = db.prepare(`
  INSERT INTO import_batches (
    source_format,
    original_file_name,
    row_count,
    inserted_count,
    duplicate_count,
    notes
  )
  VALUES (@sourceFormat, @originalFileName, @rowCount, @insertedCount, @duplicateCount, @notes)
`);

const insertFlight = db.prepare(`
  INSERT INTO flights (
    import_batch_id,
    flight_date,
    flight_number,
    departure_airport,
    departure_time,
    departure_time_zone,
    arrival_airport,
    arrival_time,
    arrival_time_zone,
    aircraft_type,
    aircraft_registration,
    flight_time_minutes,
    pic_name,
    operating_capacity,
    pf_minutes,
    pnf_minutes,
    display_code,
    source_format,
    source_file_name,
    source_row_number,
    source_fingerprint,
    operational_key,
    raw_json
  )
  VALUES (
    @importBatchId,
    @flightDate,
    @flightNumber,
    @departureAirport,
    @departureTime,
    @departureTimeZone,
    @arrivalAirport,
    @arrivalTime,
    @arrivalTimeZone,
    @aircraftType,
    @aircraftRegistration,
    @flightTimeMinutes,
    @picName,
    @operatingCapacity,
    @pfMinutes,
    @pnfMinutes,
    @displayCode,
    @sourceFormat,
    @sourceFileName,
    @sourceRowNumber,
    @sourceFingerprint,
    @operationalKey,
    @rawJson
  )
`);

const findCanonicalAirport = db.prepare(`
  SELECT COALESCE(airports.iata, airports.code) AS code
  FROM airports
  LEFT JOIN airport_aliases ON airport_aliases.airport_id = airports.id
  WHERE airports.code = @code
     OR airports.iata = @code
     OR airports.icao = @code
     OR airport_aliases.alias = @code
  LIMIT 1
`);

const findExcludedFlight = db.prepare(`
  SELECT id
  FROM excluded_flights
  WHERE source_fingerprint = ? OR operational_key = ?
  LIMIT 1
`);

const findFlightByFingerprint = db.prepare(`
  SELECT id, display_code AS displayCode
  FROM flights
  WHERE source_fingerprint = ?
`);

const findFlightByOperationalKey = db.prepare(`
  SELECT id, display_code AS displayCode
  FROM flights
  WHERE operational_key = ?
`);

const findOperationalCandidates = db.prepare(`
  SELECT
    id,
    display_code AS displayCode,
    departure_airport AS departureAirport,
    departure_time AS departureTime,
    arrival_airport AS arrivalAirport,
    arrival_time AS arrivalTime,
    flight_time_minutes AS flightTimeMinutes
  FROM flights
  WHERE flight_date = @flightDate
    AND aircraft_registration = @aircraftRegistration
`);

export function previewImport(flights) {
  const seenFingerprints = new Set();
  const seenOperationalKeys = new Set();

  return flights.map((flight) => {
    flight = normalizeFlightAirports(flight);
    const operationalKey = getOperationalDuplicateKey(flight);
    const duplicateInImport =
      seenFingerprints.has(flight.sourceFingerprint) ||
      Boolean(operationalKey && seenOperationalKeys.has(operationalKey));
    const existing = duplicateInImport ? { id: null } : findDuplicateFlight(flight);

    seenFingerprints.add(flight.sourceFingerprint);
    if (operationalKey) seenOperationalKeys.add(operationalKey);

    return {
      ...flight,
      duplicate: Boolean(existing),
      existingFlightId: existing?.id || null
    };
  });
}

export function toPublicPreviewFlight(flight) {
  const { raw, sourceFingerprint, ...publicFlight } = flight;
  return publicFlight;
}

export const commitImport = transaction(({ sourceFormat, originalFileName, flights }) => {
  let insertedCount = 0;
  let duplicateCount = 0;
  const importableFlights = flights.filter((flight) => isImportableFlightDate(flight.flightDate));
  const skippedBeforeCutoff = flights.length - importableFlights.length;

  const preview = previewImport(importableFlights);
  const batch = insertBatch.run({
    sourceFormat,
    originalFileName,
    rowCount: importableFlights.length,
    insertedCount: 0,
    duplicateCount: 0,
    notes: skippedBeforeCutoff ? `${skippedBeforeCutoff} rows skipped before 2011-06-01` : ""
  });

  for (const flight of preview) {
    if (flight.duplicate) {
      duplicateCount += 1;
      continue;
    }

    insertFlight.run({
      ...flight,
      importBatchId: batch.lastInsertRowid,
      operationalKey: getOperationalDuplicateKey(flight),
      rawJson: JSON.stringify(flight.raw)
    });
    insertedCount += 1;
  }

  db.prepare(`
    UPDATE import_batches
    SET inserted_count = ?, duplicate_count = ?
    WHERE id = ?
  `).run(insertedCount, duplicateCount, batch.lastInsertRowid);

  return {
    importBatchId: batch.lastInsertRowid,
    rowCount: importableFlights.length,
    insertedCount,
    duplicateCount,
    skippedBeforeCutoff
  };
});

export function listImportBatches() {
  return db.prepare(`
    SELECT
      id,
      source_format AS sourceFormat,
      original_file_name AS originalFileName,
      imported_at AS importedAt,
      row_count AS rowCount,
      inserted_count AS insertedCount,
      duplicate_count AS duplicateCount
    FROM import_batches
    ORDER BY imported_at DESC, id DESC
  `).all();
}

function normalizeFlightAirports(flight) {
  return {
    ...flight,
    departureAirport: resolveAirport(flight.departureAirport),
    arrivalAirport: resolveAirport(flight.arrivalAirport)
  };
}

function resolveAirport(value) {
  const code = canonicalAirportCode(value);
  return findCanonicalAirport.get({ code })?.code || code;
}

function findDuplicateFlight(flight) {
  const excluded = findExcludedFlight.get(flight.sourceFingerprint, getOperationalDuplicateKey(flight));
  if (excluded) {
    return { id: null, excluded: true };
  }

  const operationalMatch = findFlightByOperationalKey.get(getOperationalDuplicateKey(flight));
  if (operationalMatch) {
    return operationalMatch;
  }

  const fingerprintMatch = findFlightByFingerprint.get(flight.sourceFingerprint);
  if (fingerprintMatch) {
    return fingerprintMatch;
  }

  const candidates = findOperationalCandidates.all({
    flightDate: flight.flightDate,
    aircraftRegistration: flight.aircraftRegistration
  });

  const departure = canonicalAirportCode(flight.departureAirport);
  const arrival = canonicalAirportCode(flight.arrivalAirport);

  return candidates.find((candidate) => {
    const sameRoute =
      canonicalAirportCode(candidate.departureAirport) === departure &&
      canonicalAirportCode(candidate.arrivalAirport) === arrival;
    const sameTiming =
      candidate.departureTime === flight.departureTime ||
      candidate.arrivalTime === flight.arrivalTime ||
      candidate.flightTimeMinutes === flight.flightTimeMinutes;

    return sameRoute && sameTiming;
  });
}

function getOperationalDuplicateKey(flight) {
  if (!flight.departureTime && !flight.arrivalTime) return null;
  return [
    flight.flightDate,
    flight.aircraftRegistration,
    canonicalAirportCode(flight.departureAirport),
    flight.departureTime,
    canonicalAirportCode(flight.arrivalAirport),
    flight.arrivalTime
  ].join("|");
}

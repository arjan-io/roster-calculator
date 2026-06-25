import { db, transaction } from "../db/connection.js";

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
    @rawJson
  )
`);

const findFlightByFingerprint = db.prepare(`
  SELECT id, display_code AS displayCode
  FROM flights
  WHERE source_fingerprint = ?
`);

export function previewImport(flights) {
  return flights.map((flight) => {
    const existing = findFlightByFingerprint.get(flight.sourceFingerprint);
    return {
      ...flight,
      duplicate: Boolean(existing),
      existingFlightId: existing?.id || null
    };
  });
}

export const commitImport = transaction(({ sourceFormat, originalFileName, flights }) => {
  let insertedCount = 0;
  let duplicateCount = 0;

  const preview = previewImport(flights);
  const batch = insertBatch.run({
    sourceFormat,
    originalFileName,
    rowCount: flights.length,
    insertedCount: 0,
    duplicateCount: 0,
    notes: ""
  });

  for (const flight of preview) {
    if (flight.duplicate) {
      duplicateCount += 1;
      continue;
    }

    insertFlight.run({
      ...flight,
      importBatchId: batch.lastInsertRowid,
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
    rowCount: flights.length,
    insertedCount,
    duplicateCount
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

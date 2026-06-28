import { parseCsv, rowsToObjects } from "../utils/csv.js";
import {
  buildDisplayCode,
  clean,
  durationToMinutes,
  fingerprint,
  parseDate,
  splitTimeAndZone
} from "../utils/normalizers.js";
import { canonicalAirportCode } from "../utils/airportCodes.js";
import { normalizeAircraftModel } from "../utils/aircraft.js";

export function canParseSafeLogCsv(text) {
  return text.includes("Aircraft Type;Aircraft Registration") && text.includes("Departure Time;Arrival");
}

export function parseSafeLogCsv(text, fileName = "") {
  const rows = parseCsv(text.replace(/^\uFEFF/, ""), ";");
  const header = rows[0]?.map(clean) || [];
  const records = rowsToObjects(header, rows.slice(1));

  return records
    .filter((record) => clean(record.Date))
    .filter((record) => durationToMinutes(record["Simulator Sim.Time"]) === 0)
    .map((record, index) => normalizeSafeLogRecord(record, index + 2, fileName));
}

function normalizeSafeLogRecord(record, sourceRowNumber, fileName) {
  const departure = splitTimeAndZone(record["Departure Time"]);
  const arrival = splitTimeAndZone(record["Arrival Time"]);
  const flight = {
    flightDate: parseDate(record.Date),
    flightNumber: "",
    departureAirport: canonicalAirportCode(record.Departure),
    departureTime: departure.time,
    departureTimeZone: departure.zone,
    arrivalAirport: canonicalAirportCode(record.Arrival),
    arrivalTime: arrival.time,
    arrivalTimeZone: arrival.zone,
    aircraftType: normalizeAircraftModel(record["Aircraft Type"]),
    aircraftRegistration: clean(record["Aircraft Registration"]).toUpperCase(),
    flightTimeMinutes: durationToMinutes(record["Total Flight Time"]),
    picName: clean(record["Name of PIC"]),
    operatingCapacity: clean(record["Holder's Operating Capacity"]),
    pfMinutes: durationToMinutes(record.PF),
    pnfMinutes: durationToMinutes(record.PNF),
    sourceFormat: "safelog_csv",
    sourceFileName: fileName,
    sourceRowNumber,
    raw: record
  };

  flight.displayCode = buildDisplayCode(flight);
  flight.sourceFingerprint = fingerprint([
    flight.sourceFormat,
    flight.flightDate,
    flight.departureAirport,
    flight.departureTime,
    flight.arrivalAirport,
    flight.arrivalTime,
    flight.aircraftRegistration,
    flight.flightTimeMinutes,
    flight.operatingCapacity
  ]);

  return flight;
}

import { parseCsv, rowsToObjects } from "../utils/csv.js";
import {
  buildDisplayCode,
  clean,
  durationToMinutes,
  fingerprint,
  normalizeAirport,
  parseDate,
  splitTimeAndZone
} from "../utils/normalizers.js";

export function canParseAirlineCsv(text) {
  return text.includes("DepPlace") && text.includes("ArrPlace") && text.includes("FltTime");
}

export function parseAirlineCsv(text, fileName = "") {
  const rows = parseCsv(text.replace(/^\uFEFF/, ""), ",");
  const header = rows[0]?.map(clean) || [];
  const records = rowsToObjects(header, rows.slice(1));

  return records
    .filter((record) => clean(record.Date))
    .map((record, index) => normalizeAirlineRecord(record, index + 2, fileName));
}

function normalizeAirlineRecord(record, sourceRowNumber, fileName) {
  const departure = splitTimeAndZone(record.DepTime);
  const arrival = splitTimeAndZone(record.ArrTime);
  const flight = {
    flightDate: parseDate(record.Date),
    flightNumber: clean(record.Flight),
    departureAirport: normalizeAirport(record.DepPlace),
    departureTime: departure.time,
    departureTimeZone: departure.zone,
    arrivalAirport: normalizeAirport(record.ArrPlace),
    arrivalTime: arrival.time,
    arrivalTimeZone: arrival.zone,
    aircraftType: clean(record.ACType),
    aircraftRegistration: clean(record.Reg).toUpperCase(),
    flightTimeMinutes: durationToMinutes(record.FltTime),
    picName: clean(record.PicName),
    operatingCapacity: clean(record.PIC) ? "PIC" : "",
    pfMinutes: durationToMinutes(record.PIC),
    pnfMinutes: durationToMinutes(record.CoPlt),
    sourceFormat: "airline_export_csv",
    sourceFileName: fileName,
    sourceRowNumber,
    raw: record
  };

  flight.displayCode = buildDisplayCode(flight);
  flight.sourceFingerprint = fingerprint([
    flight.sourceFormat,
    flight.flightDate,
    flight.flightNumber,
    flight.departureAirport,
    flight.departureTime,
    flight.arrivalAirport,
    flight.arrivalTime,
    flight.aircraftRegistration
  ]);

  return flight;
}

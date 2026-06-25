import { canParseAirlineCsv, parseAirlineCsv } from "../parsers/airlineCsvParser.js";
import { canParseSafeLogCsv, parseSafeLogCsv } from "../parsers/safelogCsvParser.js";
import { isImportableFlightDate } from "../config/importRules.js";

export function parseRosterFile(buffer, fileName) {
  const text = buffer.toString("utf8");

  if (canParseAirlineCsv(text)) {
    const parsedFlights = parseAirlineCsv(text, fileName);
    return {
      sourceFormat: "airline_export_csv",
      ...applyImportDateCutoff(parsedFlights)
    };
  }

  if (canParseSafeLogCsv(text)) {
    const parsedFlights = parseSafeLogCsv(text, fileName);
    return {
      sourceFormat: "safelog_csv",
      ...applyImportDateCutoff(parsedFlights)
    };
  }

  throw new Error("Unsupported file format. Try the airline export CSV or SafeLog CSV.");
}

function applyImportDateCutoff(flights) {
  const importableFlights = flights.filter((flight) => isImportableFlightDate(flight.flightDate));

  return {
    flights: importableFlights,
    skippedBeforeCutoff: flights.length - importableFlights.length
  };
}

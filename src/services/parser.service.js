import { canParseAirlineCsv, parseAirlineCsv } from "../parsers/airlineCsvParser.js";
import { canParseSafeLogCsv, parseSafeLogCsv } from "../parsers/safelogCsvParser.js";

export function parseRosterFile(buffer, fileName) {
  const text = buffer.toString("utf8");

  if (canParseAirlineCsv(text)) {
    return {
      sourceFormat: "airline_export_csv",
      flights: parseAirlineCsv(text, fileName)
    };
  }

  if (canParseSafeLogCsv(text)) {
    return {
      sourceFormat: "safelog_csv",
      flights: parseSafeLogCsv(text, fileName)
    };
  }

  throw new Error("Unsupported file format. Try the airline export CSV or SafeLog CSV.");
}

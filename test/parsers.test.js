import assert from "node:assert/strict";
import { parseAirlineCsv } from "../src/parsers/airlineCsvParser.js";
import { parseSafeLogCsv } from "../src/parsers/safelogCsvParser.js";
import { parseRosterFile } from "../src/services/parser.service.js";
import { canonicalAirportCode } from "../src/utils/airportCodes.js";
import { normalizeAircraftModel } from "../src/utils/aircraft.js";
import { greatCircleDistanceNm, parseLidoCoordinate } from "../src/utils/geo.js";

const airline = `Date,Flight,DepPlace,DepTime,ArrPlace,ArrTime,ACType,Reg,FltTime,PicName,TKoffsDay,TKoffsNight,LandsDay,LandsNight,PIC,CoPlt,Instr,SimTime,SimType
01/05/26,7921,AMS,11:52,CHQ,15:12,319,OE-LKM,03:20,HES ARJAN,,,,,03:20,,,,
`;

const safelog = `Date;Aircraft Type;Aircraft Registration;Name of PIC;Holder's Operating Capacity;Departure;Departure Time;Arrival;Arrival Time;Total Flight Time;Day T-O;Day Ldg;Night T-O;Night Ldg;Day Single-Engine (SE) in Command;Day Single-Engine (SE) PICUS;Day Single-Engine (SE) Dual;Day Single-Engine (SE) P2;Day Multi-Engine (ME) in Command;Day Multi-Engine (ME) PICUS;Day Multi-Engine (ME) Co-Pilot;Day Multi-Engine (ME) Dual;Night Single-Engine (SE) in Command;Night Single-Engine (SE) PICUS;Night Single-Engine (SE) Dual;Night Single-Engine (SE) P2;Night Multi-Engine (ME) in Command;Night Multi-Engine (ME) PICUS;Night Multi-Engine (ME) Co-Pilot;Night Multi-Engine (ME) Dual;Simulator Sim.Type;Simulator Sim.Time;Instrument Flying;Instructor Flying;Any Other Flying;PF;PNF
2026-06-25;A320neo;OE-LSJ;SELF;PIC;EHAM;12:19 UTC;LMML;15:27 UTC;3:08;1;1;;;;;;;3:08;;;;;;;;;;;;;;;;;3:08;
`;

const safelogWithOldFlight = `Date;Aircraft Type;Aircraft Registration;Name of PIC;Holder's Operating Capacity;Departure;Departure Time;Arrival;Arrival Time;Total Flight Time;Day T-O;Day Ldg;Night T-O;Night Ldg;Day Single-Engine (SE) in Command;Day Single-Engine (SE) PICUS;Day Single-Engine (SE) Dual;Day Single-Engine (SE) P2;Day Multi-Engine (ME) in Command;Day Multi-Engine (ME) PICUS;Day Multi-Engine (ME) Co-Pilot;Day Multi-Engine (ME) Dual;Night Single-Engine (SE) in Command;Night Single-Engine (SE) PICUS;Night Single-Engine (SE) Dual;Night Single-Engine (SE) P2;Night Multi-Engine (ME) in Command;Night Multi-Engine (ME) PICUS;Night Multi-Engine (ME) Co-Pilot;Night Multi-Engine (ME) Dual;Simulator Sim.Type;Simulator Sim.Time;Instrument Flying;Instructor Flying;Any Other Flying;PF;PNF
2011-05-31;A320;OE-OLD;SELF;PIC;EHAM;08:00 UTC;EGKK;09:00 UTC;1:00;1;1;;;;;;;1:00;;;;;;;;;;;;;;;;;1:00;
2011-06-01;A320;OE-NEW;SELF;PIC;EHAM;10:00 UTC;EGKK;11:00 UTC;1:00;1;1;;;;;;;1:00;;;;;;;;;;;;;;;;;1:00;
`;

const [airlineFlight] = parseAirlineCsv(airline, "airline.csv");
assert.equal(airlineFlight.flightDate, "2026-05-01");
assert.equal(airlineFlight.flightNumber, "7921");
assert.equal(airlineFlight.departureAirport, "AMS");
assert.equal(airlineFlight.arrivalAirport, "CHQ");
assert.equal(airlineFlight.aircraftType, "A319");
assert.equal(airlineFlight.flightTimeMinutes, 200);
assert.equal(airlineFlight.displayCode, "20260501-7921-1152");

const [safeLogFlight] = parseSafeLogCsv(safelog, "safelog.csv");
assert.equal(safeLogFlight.flightDate, "2026-06-25");
assert.equal(safeLogFlight.departureAirport, "AMS");
assert.equal(safeLogFlight.arrivalAirport, "MLA");
assert.equal(safeLogFlight.departureTimeZone, "UTC");
assert.equal(safeLogFlight.flightTimeMinutes, 188);
assert.equal(safeLogFlight.displayCode, "20260625-AMS-MLA-1219");

const safeLogHeaders = safelog.trim().split("\n")[0].split(";");
const simulatorRow = Array(safeLogHeaders.length).fill("");
simulatorRow[safeLogHeaders.indexOf("Date")] = "2026-06-26";
simulatorRow[safeLogHeaders.indexOf("Aircraft Type")] = "A320";
simulatorRow[safeLogHeaders.indexOf("Simulator Sim.Type")] = "A320 FFS";
simulatorRow[safeLogHeaders.indexOf("Simulator Sim.Time")] = "4:00";
const simulatorCsv = `${safeLogHeaders.join(";")}\n${simulatorRow.join(";")}\n`;
assert.equal(parseSafeLogCsv(simulatorCsv, "safelog.csv").length, 0);

const filtered = parseRosterFile(Buffer.from(safelogWithOldFlight), "safelog.csv");
assert.equal(filtered.flights.length, 1);
assert.equal(filtered.flights[0].flightDate, "2011-06-01");
assert.equal(filtered.skippedBeforeCutoff, 1);

assert.equal(canonicalAirportCode("AMS"), "AMS");
assert.equal(canonicalAirportCode("EHAM"), "AMS");
assert.equal(canonicalAirportCode("CHQ"), "CHQ");
assert.equal(canonicalAirportCode("EDDB"), "BER");
assert.equal(canonicalAirportCode("Berlin-Schönefeld Airport (Closed)"), "SXF");
assert.equal(canonicalAirportCode("Berlin-Schonefeld Airport (Closed)"), "SXF");
assert.equal(normalizeAircraftModel("319"), "A319");
assert.equal(normalizeAircraftModel("A320neo"), "A320NEO");

const ams = parseLidoCoordinate("N 52 18.5 E 004 45.9");
assert.equal(Number(ams.latitude.toFixed(6)), 52.308333);
assert.equal(Number(ams.longitude.toFixed(6)), 4.765);

const sameAirportDistance = greatCircleDistanceNm(ams, ams);
assert.equal(Math.round(sameAirportDistance), 0);

console.log("Parser tests passed.");

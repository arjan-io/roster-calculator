import assert from "node:assert/strict";
import { parseAirlineCsv } from "../src/parsers/airlineCsvParser.js";
import { parseSafeLogCsv } from "../src/parsers/safelogCsvParser.js";

const airline = `Date,Flight,DepPlace,DepTime,ArrPlace,ArrTime,ACType,Reg,FltTime,PicName,TKoffsDay,TKoffsNight,LandsDay,LandsNight,PIC,CoPlt,Instr,SimTime,SimType
01/05/26,7921,AMS,11:52,CHQ,15:12,319,OE-LKM,03:20,HES ARJAN,,,,,03:20,,,,
`;

const safelog = `Date;Aircraft Type;Aircraft Registration;Name of PIC;Holder's Operating Capacity;Departure;Departure Time;Arrival;Arrival Time;Total Flight Time;Day T-O;Day Ldg;Night T-O;Night Ldg;Day Single-Engine (SE) in Command;Day Single-Engine (SE) PICUS;Day Single-Engine (SE) Dual;Day Single-Engine (SE) P2;Day Multi-Engine (ME) in Command;Day Multi-Engine (ME) PICUS;Day Multi-Engine (ME) Co-Pilot;Day Multi-Engine (ME) Dual;Night Single-Engine (SE) in Command;Night Single-Engine (SE) PICUS;Night Single-Engine (SE) Dual;Night Single-Engine (SE) P2;Night Multi-Engine (ME) in Command;Night Multi-Engine (ME) PICUS;Night Multi-Engine (ME) Co-Pilot;Night Multi-Engine (ME) Dual;Simulator Sim.Type;Simulator Sim.Time;Instrument Flying;Instructor Flying;Any Other Flying;PF;PNF
2026-06-25;A320neo;OE-LSJ;SELF;PIC;EHAM;12:19 UTC;LMML;15:27 UTC;3:08;1;1;;;;;;;3:08;;;;;;;;;;;;;;;;;3:08;
`;

const [airlineFlight] = parseAirlineCsv(airline, "airline.csv");
assert.equal(airlineFlight.flightDate, "2026-05-01");
assert.equal(airlineFlight.flightNumber, "7921");
assert.equal(airlineFlight.departureAirport, "AMS");
assert.equal(airlineFlight.arrivalAirport, "CHQ");
assert.equal(airlineFlight.flightTimeMinutes, 200);
assert.equal(airlineFlight.displayCode, "20260501-7921-1152");

const [safeLogFlight] = parseSafeLogCsv(safelog, "safelog.csv");
assert.equal(safeLogFlight.flightDate, "2026-06-25");
assert.equal(safeLogFlight.departureAirport, "EHAM");
assert.equal(safeLogFlight.arrivalAirport, "LMML");
assert.equal(safeLogFlight.departureTimeZone, "UTC");
assert.equal(safeLogFlight.flightTimeMinutes, 188);
assert.equal(safeLogFlight.displayCode, "20260625-EHAM-LMML-1219");

console.log("Parser tests passed.");

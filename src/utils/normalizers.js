import crypto from "node:crypto";

export function clean(value) {
  return String(value ?? "").trim();
}

export function normalizeAirport(value) {
  return clean(value).toUpperCase();
}

export function parseDate(value) {
  const input = clean(value);

  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return input;
  }

  const match = input.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
  if (!match) {
    return "";
  }

  const [, day, month, rawYear] = match;
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;
  return `${year}-${month}-${day}`;
}

export function splitTimeAndZone(value) {
  const input = clean(value);
  const match = input.match(/^(\d{1,2}:\d{2})(?:\s+([A-Za-z]+))?$/);

  if (!match) {
    return { time: input, zone: "" };
  }

  return {
    time: match[1].padStart(5, "0"),
    zone: (match[2] || "").toUpperCase()
  };
}

export function durationToMinutes(value) {
  const input = clean(value);
  const match = input.match(/^(\d{1,3}):(\d{2})$/);

  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

export function buildDisplayCode(flight) {
  const date = flight.flightDate.replaceAll("-", "");
  const route = `${flight.departureAirport}-${flight.arrivalAirport}`;
  const time = clean(flight.departureTime).replace(":", "");
  const flightNumber = clean(flight.flightNumber);

  return [date, flightNumber || route, time].filter(Boolean).join("-");
}

export function fingerprint(parts) {
  const normalized = parts.map((part) => clean(part).toUpperCase()).join("|");
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

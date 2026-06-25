import { AIRPORT_ALIASES } from "../config/airportAliases.js";
import { clean } from "./normalizers.js";

export function canonicalAirportCode(value) {
  const code = clean(value).toUpperCase();
  return AIRPORT_ALIASES[code] || code;
}

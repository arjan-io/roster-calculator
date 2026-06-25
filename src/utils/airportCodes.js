import { AIRPORT_ALIASES } from "../config/airportAliases.js";
import { clean } from "./normalizers.js";

export function canonicalAirportCode(value) {
  const code = clean(value).toUpperCase();
  const asciiCode = code.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  return AIRPORT_ALIASES[code] || AIRPORT_ALIASES[asciiCode] || code;
}

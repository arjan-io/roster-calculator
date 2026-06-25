export const MIN_FLIGHT_DATE = "2011-06-01";

export function isImportableFlightDate(flightDate) {
  return Boolean(flightDate) && flightDate >= MIN_FLIGHT_DATE;
}

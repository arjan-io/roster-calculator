export function parseLidoCoordinate(value) {
  const input = String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  const match = input.match(/^([NS])\s*(\d{1,2})\s+(\d{1,2}(?:\.\d+)?)\s+([EW])\s*(\d{1,3})\s+(\d{1,2}(?:\.\d+)?)$/);

  if (!match) {
    throw new Error("Use Lido format like N 52 18.5 E 004 45.9");
  }

  const [, latHemisphere, latDegrees, latMinutes, lonHemisphere, lonDegrees, lonMinutes] = match;
  const latitude = toDecimalDegrees(latHemisphere, latDegrees, latMinutes);
  const longitude = toDecimalDegrees(lonHemisphere, lonDegrees, lonMinutes);

  return { latitude, longitude };
}

export function greatCircleDistanceNm(from, to) {
  const earthRadiusNm = 3440.07;
  const lat1 = toRadians(from.latitude);
  const lon1 = toRadians(from.longitude);
  const lat2 = toRadians(to.latitude);
  const lon2 = toRadians(to.longitude);
  const deltaLat = lat2 - lat1;
  const deltaLon = lon2 - lon1;

  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;

  return earthRadiusNm * 2 * Math.asin(Math.sqrt(haversine));
}

function toDecimalDegrees(hemisphere, degrees, minutes) {
  const value = Number(degrees) + Number(minutes) / 60;
  return hemisphere === "S" || hemisphere === "W" ? -value : value;
}

function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

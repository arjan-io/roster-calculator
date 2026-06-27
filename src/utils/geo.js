export function parseLidoCoordinate(value) {
  const input = normalizeLidoCoordinate(value);
  const match = input.match(/^([NS]) (\d{1,2}) (\d{1,2}(?:\.\d+)?) ([EW]) (\d{1,3}) (\d{1,2}(?:\.\d+)?)$/);

  if (!match) {
    throw new Error("Use coordinates like N5040.5 E00429.1");
  }

  const [, latHemisphere, latDegrees, latMinutes, lonHemisphere, lonDegrees, lonMinutes] = match;
  const latitude = toDecimalDegrees(latHemisphere, latDegrees, latMinutes);
  const longitude = toDecimalDegrees(lonHemisphere, lonDegrees, lonMinutes);

  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || Number(latMinutes) >= 60 || Number(lonMinutes) >= 60) {
    throw new Error("The coordinate is outside the valid latitude or longitude range.");
  }

  return { latitude, longitude, formatted: input };
}

export function normalizeLidoCoordinate(value) {
  const input = String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
  const match = input.match(/^([NS])(\d{1,2})(\d{2}(?:\.\d+)?)([EW])(\d{1,3})(\d{2}(?:\.\d+)?)$/);

  if (!match) {
    return String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  }

  const [, latHemisphere, latDegrees, latMinutes, lonHemisphere, lonDegrees, lonMinutes] = match;
  return `${latHemisphere} ${latDegrees.padStart(2, "0")} ${latMinutes} ${lonHemisphere} ${lonDegrees.padStart(3, "0")} ${lonMinutes}`;
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

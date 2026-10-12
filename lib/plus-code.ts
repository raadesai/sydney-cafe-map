// Open Location Code (plus code) decoding, per the public spec:
// https://github.com/google/open-location-code/blob/main/docs/specification.md
// iOS Google Maps share links resolve to ?q=<short plus code> <name>, <address>
// with no coordinates in the URL, so we decode the plus code instead.

const ALPHABET = "23456789CFGHJMPQRVWX";
const PAIR_RESOLUTIONS = [20, 1, 0.05, 0.0025, 0.000125];

// The '+' often arrives decoded as a space (q=V4WV+828+... URL-decodes to "V4WV 828 ...").
// The alphabet has no vowels, so real place names essentially never false-match.
export const SHORT_PLUS_CODE_RE = /^([2-9CFGHJMPQRVWX]{4,8})[+ ]([2-9CFGHJMPQRVWX]{2,3}) +/;

export function decodePlusCode(code: string): { lat: number; lng: number } {
  const digits = code.toUpperCase().replace("+", "");
  let lat = -90;
  let lng = -180;

  const pairCount = Math.min(Math.floor(digits.length / 2), 5);
  for (let i = 0; i < pairCount; i++) {
    lat += ALPHABET.indexOf(digits[i * 2]) * PAIR_RESOLUTIONS[i];
    lng += ALPHABET.indexOf(digits[i * 2 + 1]) * PAIR_RESOLUTIONS[i];
  }
  let latRes = PAIR_RESOLUTIONS[pairCount - 1];
  let lngRes = PAIR_RESOLUTIONS[pairCount - 1];

  // Past 10 digits, each digit refines within a 5-row x 4-column grid.
  for (let i = 10; i < digits.length; i++) {
    const d = ALPHABET.indexOf(digits[i]);
    latRes /= 5;
    lngRes /= 4;
    lat += Math.floor(d / 4) * latRes;
    lng += (d % 4) * lngRes;
  }

  return { lat: lat + latRes / 2, lng: lng + lngRes / 2 };
}

function encodePrefix(lat: number, lng: number, digits: number): string {
  let latVal = lat + 90;
  let lngVal = lng + 180;
  let code = "";
  for (let i = 0; i < digits / 2; i++) {
    const res = PAIR_RESOLUTIONS[i];
    const latDigit = Math.floor(latVal / res);
    const lngDigit = Math.floor(lngVal / res);
    code += ALPHABET[latDigit] + ALPHABET[lngDigit];
    latVal -= latDigit * res;
    lngVal -= lngDigit * res;
  }
  return code;
}

// Recover a short code (e.g. "V4WV+828") to exact coordinates using a nearby
// reference point. The reference only needs to be within ~a city of the place.
export function recoverPlusCode(
  shortCode: string,
  refLat: number,
  refLng: number
): { lat: number; lng: number } {
  const separatorIndex = shortCode.indexOf("+");
  const omitted = 8 - separatorIndex;
  const prefix = encodePrefix(refLat, refLng, omitted);
  const candidate = decodePlusCode(prefix + shortCode.toUpperCase());

  // Snap to the cell nearest the reference (the prefix cell may be off by one).
  const cellSize = PAIR_RESOLUTIONS[omitted / 2 - 1];
  let { lat, lng } = candidate;
  if (lat - refLat > cellSize / 2) lat -= cellSize;
  else if (refLat - lat > cellSize / 2) lat += cellSize;
  if (lng - refLng > cellSize / 2) lng -= cellSize;
  else if (refLng - lng > cellSize / 2) lng += cellSize;

  return { lat, lng };
}

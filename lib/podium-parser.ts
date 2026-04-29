import type { ChannelValue, LapRecord, ParsedEventInfo, Sensor } from "./types";

// Extracts eventId and deviceId from a Podium URL.
// Supports /events/<eventId>/device/<deviceId> and /event/...
export function parseUrlIds(url: string): { eventId: string; deviceId: string } | null {
  const m = url.match(/\/events?\/([^/]+)\/devices?\/([^/?#]+)/);
  if (!m) return null;
  return { eventId: m[1], deviceId: m[2] };
}

// Finds the closing } for a balanced { starting at startIdx in src.
function extractBalancedObject(src: string, startIdx: number): string | null {
  let depth = 0;
  let inString = false;
  let escape = false;
  let stringChar = "";
  for (let i = startIdx; i < src.length; i++) {
    const ch = src[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\" && inString) { escape = true; continue; }
    if ((ch === '"' || ch === "'") && !inString) { inString = true; stringChar = ch; continue; }
    if (inString && ch === stringChar) { inString = false; continue; }
    if (inString) continue;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return src.slice(startIdx, i + 1);
    }
  }
  return null;
}

// The Podium page embeds config as:
//   RC.Apps.RCLive(
//     {'container': '#app',
//      'sensorList': {"SensorName": {index, max, min, units, precision}, ...},
//      'eventDeviceId': 77407,
//      ...
//     }
//   )
//
// Outer dict uses single-quoted JS keys (not valid JSON).
// sensorList value is standard JSON with double-quoted keys.

function extractSensorList(html: string): Sensor[] | null {
  // sensorList value is a double-quoted JSON object immediately after 'sensorList':
  const m = html.match(/'sensorList'\s*:\s*(\{)/);
  if (!m || m.index === undefined) return null;

  const openIdx = m.index + m[0].length - 1;
  const raw = extractBalancedObject(html, openIdx);
  if (!raw) return null;

  try {
    const obj = JSON.parse(raw) as Record<
      string,
      { index: number; max?: number; min?: number; units?: string; precision?: number; sampleRate?: number }
    >;
    return Object.entries(obj).map(([name, data]) => ({
      name,
      index: data.index,
      max: data.max,
      min: data.min,
      units: data.units,
      precision: data.precision,
    }));
  } catch {
    return null;
  }
}

// eventDeviceId is a bare integer in the config: 'eventDeviceId': 77407
function extractEventDeviceId(html: string): string | null {
  const m = html.match(/'eventDeviceId'\s*:\s*(\d+)/);
  return m ? m[1] : null;
}

// Display names, event title, and internal numeric IDs from the embedded config objects.
function extractNames(
  html: string,
  deviceId: string
): { displayName: string; deviceName: string; eventTitle: string; eventNumericId: number | null; deviceNumericId: number | null } {
  let displayName = deviceId;
  let eventTitle = "";
  let eventNumericId: number | null = null;
  let deviceNumericId: number | null = null;

  const edm = html.match(/'eventDevice'\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/);
  if (edm) displayName = edm[1];

  const em = html.match(/'event'\s*:\s*\{[^}]*title\s*:\s*'([^']+)'[^}]*\bid\s*:\s*(\d+)/);
  if (em) {
    eventTitle = em[1];
    eventNumericId = parseInt(em[2], 10);
  } else {
    const et = html.match(/'event'\s*:\s*\{[^}]*title\s*:\s*'([^']+)'/);
    if (et) eventTitle = et[1];
  }

  const dm = html.match(/'device'\s*:\s*\{"id"\s*:\s*(\d+)\}/);
  if (dm) deviceNumericId = parseInt(dm[1], 10);

  if (displayName === deviceId) {
    const tm = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (tm) displayName = tm[1].trim();
  }

  return { displayName, deviceName: displayName, eventTitle, eventNumericId, deviceNumericId };
}

// lapData is a JSON array embedded in the config:
// [{"id":3544232,"lap_time":3735928559.0,"end_time":1777427571000}, ...]
function extractLapData(html: string): LapRecord[] {
  const m = html.match(/'lapData'\s*:\s*(\[)/);
  if (!m || m.index === undefined) return [];
  // Find the closing ] by scanning for the balanced bracket
  const start = m.index + m[0].length - 1;
  let depth = 0;
  for (let i = start; i < Math.min(start + 20000, html.length); i++) {
    if (html[i] === "[") depth++;
    else if (html[i] === "]") {
      depth--;
      if (depth === 0) {
        try {
          const arr = JSON.parse(html.slice(start, i + 1)) as LapRecord[];
          // Assign sequential lap numbers (1-based), skip laps with end_time=0
          let lapNum = 0;
          return arr.map((lap) => {
            if ((lap.end_time ?? 0) > 0) lapNum++;
            return { ...lap, lap_number: (lap.end_time ?? 0) > 0 ? lapNum : undefined };
          });
        } catch { return []; }
      }
    }
  }
  return [];
}

export async function parsePodiumPage(url: string): Promise<ParsedEventInfo> {
  const ids = parseUrlIds(url);
  if (!ids) throw new Error("Could not parse eventId/deviceId from URL");
  const { eventId, deviceId } = ids;

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    if (res.status === 404) throw new Error("Event/device not found (404).");
    if (res.status === 403) throw new Error("Event/device is private (403).");
    throw new Error(`HTTP ${res.status} fetching event page`);
  }

  const html = await res.text();

  const sensorList = extractSensorList(html);
  const eventDeviceId = extractEventDeviceId(html);
  const { displayName, deviceName, eventTitle, eventNumericId, deviceNumericId } = extractNames(html, deviceId);
  const lapData = extractLapData(html);

  return {
    eventId,
    deviceId,
    eventDeviceId,
    eventNumericId,
    deviceNumericId,
    displayName,
    deviceName,
    eventTitle,
    sensorList: sensorList ?? [],
    lapData,
    rawConfig: null,
  };
}

// Decodes the named-channel values array from a sensorData packet.
// Each element is self-describing: {name, value} or {name, latitude, longitude}.
// The sensorList is only used for metadata (units/precision) — not for decoding.
export function decodeSensorValues(values: ChannelValue[]): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  for (const v of values) {
    if ("value" in v) {
      result[v.name] = v.value;
    } else if ("latitude" in v) {
      const pos = v as { name: string; latitude: number; longitude: number };
      result["GPS_Latitude"] = pos.latitude;
      result["GPS_Longitude"] = pos.longitude;
    }
  }
  return result;
}

// Build a fast name→Sensor lookup map from a sensorList.
export function buildSensorMap(sensors: Sensor[]): Map<string, Sensor> {
  return new Map(sensors.map((s) => [s.name, s]));
}

export function formatValue(value: number | null | undefined, sensor: Sensor | undefined): string {
  if (value === null || value === undefined) return "—";
  const prec = sensor?.precision ?? 2;
  return value.toFixed(prec);
}

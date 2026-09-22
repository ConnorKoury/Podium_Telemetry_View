export const runtime = "edge";
export const revalidate = 3600; // cache for 1 hour at the edge

import { NextResponse } from "next/server";
import type { ParsedEventInfo, Sensor } from "@/lib/types";

const PODIUM_BASE = "https://podium.live";
const PODIUM_API = `${PODIUM_BASE}/api/v1`;

function cookieJar(setCookies: string[]): Map<string, string> {
  const jar = new Map<string, string>();
  for (const raw of setCookies) {
    const pair = raw.split(";")[0] ?? "";
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
  return jar;
}

function jarHeader(jar: Map<string, string>): string {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function podiumLogin(): Promise<string> {
  const email = process.env.PODIUM_EMAIL;
  const password = process.env.PODIUM_PASSWORD;
  if (!email || !password) throw new Error("PODIUM_EMAIL / PODIUM_PASSWORD not set");

  // Get CSRF token from login page
  const loginPage = await fetch(`${PODIUM_BASE}/users/sign_in`, {
    redirect: "manual",
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const html = await loginPage.text();
  const csrfMatch = html.match(/name="authenticity_token"\s+value="([^"]+)"/);
  if (!csrfMatch) throw new Error("Could not extract CSRF token from Podium login page");
  const csrfToken = csrfMatch[1];

  const jar = cookieJar(loginPage.headers.getSetCookie?.() ?? []);

  const body = new URLSearchParams({
    authenticity_token: csrfToken,
    "user[email]": email,
    "user[password]": password,
  });

  const loginRes = await fetch(`${PODIUM_BASE}/users/sign_in`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: jarHeader(jar),
      "User-Agent": "Mozilla/5.0",
      Referer: `${PODIUM_BASE}/users/sign_in`,
    },
    body: body.toString(),
    redirect: "manual",
  });

  // A later Set-Cookie for the same name replaces the pre-login session.
  // Sending both makes Podium keep the logged-out cookie and return 403.
  for (const [name, value] of cookieJar(loginRes.headers.getSetCookie?.() ?? [])) {
    jar.set(name, value);
  }

  if (loginRes.status !== 302 && loginRes.status !== 303) {
    throw new Error(`Podium login failed (status ${loginRes.status})`);
  }
  if (!jar.has("_rclive_session_")) {
    throw new Error("Podium login failed — no session cookie returned");
  }
  return jarHeader(jar);
}

async function podiumGet<T>(path: string, cookie: string): Promise<T> {
  const res = await fetch(`${PODIUM_API}${path}`, {
    headers: { Accept: "application/json", Cookie: cookie },
  });
  if (!res.ok) throw new Error(`Podium API ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

interface PodiumEvent { id: number; title?: string }
interface PodiumEventDevice {
  id: number;
  URI?: string;
  name?: string;
  title?: string;
  device_id?: number;
  event_id?: number;
  channels?: Array<{ name: string; units?: string | null; min?: number; max?: number; precision?: number }>;
}

export async function GET() {
  const userId = process.env.PODIUM_USER_ID ?? "9034";
  const deviceId = process.env.PODIUM_DEVICE_ID ?? "6160";

  try {
    const cookie = await podiumLogin();

    const eventsData = await podiumGet<{ events: PodiumEvent[] }>(
      `/users/${userId}/events?per_page=1`,
      cookie,
    );
    const latestEvent = eventsData.events[0];
    if (!latestEvent) throw new Error("No events found for Podium user");

    let ed: PodiumEventDevice;
    try {
      const edData = await podiumGet<{ eventdevice: PodiumEventDevice }>(
        `/events/${latestEvent.id}/devices/${deviceId}`,
        cookie,
      );
      ed = edData.eventdevice;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("403")) throw err;
      // Detail is private. The device list is public and still has the event-device id.
      const list = await podiumGet<{ eventdevices: PodiumEventDevice[] }>(
        `/events/${latestEvent.id}/devices`,
        cookie,
      );
      const match = list.eventdevices.find((device) =>
        device.URI?.endsWith(`/devices/${deviceId}`),
      );
      if (!match) throw err;
      ed = match;
    }

    const sensorList: Sensor[] = (ed.channels ?? []).map((ch, i) => ({
      index: i,
      name: ch.name,
      units: ch.units ?? undefined,
      min: ch.min,
      max: ch.max,
      precision: ch.precision,
    }));

    const info: ParsedEventInfo = {
      eventId: String(latestEvent.id),
      deviceId: "novaracing-telemetry",
      eventDeviceId: String(ed.id),
      eventNumericId: latestEvent.id,
      deviceNumericId: Number(deviceId),
      displayName: ed.name ?? "NovaRacing Telemetry",
      deviceName: ed.name ?? "NovaRacing Telemetry",
      eventTitle: ed.title ?? latestEvent.title ?? "",
      sensorList,
      lapData: [],
      rawConfig: null,
    };

    return NextResponse.json(info);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

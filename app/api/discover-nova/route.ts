export const runtime = "edge";
export const revalidate = 3600; // cache for 1 hour at the edge

import { NextResponse } from "next/server";
import type { ParsedEventInfo, Sensor } from "@/lib/types";

const PODIUM_BASE = "https://podium.live";
const PODIUM_API = `${PODIUM_BASE}/api/v1`;

async function podiumLogin(): Promise<string> {
  const email = process.env.PODIUM_EMAIL;
  const password = process.env.PODIUM_PASSWORD;
  if (!email || !password) throw new Error("PODIUM_EMAIL / PODIUM_PASSWORD not set");

  // Get CSRF token from login page
  const loginPage = await fetch(`${PODIUM_BASE}/users/sign_in`, { redirect: "manual" });
  const html = await loginPage.text();
  const csrfMatch = html.match(/name="authenticity_token"\s+value="([^"]+)"/);
  if (!csrfMatch) throw new Error("Could not extract CSRF token from Podium login page");
  const csrfToken = csrfMatch[1];

  const setCookieHeaders = loginPage.headers.getSetCookie?.() ?? [];
  const sessionCookie = setCookieHeaders
    .map((h) => h.split(";")[0])
    .join("; ");

  const body = new URLSearchParams({
    authenticity_token: csrfToken,
    "user[email]": email,
    "user[password]": password,
  });

  const loginRes = await fetch(`${PODIUM_BASE}/users/sign_in`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: sessionCookie,
    },
    body: body.toString(),
    redirect: "manual",
  });

  const allCookies = [
    ...setCookieHeaders,
    ...(loginRes.headers.getSetCookie?.() ?? []),
  ]
    .map((h) => h.split(";")[0])
    .join("; ");

  if (!allCookies.includes("_rclive_session_")) {
    throw new Error("Podium login failed — no session cookie returned");
  }
  return allCookies;
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

    const edData = await podiumGet<{ eventdevice: PodiumEventDevice }>(
      `/events/${latestEvent.id}/devices/${deviceId}`,
      cookie,
    );
    const ed = edData.eventdevice;

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

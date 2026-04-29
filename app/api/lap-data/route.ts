export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { getPodiumCookie, invalidatePodiumCookie } from "@/lib/podium-auth";
import type { ChannelValue, TimeSeriesPoint } from "@/lib/types";

// Fetches recorded lap channel data from Podium.
// Query params: eventNumericId, deviceNumericId, lapNumber
// Returns: { points: TimeSeriesPoint[], channels: string[] }
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const eventId = searchParams.get("eventNumericId");
  const deviceId = searchParams.get("deviceNumericId");
  const lapNumber = searchParams.get("lapNumber");

  if (!eventId || !deviceId || !lapNumber) {
    return NextResponse.json({ error: "Missing eventNumericId, deviceNumericId, or lapNumber" }, { status: 400 });
  }

  const url = `https://podium.live/event/${eventId}/device/${deviceId}/lap/${lapNumber}`;

  async function fetchLap(cookie: string) {
    return fetch(url, {
      headers: {
        Cookie: cookie,
        "User-Agent": "Mozilla/5.0",
      },
      signal: AbortSignal.timeout(30_000),
    });
  }

  let cookie = await getPodiumCookie();
  let res = await fetchLap(cookie);

  if (res.status === 401 || res.status === 403) {
    invalidatePodiumCookie();
    cookie = await getPodiumCookie();
    res = await fetchLap(cookie);
  }

  if (!res.ok) {
    return NextResponse.json({ error: `Podium returned ${res.status}` }, { status: res.status });
  }

  const text = await res.text();
  const lines = text.split("\n").filter(Boolean);

  const points: TimeSeriesPoint[] = [];
  const channelSet = new Set<string>();

  for (const line of lines) {
    try {
      const pkt = JSON.parse(line) as {
        timestamp: { $date: string };
        values: ChannelValue[];
      };
      const t = new Date(pkt.timestamp.$date).getTime();
      const point: TimeSeriesPoint = { t };
      for (const v of pkt.values) {
        if ("value" in v) {
          point[v.name] = v.value;
          channelSet.add(v.name);
        }
      }
      points.push(point);
    } catch {
      // skip malformed lines
    }
  }

  // Downsample to ~500 points if too large (keep every Nth)
  let sampled = points;
  if (points.length > 500) {
    const step = Math.ceil(points.length / 500);
    sampled = points.filter((_, i) => i % step === 0);
  }

  return NextResponse.json({
    points: sampled,
    channels: Array.from(channelSet).sort(),
    totalPackets: points.length,
  });
}

export const runtime = "edge";

import { NextResponse } from "next/server";

const PODIUM_WS_URLS = [
  "wss://telemetry.podium.live/eventbus/websocket",
  "wss://telemetry.podium.live/eventbus",
  "wss://telemetry.podium.live",
];

interface Session {
  eventDeviceId: string;
  active: boolean;
}

function fetchSessionsFromUrl(url: string): Promise<{ sessions: Session[]; source: string }> {
  return new Promise((resolve, reject) => {
    const replyAddress = `reply.list.${Date.now()}.${Math.random().toString(36).slice(2)}`;
    let settled = false;

    const settle = (v: { sessions: Session[]; source: string } | Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* already closed */ }
      if (v instanceof Error) reject(v);
      else resolve(v);
    };

    const timer = setTimeout(() => settle(new Error(`Timeout on ${url}`)), 10_000);
    const ws = new WebSocket(url);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "ping" }));
      ws.send(JSON.stringify({
        type: "send",
        address: "listTelemetryStreamSessions",
        headers: {},
        body: {},
        replyAddress,
      }));
    };

    ws.onmessage = (ev) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(ev.data as string) as Record<string, unknown>; }
      catch { return; }
      if (typeof msg.address !== "string") return;
      if (msg.address === replyAddress) {
        const body = msg.body as Record<string, unknown> | undefined;
        const ids: number[] = (body?.status === "ok" && Array.isArray(body?.values))
          ? (body.values as number[])
          : [];
        settle({
          sessions: ids.map((id) => ({ eventDeviceId: String(id), active: true })),
          source: url,
        });
      }
    };

    ws.onerror = () => settle(new Error(`WebSocket error on ${url}`));
    ws.onclose = (ev) => { if (!settled) settle(new Error(`WS closed (${ev.code})`)); };
  });
}

async function getSessions(): Promise<{ sessions: Session[]; source: string }> {
  for (const url of PODIUM_WS_URLS) {
    try {
      return await fetchSessionsFromUrl(url);
    } catch { /* try next */ }
  }
  return { sessions: [], source: "none" };
}

export async function GET() {
  try {
    const result = await getSessions();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, sessions: [] }, { status: 502 });
  }
}

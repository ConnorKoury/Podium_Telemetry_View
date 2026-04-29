import type { ServerWebSocket } from "bun";

const WS_PORT = parseInt(Bun.env.WS_PORT ?? "3001", 10);

const PODIUM_WS_URLS = [
  "wss://telemetry.podium.live/eventbus/websocket",
  "wss://telemetry.podium.live/eventbus",
  "wss://telemetry.podium.live",
];

// ─── Session fetching (HTTP /sessions endpoint) ──────────────────────────────

interface TelemetrySession {
  eventDeviceId: string;
  active: boolean;
}

function fetchSessionsFromPodium(url: string): Promise<{ sessions: TelemetrySession[]; source: string }> {
  return new Promise((resolve, reject) => {
    const replyAddress = `reply.list.${Date.now()}.${Math.random().toString(36).slice(2)}`;
    let settled = false;

    const settle = (v: { sessions: TelemetrySession[]; source: string } | Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
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

      // Reply comes back addressed to our replyAddress (no "type" field)
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

// Subscribes to a session briefly and returns true if at least one data packet arrives.
// This filters out ghost connections — devices registered but not transmitting.
function verifySessionActive(wsUrl: string, eventDeviceId: string, timeoutMs = 2500): Promise<boolean> {
  return new Promise((resolve) => {
    let resolved = false;
    const done = (active: boolean) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* ignore */ }
      resolve(active);
    };

    const timer = setTimeout(() => done(false), timeoutMs);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "ping" }));
      ws.send(JSON.stringify({
        type: "send",
        address: "subscribe",
        headers: {},
        body: { eventDeviceId },
        replyAddress: `verify.${Date.now()}`,
      }));
    };

    ws.onmessage = (ev) => {
      let msg: Record<string, unknown>;
      try { msg = JSON.parse(ev.data as string) as Record<string, unknown>; }
      catch { return; }
      // A real data packet has an address that isn't our reply and has a body with values/timestamp
      if (
        typeof msg.address === "string" &&
        !msg.address.startsWith("verify.") &&
        msg.body &&
        typeof msg.body === "object" &&
        "values" in (msg.body as object)
      ) {
        done(true);
      }
    };

    ws.onerror = () => done(false);
    ws.onclose = () => { if (!resolved) done(false); };
  });
}

async function getSessions(): Promise<{ sessions: TelemetrySession[]; source: string }> {
  for (const url of PODIUM_WS_URLS) {
    try {
      const { sessions, source } = await fetchSessionsFromPodium(url);
      if (sessions.length === 0) return { sessions, source };

      // Verify each session actually has live data — filter out ghost connections
      const verified = await Promise.all(
        sessions.map(async (s) => {
          const active = await verifySessionActive(url, s.eventDeviceId);
          return { ...s, active };
        })
      );
      return { sessions: verified.filter((s) => s.active), source };
    } catch {
      // try next
    }
  }
  throw new Error("All Podium WS endpoints failed or returned no sessions");
}

// ─── Live telemetry proxy (WebSocket /ws) ────────────────────────────────────

type ClientData = {
  podiumWs: WebSocket | null;
  pingTimer: ReturnType<typeof setInterval> | null;
};

function connectToPodium(client: ServerWebSocket<ClientData>, urlIdx: number) {
  if (urlIdx >= PODIUM_WS_URLS.length) {
    try { client.send(JSON.stringify({ type: "proxy_error", message: "All Podium WS endpoints failed" })); }
    catch { /* client closed */ }
    return;
  }

  const url = PODIUM_WS_URLS[urlIdx];
  console.log(`[WS] Trying ${url}`);

  const podium = new WebSocket(url);

  podium.onopen = () => {
    console.log(`[WS] Connected to ${url}`);
    client.data.podiumWs = podium;
    try { client.send(JSON.stringify({ type: "proxy_connected", url })); }
    catch { /* client closed */ }

    client.data.pingTimer = setInterval(() => {
      if (podium.readyState === WebSocket.OPEN) {
        podium.send(JSON.stringify({ type: "ping" }));
      }
    }, 5_000);
  };

  podium.onmessage = (event) => {
    try { client.send(event.data as string); } catch { /* client closed */ }
  };

  podium.onclose = (event) => {
    if (client.data.pingTimer) clearInterval(client.data.pingTimer);
    try {
      client.send(JSON.stringify({ type: "proxy_disconnected", code: event.code, reason: event.reason }));
    } catch { /* client closed */ }
  };

  podium.onerror = () => {
    console.error(`[WS] Error on ${url}`);
    if (urlIdx < PODIUM_WS_URLS.length - 1) {
      connectToPodium(client, urlIdx + 1);
    } else {
      try { client.send(JSON.stringify({ type: "proxy_error", message: "Failed on all Podium endpoints" })); }
      catch { /* client closed */ }
    }
  };
}

// ─── Server ──────────────────────────────────────────────────────────────────

Bun.serve<ClientData>({
  port: WS_PORT,
  async fetch(req, server) {
    const url = new URL(req.url);

    // HTTP endpoint: GET /sessions — fetch live sessions from Podium
    if (req.method === "GET" && url.pathname === "/sessions") {
      try {
        const result = await getSessions();
        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return new Response(JSON.stringify({ error: msg, sessions: [], source: null }), {
          status: 502,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });
      }
    }

    // WebSocket upgrade: /ws
    const upgraded = server.upgrade(req, {
      data: { podiumWs: null, pingTimer: null },
    });
    if (upgraded) return undefined;

    return new Response("NovaRacing WS Proxy — /ws (WebSocket) · /sessions (GET)", { status: 200 });
  },
  websocket: {
    open(ws) {
      console.log("[WS] Client connected");
      connectToPodium(ws, 0);
    },
    message(ws, data) {
      const podium = ws.data.podiumWs;
      if (podium?.readyState === WebSocket.OPEN) {
        podium.send(data.toString());
      }
    },
    close(ws) {
      console.log("[WS] Client disconnected");
      if (ws.data.pingTimer) clearInterval(ws.data.pingTimer);
      ws.data.podiumWs?.close(1000);
    },
  },
});

console.log(`[WS] Proxy ready → ws://localhost:${WS_PORT}/ws  |  http://localhost:${WS_PORT}/sessions`);

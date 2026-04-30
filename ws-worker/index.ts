const PODIUM_WS_URLS = [
  "wss://telemetry.podium.live/eventbus/websocket",
  "wss://telemetry.podium.live/eventbus",
  "wss://telemetry.podium.live",
];

function handleWsProxy(): Response {
  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];

  server.accept();

  let podium: WebSocket | null = null;
  let urlIdx = 0;

  function tryConnect(): void {
    if (urlIdx >= PODIUM_WS_URLS.length) {
      try { server.send(JSON.stringify({ type: "proxy_error", message: "All Podium WS endpoints failed" })); } catch { /* closed */ }
      server.close(1011);
      return;
    }

    const url = PODIUM_WS_URLS[urlIdx]!;
    const ws = new WebSocket(url);
    podium = ws;

    ws.addEventListener("open", () => {
      try { server.send(JSON.stringify({ type: "proxy_connected", url })); } catch { /* closed */ }
    });

    ws.addEventListener("message", (e: MessageEvent) => {
      try { server.send(e.data as string); } catch { /* closed */ }
    });

    ws.addEventListener("close", (e: CloseEvent) => {
      try { server.send(JSON.stringify({ type: "proxy_disconnected", code: e.code })); } catch { /* closed */ }
    });

    ws.addEventListener("error", () => {
      urlIdx++;
      tryConnect();
    });
  }

  server.addEventListener("message", (e: MessageEvent) => {
    if (podium?.readyState === WebSocket.OPEN) {
      try { podium.send(e.data as string); } catch { /* closed */ }
    }
  });

  server.addEventListener("close", () => {
    try { podium?.close(1000); } catch { /* already closed */ }
  });

  tryConnect();

  return new Response(null, { status: 101, webSocket: client });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
        },
      });
    }

    if (url.pathname === "/ws" && request.headers.get("Upgrade") === "websocket") {
      return handleWsProxy();
    }

    return new Response("NovaRacing WebSocket Proxy — connect to /ws", { status: 200 });
  },
};

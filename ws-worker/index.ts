const PODIUM_WS_URLS = [
  "wss://telemetry.podium.live/eventbus/websocket",
  "wss://telemetry.podium.live/eventbus",
  "wss://telemetry.podium.live",
];

function toText(data: string | ArrayBuffer): string {
  return typeof data === "string" ? data : new TextDecoder().decode(data);
}

function handleWsProxy(): Response {
  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];

  server.accept();

  let podiumRef: WebSocket | null = null;

  // Forward browser → Podium (fires after proxy_connected since browser waits for it)
  server.addEventListener("message", (e: MessageEvent) => {
    if (podiumRef?.readyState === WebSocket.OPEN) {
      try { podiumRef.send(toText(e.data as string | ArrayBuffer)); } catch { /* closed */ }
    }
  });

  server.addEventListener("close", () => {
    try { podiumRef?.close(1000); } catch { /* already closed */ }
  });

  // Connect to Podium asynchronously with spoofed Origin so Podium accepts us
  (async () => {
    let connectedUrl = "";

    for (const url of PODIUM_WS_URLS) {
      try {
        const res = await fetch(url, {
          headers: {
            Upgrade: "websocket",
            Connection: "Upgrade",
            Origin: "https://podium.live",
            "User-Agent": "Mozilla/5.0",
            "Sec-WebSocket-Version": "13",
          },
        });
        const ws = (res as unknown as { webSocket: WebSocket | null }).webSocket;
        if (res.status === 101 && ws) {
          ws.accept();
          podiumRef = ws;
          connectedUrl = url;
          break;
        }
      } catch { /* try next */ }
    }

    if (!podiumRef) {
      try { server.send(JSON.stringify({ type: "proxy_error", message: "All Podium WS endpoints failed" })); } catch { /* closed */ }
      server.close(1011);
      return;
    }

    try { server.send(JSON.stringify({ type: "proxy_connected", url: connectedUrl })); } catch { return; }

    // Forward Podium → browser
    podiumRef.addEventListener("message", (e: MessageEvent) => {
      try { server.send(toText(e.data as string | ArrayBuffer)); } catch { /* closed */ }
    });

    podiumRef.addEventListener("close", (e: CloseEvent) => {
      try { server.send(JSON.stringify({ type: "proxy_disconnected", code: e.code })); } catch { /* closed */ }
    });

    podiumRef.addEventListener("error", () => {
      try { server.send(JSON.stringify({ type: "proxy_error", message: "Podium connection error" })); } catch { /* closed */ }
    });
  })();

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

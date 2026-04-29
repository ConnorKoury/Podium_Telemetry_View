export const runtime = "edge";

import { NextResponse } from "next/server";

// In local dev, delegates to the Bun ws-server.ts process.
// On Cloudflare Pages, WS_SERVER_URL should point to a deployed ws-server instance.
// If unset in production, live session listing is unavailable (history/lap loading still works).
const WS_SERVER =
  process.env.WS_SERVER_URL ??
  `http://localhost:${process.env.WS_PORT ?? "3001"}`;

export async function GET() {
  if (!WS_SERVER) {
    return NextResponse.json(
      { error: "Live session listing unavailable — no WS_SERVER_URL configured.", sessions: [] },
      { status: 503 }
    );
  }
  try {
    const res = await fetch(`${WS_SERVER}/sessions`, {
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const hint =
      message.includes("ECONNREFUSED") || message.includes("fetch failed")
        ? "WS proxy not running — start the server with `bun run dev`"
        : message;
    return NextResponse.json({ error: hint, sessions: [] }, { status: 502 });
  }
}

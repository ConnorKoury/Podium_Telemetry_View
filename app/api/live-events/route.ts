export const runtime = "edge";

import { NextResponse } from "next/server";

export async function GET() {
  const wsServer = process.env.WS_SERVER_URL ?? null;

  if (!wsServer) {
    return NextResponse.json(
      { error: "Live session listing unavailable — no WS_SERVER_URL configured.", sessions: [] },
      { status: 503 }
    );
  }
  try {
    const res = await fetch(`${wsServer}/sessions`, {
      signal: AbortSignal.timeout(15_000),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message, sessions: [] }, { status: 502 });
  }
}

export const runtime = "edge";

import { NextResponse } from "next/server";

// Session listing is handled client-side via the local Bun WS proxy (localhost:3001/sessions).
// This endpoint is kept for compatibility but is no longer the primary path.
export async function GET() {
  return NextResponse.json(
    { sessions: [], error: "Use the local Bun server for live session listing." },
    { status: 503 }
  );
}

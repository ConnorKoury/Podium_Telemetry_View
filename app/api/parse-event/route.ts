export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { parsePodiumPage } from "@/lib/podium-parser";

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json() as { url?: string };
    if (!url?.trim()) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const info = await parsePodiumPage(url.trim());
    return NextResponse.json(info);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

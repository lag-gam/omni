import { NextRequest, NextResponse } from "next/server";

// Phase 3: the one endpoint the omni-bar calls. Takes { text }, runs it
// through lib/memory.ts, returns a CaptureResult. Everything is a save
// until Phase 5 adds the intent router.
export async function POST(req: NextRequest) {
  const { text } = await req.json();

  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }

  // TODO(Phase 3): const result = await handleCapture(text);
  return NextResponse.json({ type: "saved" });
}

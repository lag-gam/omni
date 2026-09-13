import { NextRequest, NextResponse } from "next/server";
import { handleCapture } from "@/lib/memory";

// The one endpoint the omni-bar calls. Takes { text }, delegates the full
// pipeline (filter → classify → save/answer) to lib/memory.ts.
export async function POST(req: NextRequest) {
  const { text } = await req.json();

  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }

  const result = await handleCapture(text);
  return NextResponse.json(result);
}

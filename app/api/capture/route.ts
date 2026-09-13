import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { filterInput } from "@/lib/filter";
import type { CaptureResult } from "@/lib/types";

// The one endpoint the omni-bar calls. Takes { text }, runs the pre-filter,
// and if it passes, inserts into the DB. Phase 5 will add intent routing
// (SAVE vs QUESTION) before the insert.
export async function POST(req: NextRequest) {
  const { text } = await req.json();

  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "Missing text" }, { status: 400 });
  }

  const check = filterInput(text);
  if (!check.pass) {
    const result: CaptureResult = { type: "filtered", reason: check.reason };
    return NextResponse.json(result);
  }

  const stmt = db.prepare(
    "INSERT INTO notes (content, created_at) VALUES (?, datetime('now'))"
  );
  stmt.run(text.trim());

  const result: CaptureResult = { type: "saved" };
  return NextResponse.json(result);
}

import { NextResponse } from "next/server";

// Phase 9: read-only listing for the browse view. Not used by the capture
// loop itself.
export async function GET() {
  // TODO(Phase 9): return NextResponse.json(await listNotes());
  return NextResponse.json({ notes: [] });
}

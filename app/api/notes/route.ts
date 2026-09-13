import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();

  let rows;
  if (q) {
    rows = db
      .prepare(
        "SELECT id, content, created_at, tags FROM notes WHERE content LIKE ? ORDER BY created_at DESC"
      )
      .all(`%${q}%`);
  } else {
    rows = db
      .prepare("SELECT id, content, created_at, tags FROM notes ORDER BY created_at DESC")
      .all();
  }

  const notes = (rows as { id: number; content: string; created_at: string; tags: string | null }[]).map(
    (r) => ({
      id: r.id,
      content: r.content,
      createdAt: r.created_at,
      tags: r.tags ? r.tags.split(",").map((t) => t.trim()) : [],
    })
  );

  return NextResponse.json({ notes });
}

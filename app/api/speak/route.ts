import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VOICE = process.env.ELEVENLABS_VOICE_ID ?? "JBFqnCBsd6RMkjVDRZzb";
const MODEL = process.env.ELEVENLABS_MODEL ?? "eleven_flash_v2_5";

export async function POST(req: NextRequest) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    return Response.json(
      { error: "Add ELEVENLABS_API_KEY to .env.local" },
      { status: 503 }
    );
  }

  const { text } = await req.json();
  if (!text || typeof text !== "string") {
    return Response.json({ error: "Missing text" }, { status: 400 });
  }

  const spoken = text.replace(/\s+/g, " ").trim().slice(0, 2000);
  if (!spoken) return new Response(null, { status: 204 });

  const upstream = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE}/stream`,
    {
      method: "POST",
      headers: {
        "xi-api-key": key,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: spoken,
        model_id: MODEL,
        voice_settings: {
          stability: 0.42,
          similarity_boost: 0.75,
          style: 0.15,
        },
      }),
    }
  );

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "");
    return Response.json(
      { error: detail || `ElevenLabs ${upstream.status}` },
      { status: upstream.status }
    );
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}

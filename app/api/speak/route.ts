import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VOICE = process.env.ELEVENLABS_VOICE_ID ?? "JBFqnCBsd6RMkjVDRZzb";
const MODEL = process.env.ELEVENLABS_MODEL ?? "eleven_v3_conversational";

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

  const headers = {
    "xi-api-key": key,
    "Content-Type": "application/json",
    Accept: "audio/mpeg",
  };

  // Conversational v3 is a dialogue model. Fall back to classic v3 TTS
  // if this account/route does not accept the dialogue endpoint.
  let upstream = await fetch(
    "https://api.elevenlabs.io/v1/text-to-dialogue/stream",
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        inputs: [{ text: spoken, voice_id: VOICE }],
        model_id: MODEL,
      }),
    }
  );

  if (!upstream.ok) {
    upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE}/stream`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          text: spoken,
          model_id:
            MODEL === "eleven_v3_conversational" ? "eleven_v3" : MODEL,
        }),
      }
    );
  }

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

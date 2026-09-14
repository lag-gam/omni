import { NextRequest } from "next/server";
import { end, tryBegin } from "@/lib/server-lock";

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

  if (!tryBegin("__omniSpeakBusy")) {
    return new Response(null, { status: 429 });
  }

  try {
    const headers = {
      "xi-api-key": key,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    };

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
      const parsed = parseElevenError(detail);
      if (parsed.code === "quota_exceeded") {
        return Response.json(
          {
            error: "ElevenLabs is out of credits. Using the Mac voice.",
            code: "quota_exceeded",
          },
          { status: 402 }
        );
      }
      return Response.json(
        { error: parsed.message || `ElevenLabs ${upstream.status}` },
        { status: upstream.status }
      );
    }

    const bytes = await upstream.arrayBuffer();
    return new Response(bytes, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } finally {
    end("__omniSpeakBusy");
  }
}

function parseElevenError(raw: string): { code?: string; message: string } {
  try {
    const body = JSON.parse(raw) as {
      detail?: { code?: string; message?: string } | string;
    };
    if (typeof body.detail === "string") return { message: body.detail };
    return {
      code: body.detail?.code,
      message: body.detail?.message || raw,
    };
  } catch {
    return { message: raw };
  }
}

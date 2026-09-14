export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return POST();
}

export async function POST() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    return Response.json({ error: "missing key" }, { status: 503 });
  }

  const res = await fetch(
    "https://api.elevenlabs.io/v1/single-use-token/realtime_scribe",
    {
      method: "POST",
      headers: { "xi-api-key": key },
    }
  );
  const body = await res.text();
  if (!res.ok) {
    console.warn("[omni] scribe token", res.status, body.slice(0, 180));
    return Response.json(
      { error: "scribe token failed" },
      { status: res.status === 401 ? 503 : res.status }
    );
  }

  const data = JSON.parse(body) as { token?: string };
  if (!data.token) {
    return Response.json({ error: "no token" }, { status: 502 });
  }
  return Response.json({ token: data.token });
}

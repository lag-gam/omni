import { NextRequest } from "next/server";
import { loadConfig } from "@/lib/config";
import { clearConversation } from "@/lib/conversation";
import { handleCaptureStream } from "@/lib/memory";
import { warmMcp } from "@/lib/mcp/pool";
import { warmN8n } from "@/lib/n8n";
import { end, tryBegin } from "@/lib/server-lock";
import type { StreamEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ActiveCapture = { controller: AbortController | null };
const globalCapture = globalThis as typeof globalThis & {
  __omniActiveCapture?: ActiveCapture;
};
const activeCapture: ActiveCapture = (globalCapture.__omniActiveCapture ??= {
  controller: null,
});

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const started = Date.now();
  let text: unknown;
  let reset = false;
  let warm = false;
  try {
    const raw = await req.text();
    if (raw.trim()) {
      const body = JSON.parse(raw) as {
        text?: unknown;
        reset?: unknown;
        warm?: unknown;
      };
      text = body.text;
      reset = body.reset === true;
      warm = body.warm === true;
    }
  } catch {
    console.warn(`[omni] capture ${requestId} bad json`);
    return new Response(JSON.stringify({ error: "Bad JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (reset) {
    console.log(`[omni] capture ${requestId} reset`);
    activeCapture.controller?.abort("conversation reset");
    activeCapture.controller = null;
    clearConversation();
  }
  if (warm) {
    console.log(`[omni] capture ${requestId} warm start`);
    const connectors: Promise<unknown>[] = [warmMcp()];
    if (loadConfig().n8n?.enabled === true) connectors.push(warmN8n());
    await Promise.all(connectors);
    console.log(
      `[omni] capture ${requestId} warm done ${Date.now() - started}ms`
    );
    return new Response(null, { status: 204 });
  }

  if (!text || typeof text !== "string") {
    if (reset) return new Response(null, { status: 204 });
    return new Response(JSON.stringify({ error: "Missing text" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!tryBegin("__omniCaptureBusy")) {
    console.warn(`[omni] capture ${requestId} busy`);
    return new Response(JSON.stringify({ error: "busy" }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    });
  }

  const input = text;
  const captureController = new AbortController();
  activeCapture.controller?.abort("superseded capture");
  activeCapture.controller = captureController;
  console.log(`[omni] capture ${requestId} accepted ${JSON.stringify(input)}`);
  const encoder = new TextEncoder();
  let canceled = false;
  const onAbort = () => {
    canceled = true;
    captureController.abort(req.signal.reason);
    console.warn(
      `[omni] capture ${requestId} client aborted ${Date.now() - started}ms`
    );
  };
  req.signal.addEventListener("abort", onAbort, { once: true });
  if (req.signal.aborted) onAbort();
  const stream = new ReadableStream({
    async start(controller) {
      let events = 0;
      try {
        for await (const event of handleCaptureStream(
          input,
          requestId,
          {},
          captureController.signal
        )) {
          if (canceled || captureController.signal.aborted) break;
          events += 1;
          console.log(
            `[omni] capture ${requestId} event ${describeEvent(event)}`
          );
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          } catch (err) {
            if (canceled || captureController.signal.aborted) break;
            throw err;
          }
        }
      } catch (err) {
        if (canceled || captureController.signal.aborted) return;
        const message =
          err instanceof Error ? err.message : "Something went wrong.";
        console.error(
          `[omni] capture ${requestId} failed ${Date.now() - started}ms`,
          err instanceof Error ? err.stack || err.message : err
        );
        try {
          controller.enqueue(
            encoder.encode(`${JSON.stringify({ type: "error", text: message })}\n`)
          );
        } catch (sendErr) {
          console.error(
            `[omni] capture ${requestId} error delivery failed`,
            sendErr
          );
        }
      } finally {
        req.signal.removeEventListener("abort", onAbort);
        if (activeCapture.controller === captureController) {
          activeCapture.controller = null;
        }
        end("__omniCaptureBusy");
        try {
          controller.close();
        } catch {
          // The renderer may have reloaded and canceled the response.
        }
        console.log(
          `[omni] capture ${requestId} closed events=${events} ${Date.now() - started}ms`
        );
      }
    },
    cancel(reason) {
      canceled = true;
      captureController.abort(reason);
      console.warn(
        `[omni] capture ${requestId} stream canceled ${Date.now() - started}ms`,
        reason ?? ""
      );
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      "X-Omni-Request-Id": requestId,
    },
  });
}

function describeEvent(event: StreamEvent): string {
  if (event.type === "done") {
    const text =
      event.result.type === "answer"
        ? event.result.text
        : event.result.type === "filtered"
          ? event.result.reason
          : event.result.type === "clarify"
            ? `${event.result.reason} ${event.result.question}`
            : "saved";
    return `done.${event.result.type} ${JSON.stringify(text)}`;
  }
  if (event.type === "card") return `card ${JSON.stringify(event.card.title)}`;
  return `${event.type} ${JSON.stringify(event.text)}`;
}

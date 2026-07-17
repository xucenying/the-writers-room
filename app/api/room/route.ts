import { refineSession, startSession, type RoomEvent } from "@/src/lib/orchestrator";
import type { WritersRoomState } from "@/src/lib/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sseEvent(event: RoomEvent) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: Request) {
  const body = (await request.json()) as { action?: string; state?: WritersRoomState; text?: string };
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const emit = (event: RoomEvent) => controller.enqueue(encoder.encode(sseEvent(event)));
      void (async () => {
        try {
          if (body.action === "start") {
            if (!body.text?.trim()) throw new Error("Tell the room about your set first.");
            await startSession(body.text.trim(), emit);
          } else if (body.action === "refine") {
            if (!body.state || !body.text?.trim()) throw new Error("The completed set and feedback are required.");
            await refineSession(body.state, body.text.trim(), emit);
          } else {
            throw new Error("Unknown room action.");
          }
        } catch (error) {
          emit({ type: "error", message: error instanceof Error ? error.message : "The room hit an unexpected error." });
        } finally {
          controller.close();
        }
      })();
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}

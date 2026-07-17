import { refineSession, startSession, type RoomEvent } from "@/src/lib/orchestrator";
import type { WritersRoomState } from "@/src/lib/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOURLY_LIMITS = { start: 3, refine: 10 } as const;
const DAILY_RUN_LIMIT = 40;

type Action = keyof typeof HOURLY_LIMITS;
type RateBucket = { hour: string; start: number; refine: number };

// Best-effort only: serverless instances do not share process memory, so these counters
// reset on cold starts and are not coordinated across concurrent Vercel instances.
const ipBuckets = new Map<string, RateBucket>();
let dailyRuns = { day: "", count: 0 };

function hourKey(now: Date) {
  return `${now.toISOString().slice(0, 13)}:00Z`;
}

function clientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function consumeRunAllowance(ip: string, action: Action) {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  if (dailyRuns.day !== day) dailyRuns = { day, count: 0 };
  if (dailyRuns.count >= DAILY_RUN_LIMIT) {
    return "The writers' room is taking a break — too many sets today. Come back tomorrow!";
  }

  const hour = hourKey(now);
  const bucket = ipBuckets.get(ip);
  const current = !bucket || bucket.hour !== hour ? { hour, start: 0, refine: 0 } : bucket;
  if (current[action] >= HOURLY_LIMITS[action]) {
    return "The room needs a breather — try again in an hour.";
  }

  current[action] += 1;
  ipBuckets.set(ip, current);
  dailyRuns.count += 1;
  return null;
}

function sseEvent(event: RoomEvent) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: Request) {
  const body = (await request.json()) as { action?: string; state?: WritersRoomState; text?: string };
  const ip = clientIp(request);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const emit = (event: RoomEvent) => controller.enqueue(encoder.encode(sseEvent(event)));
      void (async () => {
        try {
          if (body.action === "start") {
            if (!body.text?.trim()) throw new Error("Tell the room about your set first.");
            const limitMessage = consumeRunAllowance(ip, "start");
            if (limitMessage) throw new Error(limitMessage);
            await startSession(body.text.trim(), emit);
          } else if (body.action === "refine") {
            if (!body.state || !body.text?.trim()) throw new Error("The completed set and feedback are required.");
            const limitMessage = consumeRunAllowance(ip, "refine");
            if (limitMessage) throw new Error(limitMessage);
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

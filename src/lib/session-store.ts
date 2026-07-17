import type { WritersRoomState } from "./state";

export type RoomEvent =
  | { type: "session"; sessionId: string }
  | { type: "agent"; agent: string; status: "thinking" | "complete"; output?: unknown }
  | { type: "final"; state: WritersRoomState }
  | { type: "error"; message: string };

export interface SessionRuntime {
  state: WritersRoomState;
  phase: "working" | "complete";
}

const sessions = new Map<string, SessionRuntime>();

export function saveSession(session: SessionRuntime) {
  sessions.set(session.state.session_id, session);
}

export function getSession(sessionId: string) {
  return sessions.get(sessionId);
}

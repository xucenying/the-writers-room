import type { HumorCeiling, WritersRoomState } from "./state";

export type RoomEvent =
  | { type: "session"; sessionId: string }
  | { type: "agent"; agent: string; status: "thinking" | "complete"; output?: unknown }
  | { type: "chat"; speaker: "Analyst" | "Interviewer"; text: string }
  | { type: "final"; state: WritersRoomState }
  | { type: "error"; message: string };

export interface SessionRuntime {
  state: WritersRoomState;
  phase: "analyst_questions" | "interview" | "complete";
  analystQuestions: string[];
  pendingQuestion: string | null;
  interviewerQuestionsAsked: number;
  analystHumorCap: HumorCeiling;
}

const sessions = new Map<string, SessionRuntime>();

export function saveSession(session: SessionRuntime) {
  sessions.set(session.state.session_id, session);
}

export function getSession(sessionId: string) {
  return sessions.get(sessionId);
}

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import OpenAI from "openai";
import { capHumor, newState, type HumorCeiling, type WritersRoomState } from "./state";
import { getSession, saveSession, type RoomEvent, type SessionRuntime } from "./session-store";

type Agent = "occasion-analyst" | "interviewer" | "structurer" | "punch-up-writer" | "test-audience" | "director";
type AgentOutput = Record<string, unknown>;
type Emit = (event: RoomEvent) => void;

const agentNames: Record<Agent, string> = {
  "occasion-analyst": "Occasion Analyst",
  interviewer: "Interviewer",
  structurer: "Structurer",
  "punch-up-writer": "Punch-Up Writer",
  "test-audience": "Test Audience",
  director: "Director"
};

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function stripFences(content: string) {
  return content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function parseJson(content: string): AgentOutput {
  const parsed: unknown = JSON.parse(stripFences(content));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The model response was not a JSON object.");
  }
  return parsed as AgentOutput;
}

async function loadPrompt(agent: Agent) {
  return readFile(join(process.cwd(), "prompts", `${agent}.txt`), "utf8");
}

async function requestModel(system: string, input: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured. Add it to .env.local and restart the server.");

  const payload = {
    model: process.env.OPENAI_MODEL || "gpt-5.6",
    messages: [
      { role: "system" as const, content: system },
      { role: "user" as const, content: input }
    ]
  };
  const { writeFile } = await import("node:fs/promises");
  await writeFile(join(process.cwd(), "debug-request.json"), JSON.stringify(payload, null, 2));
  console.log("[debug] key ending:", apiKey.slice(-4), "| model:", payload.model, "| input chars:", input.length);

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await client.chat.completions.create(payload);

      const content = response.choices?.[0]?.message?.content;
      if (!content) throw new Error("OpenAI returned an empty response.");
      return content;
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
        console.error(`[debug] OpenAI APIError (attempt ${attempt}/${maxAttempts}):`, JSON.stringify({
          status: error.status,
          message: error.message,
          requestID: (error as { requestID?: string }).requestID,
          code: error.code,
          type: error.type
        }));
        const retryable = error.status === 401 || error.status === 429 || (error.status ?? 0) >= 500;
        if (retryable && attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
          continue;
        }
        throw new Error(`OpenAI request failed (${error.status}): ${error.message}`);
      }
      throw error;
    }
  }
  throw new Error("OpenAI request failed after retries.");
}

async function runAgent(agent: Agent, state: WritersRoomState, instruction: string, emit: Emit) {
  const name = agentNames[agent];
  const system = await loadPrompt(agent);
  const context = `${instruction}\n\nShared state JSON:\n${JSON.stringify(state)}`;
  emit({ type: "agent", agent: name, status: "thinking" });

  let raw = await requestModel(system, context);
  let output: AgentOutput;
  try {
    output = parseJson(raw);
  } catch {
    raw = await requestModel(
      system,
      `${context}\n\nYour last output was not valid JSON. Respond with corrected JSON only. Last output:\n${raw}`
    );
    output = parseJson(raw);
  }

  emit({ type: "agent", agent: name, status: "complete", output });
  return output;
}

function mergeProfile(state: WritersRoomState, profile: unknown) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    throw new Error("Occasion Analyst did not return an occasion_profile.");
  }
  Object.assign(state.occasion_profile, profile);
  if (state.occasion_profile.sensitive_mode) {
    state.occasion_profile.humor_ceiling = "gentle";
    state.occasion_profile.sentiment_ratio = Math.max(0.8, Number(state.occasion_profile.sentiment_ratio) || 0.8);
  }
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

async function askInterviewer(session: SessionRuntime, emit: Emit) {
  const forceCompletion = session.interviewerQuestionsAsked >= 6;
  const output = await runAgent(
    "interviewer",
    session.state,
    forceCompletion
      ? "Six questions have been asked. Now produce the material JSON from the conversation; do not ask another question."
      : `Ask the next most useful question. This is question ${session.interviewerQuestionsAsked + 1} of a maximum of 6.`,
    emit
  );

  if (output.material && typeof output.material === "object") {
    session.state.material = output.material as WritersRoomState["material"];
    await runRoom(session, emit);
    return;
  }

  const question = typeof output.question === "string" ? output.question.trim() : "";
  if (!question) throw new Error("Interviewer returned neither a question nor material.");
  session.interviewerQuestionsAsked += 1;
  session.pendingQuestion = question;
  emit({ type: "chat", speaker: "Interviewer", text: question });
}

async function runRoom(session: SessionRuntime, emit: Emit) {
  const state = session.state;
  const structured = await runAgent("structurer", state, "Create the beat sheet now.", emit);
  if (!structured.skeleton || typeof structured.skeleton !== "object") throw new Error("Structurer did not return a skeleton.");
  state.skeleton = structured.skeleton as WritersRoomState["skeleton"];

  state.loop.iteration = 0;
  state.loop.stop_reason = null;
  while (state.loop.iteration < state.loop.max_iterations) {
    const draft = await runAgent(
      "punch-up-writer",
      state,
      state.loop.iteration === 0 ? "Write the first draft." : "Revise the current draft using the revision targets only.",
      emit
    );
    if (!draft.draft || typeof draft.draft !== "object") throw new Error("Punch-Up Writer did not return a draft.");
    state.draft = draft.draft as WritersRoomState["draft"];
    state.draft.version = state.loop.iteration + 1;

    const feedback = await runAgent("test-audience", state, "Evaluate every draft beat and return a strict verdict.", emit);
    if (!feedback.audience_feedback || typeof feedback.audience_feedback !== "object") {
      throw new Error("Test Audience did not return audience_feedback.");
    }
    state.audience_feedback = feedback.audience_feedback as WritersRoomState["audience_feedback"];
    state.loop.iteration += 1;
    if (state.audience_feedback.verdict === "pass") {
      state.loop.stop_reason = "audience_pass";
      break;
    }
  }
  if (!state.loop.stop_reason) state.loop.stop_reason = "max_iterations";

  const directed = await runAgent("director", state, "Assemble the final speech and delivery guidance.", emit);
  if (!directed.final || typeof directed.final !== "object") throw new Error("Director did not return a final speech.");
  state.final = directed.final as WritersRoomState["final"];
  session.phase = "complete";
  session.pendingQuestion = null;
  saveSession(session);
  emit({ type: "final", state });
}

export async function startSession(occasionFreetext: string, emit: Emit) {
  const state = newState(occasionFreetext);
  const output = await runAgent("occasion-analyst", state, "Analyze this occasion and surface only necessary clarifying questions.", emit);
  mergeProfile(state, output.occasion_profile);
  const session: SessionRuntime = {
    state,
    phase: "interview",
    analystQuestions: stringList(output.questions_for_user),
    pendingQuestion: null,
    interviewerQuestionsAsked: 0,
    analystHumorCap: state.occasion_profile.humor_ceiling
  };
  saveSession(session);
  emit({ type: "session", sessionId: state.session_id });

  const firstQuestion = session.analystQuestions.shift();
  if (firstQuestion) {
    session.phase = "analyst_questions";
    session.pendingQuestion = firstQuestion;
    emit({ type: "chat", speaker: "Analyst", text: firstQuestion });
  } else {
    await askInterviewer(session, emit);
  }
  saveSession(session);
}

export async function answerSession(sessionId: string, answer: string, emit: Emit) {
  const session = getSession(sessionId);
  if (!session) throw new Error("That session has expired. Start a new room.");
  if (!session.pendingQuestion) throw new Error("The room is not waiting for an answer.");
  session.state.user_input.answers.push({ question: session.pendingQuestion, answer });

  if (session.phase === "analyst_questions") {
    const nextQuestion = session.analystQuestions.shift();
    if (nextQuestion) {
      session.pendingQuestion = nextQuestion;
      emit({ type: "chat", speaker: "Analyst", text: nextQuestion });
      saveSession(session);
      return;
    }
    session.phase = "interview";
  }

  await askInterviewer(session, emit);
  saveSession(session);
}

export async function rerunSession(sessionId: string, requestedHumor: HumorCeiling, emit: Emit) {
  const session = getSession(sessionId);
  if (!session) throw new Error("That session has expired. Start a new room.");
  if (session.phase !== "complete") throw new Error("Finish the interview before rerunning the room.");
  session.state.occasion_profile.humor_ceiling = capHumor(
    requestedHumor,
    session.analystHumorCap,
    session.state.occasion_profile.sensitive_mode,
    session.state.occasion_profile.formality
  );
  await runRoom(session, emit);
}

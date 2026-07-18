import { readFile } from "node:fs/promises";
import { join } from "node:path";
import OpenAI from "openai";
import { newState, type RefinementKind, type WritersRoomState } from "./state";

type Agent = "gig-analyst" | "structurer" | "punch-up-writer" | "test-audience" | "director";
type AgentOutput = Record<string, unknown>;
export type RoomEvent =
  | { type: "session"; sessionId: string }
  | { type: "agent"; agent: string; status: "thinking" | "complete"; output?: unknown }
  | { type: "final"; state: WritersRoomState }
  | { type: "error"; message: string };
type Emit = (event: RoomEvent) => void;

const agentNames: Record<Agent, string> = {
  "gig-analyst": "Gig Analyst",
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
    response_format: { type: "json_object" as const },
    messages: [
      { role: "system" as const, content: system },
      { role: "user" as const, content: input }
    ]
  };
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await client.chat.completions.create(payload);
      const content = response.choices?.[0]?.message?.content;
      if (!content) throw new Error("OpenAI returned an empty response.");
      return content;
    } catch (error) {
      if (error instanceof OpenAI.APIError) {
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

function mergeAnalystOutput(state: WritersRoomState, output: AgentOutput) {
  if (!output.gig_profile || typeof output.gig_profile !== "object" || Array.isArray(output.gig_profile)) {
    throw new Error("Gig Analyst did not return a gig_profile.");
  }
  if (!output.material || typeof output.material !== "object" || Array.isArray(output.material)) {
    throw new Error("Gig Analyst did not return material.");
  }
  Object.assign(state.gig_profile, output.gig_profile);
  Object.assign(state.material, output.material);

  const hasChildren = state.gig_profile.audience_group.some((group) => group.toLowerCase() === "children");
  if (hasChildren) {
    state.gig_profile.clean_mode = true;
    state.gig_profile.edginess = "clean";
  }
  if (state.gig_profile.sensitive_mode) state.gig_profile.edginess = "clean";
}

function refinementKind(output: AgentOutput): RefinementKind {
  return output.refinement_type === "surface" ? "surface" : "structural";
}

async function runInternalLoop(state: WritersRoomState, emit: Emit, firstDraftInstruction: string) {
  state.loop.iteration = 0;
  state.loop.stop_reason = null;

  while (state.loop.iteration < state.loop.max_iterations) {
    const draft = await runAgent(
      "punch-up-writer",
      state,
      state.loop.iteration === 0
        ? firstDraftInstruction
        : "Revise the current draft using the Test Audience revision targets only.",
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
}

async function structureSet(state: WritersRoomState, emit: Emit) {
  const structured = await runAgent("structurer", state, "Create the stand-up set list now.", emit);
  if (!structured.skeleton || typeof structured.skeleton !== "object") throw new Error("Structurer did not return a skeleton.");
  state.skeleton = structured.skeleton as WritersRoomState["skeleton"];
}

async function directSet(state: WritersRoomState, emit: Emit) {
  const directed = await runAgent("director", state, "Assemble the final set and delivery guidance.", emit);
  if (!directed.final || typeof directed.final !== "object") throw new Error("Director did not return a final set.");
  state.final = directed.final as WritersRoomState["final"];
  emit({ type: "final", state });
}

export async function startSession(briefFreetext: string, emit: Emit) {
  const state = newState(briefFreetext);
  emit({ type: "session", sessionId: state.session_id });

  const analysis = await runAgent(
    "gig-analyst",
    state,
    "Analyze the user's brief, extracting the gig profile and usable material. This is the initial run.",
    emit
  );
  mergeAnalystOutput(state, analysis);
  await structureSet(state, emit);
  await runInternalLoop(state, emit, "Write the first draft of the stand-up set.");
  await directSet(state, emit);
}

export async function refineSession(state: WritersRoomState, feedback: string, emit: Emit) {
  state.user_input.refinement_history.push(feedback);

  const analysis = await runAgent(
    "gig-analyst",
    state,
    `Classify and apply the latest user feedback: ${feedback}`,
    emit
  );
  mergeAnalystOutput(state, analysis);
  if (refinementKind(analysis) === "structural") await structureSet(state, emit);
  await runInternalLoop(state, emit, "Revise the current draft to address the latest user feedback.");
  await directSet(state, emit);
}

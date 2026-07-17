export type OccasionType =
  | "wedding_toast"
  | "retirement"
  | "farewell"
  | "birthday"
  | "anniversary"
  | "graduation"
  | "other";

export type HumorCeiling = "gentle" | "playful" | "roast";

export interface WritersRoomState {
  session_id: string;
  user_input: {
    occasion_freetext: string;
    answers: Array<{ question: string; answer: string }>;
  };
  occasion_profile: {
    occasion_type: OccasionType;
    sensitive_mode: boolean;
    speaker_role: string;
    honoree: string;
    audience_composition: string[];
    formality: "casual" | "semi_formal" | "formal";
    target_length_seconds: number;
    humor_ceiling: HumorCeiling;
    sentiment_ratio: number;
    off_limits: string[];
    cultural_notes: string | null;
  };
  material: {
    stories: Array<{
      id: string;
      summary: string;
      specifics: string[];
      emotional_core: string;
      comedy_potential: "low" | "medium" | "high";
      sentiment_potential: "low" | "medium" | "high";
    }>;
  };
  skeleton: {
    premise: string;
    beats: Array<{
      id: string;
      type: "opener" | "story" | "joke" | "pivot" | "sincere" | "closer";
      source_story: string | null;
      intent: string;
      notes: string;
    }>;
  };
  draft: {
    version: number;
    beats: Array<{ id: string; text: string; delivery_note: string | null }>;
  };
  audience_feedback: {
    personas: Array<{
      name: string;
      beat_reactions: Array<{
        beat_id: string;
        reaction: "laugh" | "smile" | "flat" | "wince" | "confused" | "moved";
        comment: string;
      }>;
    }>;
    verdict: "pass" | "revise";
    revision_targets: string[];
  };
  final: {
    title: string;
    speech_text: string;
    estimated_duration_seconds: number;
    delivery_tips: string[];
  };
  loop: {
    iteration: number;
    max_iterations: number;
    stop_reason: "audience_pass" | "max_iterations" | null;
  };
}

export function newState(occasionFreetext: string): WritersRoomState {
  return {
    session_id: crypto.randomUUID(),
    user_input: { occasion_freetext: occasionFreetext, answers: [] },
    occasion_profile: {
      occasion_type: "other",
      sensitive_mode: false,
      speaker_role: "speaker",
      honoree: "the honoree",
      audience_composition: [],
      formality: "semi_formal",
      target_length_seconds: 120,
      humor_ceiling: "gentle",
      sentiment_ratio: 0.5,
      off_limits: [],
      cultural_notes: null
    },
    material: { stories: [] },
    skeleton: { premise: "", beats: [] },
    draft: { version: 0, beats: [] },
    audience_feedback: { personas: [], verdict: "revise", revision_targets: [] },
    final: { title: "", speech_text: "", estimated_duration_seconds: 0, delivery_tips: [] },
    loop: { iteration: 0, max_iterations: 3, stop_reason: null }
  };
}

const humorLevels: HumorCeiling[] = ["gentle", "playful", "roast"];

export function capHumor(
  requested: HumorCeiling,
  analystCap: HumorCeiling,
  sensitiveMode: boolean,
  formality: WritersRoomState["occasion_profile"]["formality"]
): HumorCeiling {
  if (sensitiveMode || formality === "formal") return "gentle";
  return humorLevels.indexOf(requested) > humorLevels.indexOf(analystCap) ? analystCap : requested;
}

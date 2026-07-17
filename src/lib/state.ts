export type Edginess = "clean" | "playful" | "edgy";
export type RefinementKind = "structural" | "surface";

export interface WritersRoomState {
  session_id: string;
  user_input: {
    brief_freetext: string;
    refinement_history: string[];
  };
  gig_profile: {
    occasion: string;
    audience_size: number | null;
    audience_group: string[];
    clean_mode: boolean;
    sensitive_mode: boolean;
    performer_occupation: string | null;
    performer_persona: string;
    target_length_seconds: number;
    edginess: Edginess;
    off_limits: string[];
    assumptions: string[];
  };
  material: {
    bits_source: Array<{
      id: string;
      summary: string;
      specifics: string[];
      comedy_potential: "low" | "medium" | "high";
    }>;
    observational_topics: string[];
  };
  skeleton: {
    premise: string;
    beats: Array<{
      id: string;
      type: "opener" | "story" | "joke" | "pivot" | "sincere" | "closer";
      source_material: string | null;
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
    set_text: string;
    estimated_duration_seconds: number;
    delivery_tips: string[];
  };
  loop: {
    iteration: number;
    max_iterations: number;
    stop_reason: "audience_pass" | "max_iterations" | null;
  };
}

export function newState(briefFreetext: string): WritersRoomState {
  return {
    session_id: crypto.randomUUID(),
    user_input: { brief_freetext: briefFreetext, refinement_history: [] },
    gig_profile: {
      occasion: "unknown",
      audience_size: null,
      audience_group: ["mixed"],
      clean_mode: false,
      sensitive_mode: false,
      performer_occupation: null,
      performer_persona: "a first-time performer",
      target_length_seconds: 180,
      edginess: "playful",
      off_limits: [],
      assumptions: []
    },
    material: { bits_source: [], observational_topics: [] },
    skeleton: { premise: "", beats: [] },
    draft: { version: 0, beats: [] },
    audience_feedback: { personas: [], verdict: "revise", revision_targets: [] },
    final: { title: "", set_text: "", estimated_duration_seconds: 0, delivery_tips: [] },
    loop: { iteration: 0, max_iterations: 3, stop_reason: null }
  };
}

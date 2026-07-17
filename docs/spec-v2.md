# The Writers' Room v2 — Stand-Up for Everyone (Pivot Spec)

Stand-up comedy is becoming a normal way to perform at day-to-day occasions — office
parties, birthdays, weddings, team events — the way people used to sing or dance.
This app is an agentic comedy writers' room that turns whatever the user tells it
into a performable stand-up set, then refines it on request.

## Core UX change from v1

NO interview. One big free-text input. The user writes as much or as little as they
want, in any form: the occasion, audience size, who the audience is (colleagues,
family, children, friends), their own occupation, personal stories, details they
want included, tone wishes. Everything is optional. The room works with whatever
it gets and makes safe assumptions for the rest.

After the set is generated, the user can type feedback in plain language
("more jokes about my job", "shorter", "the audience has kids, keep it clean",
"the second bit is weak") and re-run the room. The room revises using the feedback
plus the existing state. This loop can repeat any number of times.

## Pipeline (5 agents — Interviewer is removed)

1. Gig Analyst — parses the free text into a gig_profile AND extracts material
2. Structurer — designs the set list (beats)
3. Punch-Up Writer — writes the bits
4. Test Audience — personas generated from audience_group, react beat by beat
5. Director — assembles the final set with delivery notes

Internal revision loop (Punch-Up ↔ Test Audience, max 3 iterations) stays as in v1.
The user-facing refinement loop wraps the whole room: user feedback re-enters at the
Structurer (structural feedback) or Punch-Up Writer (tone/content feedback) — the
Gig Analyst decides which on each refinement pass.

## Shared State Object (v2)

```json
{
  "session_id": "uuid",
  "user_input": {
    "brief_freetext": "the one big input",
    "refinement_history": ["each feedback message the user sent"]
  },
  "gig_profile": {
    "occasion": "string, e.g. office party, wedding, birthday, open mic, unknown",
    "audience_size": "number or null",
    "audience_group": ["colleagues", "family", "children", "friends", "strangers", "mixed"],
    "clean_mode": false,
    "sensitive_mode": false,
    "performer_occupation": "string or null",
    "performer_persona": "how the performer comes across on stage, inferred",
    "target_length_seconds": 180,
    "edginess": "clean | playful | edgy",
    "off_limits": ["inferred risky topics"],
    "assumptions": ["everything the Analyst guessed, shown to the user"]
  },
  "material": {
    "bits_source": [
      {
        "id": "m1",
        "summary": "story/detail from the user's input",
        "specifics": ["concrete details"],
        "comedy_potential": "low | medium | high"
      }
    ],
    "observational_topics": ["topics the room may riff on when personal material is thin"]
  },
  "skeleton": { "premise": "...", "beats": [ ... same as v1 ... ] },
  "draft": { "version": 1, "beats": [ ... same as v1 ... ] },
  "audience_feedback": { "personas": [ ... ], "verdict": "pass | revise", "revision_targets": [] },
  "final": {
    "title": "string",
    "set_text": "string with [PAUSE] [BEAT] [ACT-OUT] delivery marks",
    "estimated_duration_seconds": 0,
    "delivery_tips": ["for a nervous first-time performer"]
  },
  "loop": { "iteration": 0, "max_iterations": 3, "stop_reason": null }
}
```

## Agent prompt changes

### Gig Analyst (replaces Occasion Analyst + Interviewer, temp ~0.4)
- Input: brief_freetext (and on refinement passes: the feedback message + full state).
- Extracts gig_profile AND material in one pass. Material can come only from what
  the user wrote — never invent biography. When personal material is thin, fill
  observational_topics (safe universal topics matched to occupation/occasion) that
  the room may riff on, clearly generic rather than fabricated personal stories.
- clean_mode = true whenever "children" appears in audience_group → no innuendo,
  no alcohol/adult topics, edginess capped at clean.
- sensitive_mode as in v1 (grief-adjacent → no roast, warm humor only).
- List every guess in "assumptions" so the UI can show "The room assumed: …".
- On refinement passes: classify the feedback as "structural" (rebuild skeleton) or
  "surface" (revise draft only) and update gig_profile/material accordingly.

### Structurer (temp ~0.5)
Same as v1, but stand-up grammar: cold open joke in the first 15 seconds, bits built
from material with segues, callbacks planted early and paid off in the closer,
act-outs marked. Personal bits > observational bits when material allows.
Respect target_length_seconds at ~130 words/min.

### Punch-Up Writer (temp ~0.9)
Same craft rules as v1, stand-up register: shorter sentences, more act-outs,
audience address ("you ever notice…" sparingly — prefer personal specificity).
Respect edginess, clean_mode, off_limits. Never punch down at the audience group.

### Test Audience (temp ~0.8)
Personas are generated FROM audience_group + occasion, e.g.:
- colleagues → the boss who signs off on jokes about work, the intern, HR
- family → grandma, a 9-year-old cousin (if children present), the sarcastic sibling
- friends/strangers → comedy-club regular, first-date attendee
Each persona has different tolerance; a wince from the HR persona or any child
persona is an automatic "revise". Reactions: laugh, smile, flat, wince, confused.
Verdict rules as in v1.

### Director (temp ~0.4)
Same as v1 but output is a stand-up set: delivery marks [PAUSE] [BEAT] [ACT-OUT]
[WAIT FOR LAUGH], tips for first-time performers (mic handling, what to do when a
joke dies, where to look), title, duration estimate.

## Orchestration changes

```python
# initial run
state = new_state(brief_freetext)
state |= run(GIG_ANALYST, state)
state |= run(STRUCTURER, state)
run_internal_loop(PUNCH_UP, TEST_AUDIENCE, state)   # unchanged from v1
state |= run(DIRECTOR, state)
render(state.final)

# user refinement (repeatable)
on user_feedback(text):
    state.user_input.refinement_history.append(text)
    state |= run(GIG_ANALYST, state)        # reclassifies + updates profile/material
    if analyst says structural: state |= run(STRUCTURER, state)
    run_internal_loop(PUNCH_UP, TEST_AUDIENCE, state)
    state |= run(DIRECTOR, state)
    render(state.final)
```

Keep: SSE streaming of the room, JSON-retry wrapper, 401/429/5xx retry with backoff,
prompts as files in /prompts, in-memory session store.

## UI changes

- Landing: one large textarea — "Tell the room everything: the occasion, who's in
  the audience, what you do, stories you want in. The more you give, the better the
  set." Plus 3 example chips (Office party, Family birthday, Open mic first-timer).
- Show "The room assumed: …" chips above the result (from gig_profile.assumptions).
- Result screen: the set with delivery marks, duration, tips, copy button, and a
  feedback box: "Tell the room what to change" → re-runs the room (streamed live).
- Writers' room pane (live agent feed) unchanged — it is still the show.

## Guardrails

1. children in audience → clean_mode, hard cap. Test with "my daughter's 10th
   birthday, her friends will be there".
2. sensitive_mode as v1. Test with a memorial context.
3. No fabricated personal stories: personal bits only from user input;
   observational bits must be clearly general, not fake biography.
4. Never mock the audience group; the performer is always the butt of the joke
   before anyone else.

## Migration notes for Codex

- Remove interview phase: no analyst_questions/pendingQuestion flow; startSession
  runs the full room immediately.
- Rename occasion_profile → gig_profile; add refinement endpoint (action: "refine",
  sessionId, text) to the existing /api/room route.
- Repurpose prompts/occasion-analyst.txt → prompts/gig-analyst.txt; delete
  prompts/interviewer.txt.
- Keep the retry logic added to requestModel.

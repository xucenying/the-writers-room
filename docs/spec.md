# The Writers' Room — Build Spec (Hackathon Skeleton)

An agentic app that helps ordinary people write a funny, heartfelt speech for any occasion
(wedding toast, retirement, farewell, birthday, and more). Six agents collaborate like a
comedy writers' room; the user watches the room work in real time.

Target: single-page web app. Backend: thin orchestrator calling the LLM API with six
distinct system prompts and one shared state object. Frontend: chat pane (user <-> Interviewer)
plus a live "writers' room" pane streaming inter-agent activity.

---

## 1. Shared State Object

One JSON object passed through the pipeline. Each agent reads what it needs and writes
only its own section. Persist it per session; it is also your debug log and demo artifact.

```json
{
  "session_id": "uuid",
  "user_input": {
    "occasion_freetext": "string — whatever the user typed",
    "answers": ["array of Interviewer Q&A pairs"]
  },
  "occasion_profile": {
    "occasion_type": "wedding_toast | retirement | farewell | birthday | anniversary | graduation | other",
    "sensitive_mode": false,
    "speaker_role": "string, e.g. best man, colleague, daughter",
    "honoree": "string",
    "audience_composition": ["e.g. family (3 generations)", "colleagues", "university friends"],
    "formality": "casual | semi_formal | formal",
    "target_length_seconds": 120,
    "humor_ceiling": "gentle | playful | roast",
    "sentiment_ratio": "0.0-1.0, share of the speech that should be heartfelt vs funny",
    "off_limits": ["topics the Analyst or user flagged"],
    "cultural_notes": "string or null"
  },
  "material": {
    "stories": [
      {
        "id": "s1",
        "summary": "string",
        "specifics": ["concrete details, quotes, sensory facts"],
        "emotional_core": "string",
        "comedy_potential": "low | medium | high",
        "sentiment_potential": "low | medium | high"
      }
    ]
  },
  "skeleton": {
    "premise": "string — the angle of the whole speech",
    "beats": [
      {
        "id": "b1",
        "type": "opener | story | joke | pivot | sincere | closer",
        "source_story": "s1 or null",
        "intent": "what this beat must accomplish",
        "notes": "misdirection, callback target, etc."
      }
    ]
  },
  "draft": {
    "version": 1,
    "beats": [
      { "id": "b1", "text": "string", "delivery_note": "string or null" }
    ]
  },
  "audience_feedback": {
    "personas": [
      {
        "name": "string, generated from audience_composition",
        "beat_reactions": [
          { "beat_id": "b1", "reaction": "laugh | smile | flat | wince | confused | moved", "comment": "string" }
        ]
      }
    ],
    "verdict": "pass | revise",
    "revision_targets": ["beat ids with reasons"]
  },
  "final": {
    "title": "string",
    "speech_text": "string with [PAUSE] and [LOOK AT HONOREE] style delivery marks",
    "estimated_duration_seconds": 0,
    "delivery_tips": ["strings"]
  },
  "loop": {
    "iteration": 0,
    "max_iterations": 3,
    "stop_reason": null
  }
}
```

---

## 2. Agent Prompts

All six are system prompts. Every agent MUST respond with valid JSON only (no markdown
fences, no preamble) matching its output contract. Temperature suggestions are starting
points; tune later.

### Agent 1 — Occasion Analyst (runs first, temperature ~0.3)

```
You are the Occasion Analyst in a speechwriting writers' room. The user will describe,
in free text, an occasion where they must give a speech.

Your job: produce a structured occasion profile. Infer conservatively; when a field is
genuinely unknowable from the text, choose the safest default and add a clarifying
question to "questions_for_user" (maximum 2 questions).

Rules:
- Infer occasion_type, speaker_role, honoree, audience_composition, formality,
  target_length_seconds (default 120), humor_ceiling, sentiment_ratio, cultural_notes.
- humor_ceiling defaults: wedding_toast = playful, retirement = playful,
  farewell = playful, birthday = playful-to-roast only if the user signals a close
  peer relationship, formal/professional events = gentle.
- SENSITIVE MODE: if the occasion involves a funeral, memorial, serious illness,
  or any grief-adjacent context, set sensitive_mode = true, humor_ceiling = "gentle",
  sentiment_ratio >= 0.8, and add a note that the pipeline must run in remembrance
  mode (warm anecdotes only, no punchlines, no roasting).
- Populate off_limits with anything risky you can infer (ex-partners at weddings,
  layoffs at farewells, health at birthdays for older honorees).

Output JSON: { "occasion_profile": { ... }, "questions_for_user": ["...", "..."] }
```

### Agent 2 — Interviewer (conversational, temperature ~0.7)

```
You are the Interviewer in a speechwriting writers' room. You talk directly to the
user. Your only job is to mine SPECIFIC material. You never write jokes or speech text.

You receive the occasion_profile and the conversation so far. Ask ONE question at a
time, maximum 6 questions total, then stop and output the material.

Question strategy by occasion_type:
- wedding_toast: how they met the speaker, the moment the speaker knew the couple was
  right, the dumbest shared memory, what the honoree is famously bad at (lovingly),
  one sincere thing never said out loud.
- retirement/farewell: first impression vs reality, a legendary work incident, a habit
  everyone will remember, what the place loses when they leave.
- birthday/anniversary: era-spanning stories, a running gag in the friendship/family,
  one thing the honoree does not know people admire.
- sensitive_mode: gentle prompts only — favorite memories, what the person taught
  others, small human details worth preserving.

Always dig for specifics: exact words someone said, objects, places, numbers, smells.
"He is clumsy" is useless; "he dropped the ring in the fondue at his own engagement"
is material. If an answer is vague, ask a follow-up on the same story instead of
moving on.

When done, output JSON: { "material": { "stories": [ ... ] } } scoring each story's
comedy_potential and sentiment_potential honestly.
```

### Agent 3 — Structurer (temperature ~0.5)

```
You are the Structurer in a speechwriting writers' room. You receive the
occasion_profile and material. You do not write prose. You design the architecture
of the speech as a beat sheet.

Rules:
- Choose ONE premise (the angle that unifies the speech). State it in one sentence.
- Classic arc for celebratory occasions: strong opener (laugh within the first two
  sentences), 2-3 story beats escalating in either humor or intimacy, one pivot beat
  where the tone turns sincere, a sincere beat that pays off the emotional_core of the
  best story, and a closer (toast/callback that lands both warm and light).
- Respect sentiment_ratio and target_length_seconds: roughly 130 words per minute.
- In sensitive_mode: no joke beats; structure as opener, 2-3 remembrance beats,
  meaning beat, closer.
- Every joke beat must note its mechanism (misdirection, rule of three, act-out,
  callback) and which story it draws from. Plant callbacks early, pay them late.
- Do not invent facts not present in material. Mark any gap as intent for the
  Punch-Up Writer, never as fabricated content.

Output JSON: { "skeleton": { "premise": "...", "beats": [ ... ] } }
```

### Agent 4 — Punch-Up Writer (temperature ~0.9)

```
You are the Punch-Up Writer in a speechwriting writers' room. You receive the
occasion_profile, material, skeleton, and (on revision passes) audience_feedback
with revision_targets.

Write the actual speech text, beat by beat, in the SPEAKER'S voice: first person,
spoken register, contractions welcome, sentences a nervous person can actually say
out loud.

Craft rules:
- Punchline word goes at the end of the sentence. Cut every word that does not serve
  setup or payoff. Specifics from material beat generic phrasing every time.
- Stay at or under humor_ceiling. Roast the honoree only with affection; the audience
  must feel the love underneath every jab. Never touch off_limits topics.
- Do not invent biographical facts. You may exaggerate framing, never events.
- On revision passes: rewrite ONLY the beats listed in revision_targets, using the
  personas' comments as notes from the room. Keep all other beats verbatim.
- Add delivery_note where timing matters ("pause two beats before this line").
- sensitive_mode: warm, plain, unadorned language. No punchlines.

Output JSON: { "draft": { "version": N, "beats": [ ... ] } }
```

### Agent 5 — Test Audience (temperature ~0.8)

```
You are the Test Audience in a speechwriting writers' room. You receive the
occasion_profile and the current draft.

First, generate 3-4 distinct personas FROM audience_composition (for a wedding:
e.g. the honoree's grandmother, the college friends' table, a colleague of the
couple, the teary mother). Give each persona different tastes and tolerances.

Then react to the draft BEAT BY BEAT per persona. Reactions: laugh, smile, flat,
wince, confused, moved. Add a one-line comment in the persona's voice explaining why
("I don't know who Dave is", "that is sweet but it is the third inside joke in a row").

Judge against hard criteria, not vibes:
- Specificity: does the beat use concrete material or generic filler?
- Surprise: is the punchline predictable from the setup?
- Clarity: would someone with no context follow it?
- Safety: does anything wince (embarrassing rather than loving, near off_limits)?
- Economy: is the setup longer than it needs to be?

Verdict rules: "pass" if every beat gets laugh/smile/moved from at least half the
personas AND no beat gets a wince from anyone. Otherwise "revise" and list
revision_targets (beat ids) with the single most important fix for each.
Be strict on iteration 1, pragmatic on iteration 3.

Output JSON: { "audience_feedback": { ... } }
```

### Agent 6 — Director (temperature ~0.4)

```
You are the Director in a speechwriting writers' room. You receive the full state
after the revision loop ends.

Assemble the final speech:
- Concatenate beats into flowing spoken text; smooth transitions without changing jokes.
- Insert delivery marks: [PAUSE], [LOOK AT HONOREE], [RAISE GLASS], [WAIT FOR LAUGH].
- Verify length against target_length_seconds at ~130 words/min; trim the weakest
  material first if over (use audience_feedback to pick), never trim the sincere beat
  or the closer.
- Write 3-5 delivery_tips tailored to a nervous non-performer (where to look, what to
  do with hands, what to do if a joke does not land).
- Give the speech a short title.

Output JSON: { "final": { ... } }
```

---

## 3. Orchestration (pseudocode)

```python
state = new_state(user_freetext)

state |= run(OCCASION_ANALYST, state)          # may return questions_for_user
ask_user_if_needed(state)                       # surface Analyst questions in chat

state |= run_interview_loop(INTERVIEWER, state) # one question per turn, max 6
state |= run(STRUCTURER, state)

while state.loop.iteration < state.loop.max_iterations:
    state |= run(PUNCH_UP_WRITER, state)
    state |= run(TEST_AUDIENCE, state)
    state.loop.iteration += 1
    if state.audience_feedback.verdict == "pass":
        state.loop.stop_reason = "audience_pass"
        break
else:
    state.loop.stop_reason = "max_iterations"

state |= run(DIRECTOR, state)
render(state.final)
```

Implementation notes:
- Every run() streams its output to the "writers' room" pane with the agent's name and
  an avatar. The inter-agent JSON is the show; render reactions as emoji + comment rows.
- Wrap every LLM call in try/except with one retry on JSON parse failure (re-prompt
  with "your last output was not valid JSON, respond with corrected JSON only").
- Strip markdown fences defensively before JSON.parse.
- Keep all six prompts in a /prompts directory as plain text files, not inline strings.
  This is also what you show judges in the README.

---

## 4. Guardrails (non-negotiable)

1. sensitive_mode short-circuits humor everywhere (Analyst sets it; Structurer,
   Punch-Up Writer, and Test Audience all check it). Test with "my grandfather's
   funeral" before demo day.
2. off_limits is enforced twice: Punch-Up Writer must not use those topics; Test
   Audience winces if one slips through.
3. Roast intensity is capped by humor_ceiling from the profile; expose it in the UI
   as a dial the user can lower (never raise above the Analyst's cap for
   sensitive/formal contexts).
4. No fabricated biography. Exaggeration of framing is allowed; invented events are not.

---

## 5. UI (minimum viable)

- Left pane: chat with the Interviewer (and Analyst questions).
- Right pane: live writers' room feed — agent messages, persona reactions per beat,
  revision loop visibly happening.
- Final screen: speech with delivery marks, duration estimate, delivery tips,
  copy button, humor dial + "run the room again" button.
- Landing screen: free-text occasion field plus 4 example chips (Best man speech,
  Retirement, Milestone birthday, Farewell at work).

## 6. Hackathon submission reminders

- Capture the /feedback Codex session ID from the session where you build the core
  orchestrator. Do this early; you cannot reconstruct it later.
- README must call out where Codex accelerated the build and how GPT-5.6 is used
  (six-agent room, revision loop, persona generation). The /prompts directory is
  your evidence.
- Demo video (<3 min, voiceover): one wedding-toast run end-to-end with the live
  writers' room visible, then a 10-second breadth montage (retirement, farewell,
  birthday), then 15 seconds on the sensitive-mode guardrail.
- Open source license on the repo, or share private repo with the two judging emails.

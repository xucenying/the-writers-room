# The Writers' Room

The Writers' Room turns a single free-text brief into a safe, performable stand-up set for an office party, birthday, wedding, open mic, or other everyday occasion. Give the room as much or as little detail as you have, watch its five agents work live, then refine the finished set in plain language.

The result includes a title, delivery-marked set text, duration estimate, practical delivery tips, and the assumptions the room made to fill any gaps safely.

## Five-agent architecture

Each agent reads the shared state and returns structured JSON. The UI streams every agent's progress over SSE, while the completed state remains in the browser so refinements work on serverless deployments.

```mermaid
flowchart LR
    A[Free-text brief] --> B[Gig Analyst]
    B --> C[Structurer]
    C --> D[Punch-Up Writer]
    D --> E[Test Audience]
    E -->|revise, up to 3 passes| D
    E -->|pass or limit reached| F[Director]
    F --> G[Performable stand-up set]
    G --> H[User feedback]
    H --> B
```

| Agent | Role |
| --- | --- |
| Gig Analyst | Extracts the occasion, audience, safety constraints, usable personal material, safe assumptions, and the refinement type. |
| Structurer | Turns the material into a set list with an opener, bits, callbacks, and a closer. |
| Punch-Up Writer | Writes and revises the performable beat-by-beat stand-up draft. |
| Test Audience | Generates audience-specific personas, reacts to every beat, and returns a pass/revise verdict. |
| Director | Produces the final set, delivery marks, duration estimate, and first-time performer tips. |

Safety is built into the flow: children trigger clean mode, grief-adjacent contexts receive warm clean treatment, personal stories are never fabricated, and the audience is never the punchline.

## Setup

Requirements: Node.js 20+ and an OpenAI API key.

```bash
npm install
cp .env.example .env.local
```

Set `OPENAI_API_KEY` in `.env.local`, then start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The default model is `gpt-5.6`; set `OPENAI_MODEL` in `.env.local` to override it. `OPENAI_PROJECT` and `OPENAI_ORGANIZATION` are available for legacy multi-project setups.

For a production check:

```bash
npm run build
npm run start
```

## Sample briefs

### Office party

> I am a product manager at a startup doing three clean minutes for 40 coworkers. Our CEO says "let's circle back" in every meeting, and I once accidentally presented my grocery list instead of the roadmap. Keep it playful, not mean.

### Family birthday

> My dad is turning 60. Family and children will be there. He believes every remote control needs a user manual and calls every streaming service "the Netflix." I want a warm, clean four-minute set with one sincere ending.

### First open mic

> I am a nervous teacher trying my first open mic. I want two minutes about parent emails, pretending to understand school software updates, and losing my coffee every morning. Keep it clean and give me confidence-building delivery tips.

## GPT-5.6 and Codex

GPT-5.6 powers the five role-specific agents. Their system prompts are plain-text files in [`prompts/`](./prompts), making each role inspectable and easy to tune. The model drives the multi-agent revision loop: the Punch-Up Writer drafts, the Test Audience generates personas from the audience group and reviews each beat, and the writer revises against those reactions for up to three passes. The Gig Analyst also routes user feedback so structural changes rebuild the set list while surface changes go straight to rewriting.

Codex accelerated the initial Next.js implementation, the shared-state and orchestration design, the SSE-driven live writers' room, the agent-card presentation layer, the stateless serverless refinement flow, and the deployment-oriented verification work. It also helped keep the prompts, guardrails, JSON retry behavior, and client-side refinement handoff aligned as the spec evolved.

# The Writers' Room

An agentic app that helps ordinary people write a funny, heartfelt speech for any occasion. A six-agent room interviews the speaker, builds a beat sheet, writes a draft, tests it with audience personas, revises it, and directs the final delivery.

## Run locally

```bash
cp .env.example .env.local
# Add your OPENAI_API_KEY to .env.local
npm install
npm run dev
```

Set `OPENAI_MODEL` in `.env.local` to change the model; it defaults to `gpt-5.6`. For legacy multi-project keys, set `OPENAI_PROJECT` (and, where applicable, `OPENAI_ORGANIZATION`) too.

## How it works

- `prompts/` holds the six plain-text system prompts: Occasion Analyst, Interviewer, Structurer, Punch-Up Writer, Test Audience, and Director.
- `src/lib/state.ts` defines the shared, session-persisted state object from the build spec.
- `src/lib/orchestrator.ts` implements the interview turns and the three-pass writer/audience revision loop, with one JSON retry per model call.
- `app/api/room/route.ts` sends server-sent room events to the UI so the inter-agent JSON is visible while the room works.

The Analyst can enable remembrance mode for grief-adjacent occasions. That caps humor at gentle, and the downstream prompts are instructed to use warm anecdotes only. The final humor control can only lower the Analyst's ceiling.

## Codex and GPT-5.6

Codex accelerated the initial Next.js scaffold, shared-state module, live room interface, and orchestration route. GPT-5.6 powers the six role-specific agents, persona generation, and iterative draft feedback loop.

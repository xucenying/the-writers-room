# The Writers' Room

An agentic app that turns a free-text brief into a performable stand-up set for everyday occasions. A five-agent room analyzes the gig, structures the set, writes bits, tests them with audience personas, and directs the final performance.

## Run locally

```bash
cp .env.example .env.local
# Add your OPENAI_API_KEY to .env.local
npm install
npm run dev
```

Set `OPENAI_MODEL` in `.env.local` to change the model; it defaults to `gpt-5.6`. For legacy multi-project keys, set `OPENAI_PROJECT` (and, where applicable, `OPENAI_ORGANIZATION`) too.

## How it works

- `prompts/` holds five plain-text system prompts: Gig Analyst, Structurer, Punch-Up Writer, Test Audience, and Director.
- `src/lib/state.ts` defines the v2 shared, session-persisted state object.
- `src/lib/orchestrator.ts` runs the initial set pipeline and repeatable user feedback refinements, with a three-pass writer/audience revision loop and JSON retry per model call.
- `app/api/room/route.ts` sends server-sent room events to the UI so the inter-agent JSON is visible while the room works.

The Gig Analyst enables clean mode whenever children are in the audience and switches to warm, clean humor for grief-adjacent contexts. The result also surfaces every assumption the room made, and feedback can revise the set repeatedly.

## Codex and GPT-5.6

Codex accelerated the Next.js scaffold, shared-state module, live room interface, and orchestration route. GPT-5.6 powers the five role-specific agents, persona generation, and iterative draft feedback loop.

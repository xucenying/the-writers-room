"use client";

import { FormEvent, useState } from "react";
import type { WritersRoomState } from "@/src/lib/state";

type AgentEvent = { type: "agent"; agent: string; status: "thinking" | "complete"; output?: unknown };
type RecordValue = Record<string, unknown>;

const examples = [
  "Office party: I am a product manager at a small startup, our CEO loves buzzwords, and I need three clean minutes for 40 coworkers.",
  "Family birthday: my dad is turning 60, the whole family including children will be there, and he thinks every remote control needs a user manual.",
  "Open mic first-timer: I am a teacher, nervous, and want a short playful set about parent emails and trying to look organized."
];

const inputHints = [
  { label: "The occasion", template: "The occasion is …" },
  { label: "Audience & size", template: "The audience is … (roughly … people)." },
  { label: "Your job", template: "I spend my days …" },
  { label: "Age or life stage", template: "My age or life stage is …" },
  { label: "Stories or running jokes", template: "A true story or running joke to weave in: …" },
  { label: "Off-limits", template: "Please keep this off-limits: …" },
  { label: "Edge & length", template: "Make it clean / playful / edgy, and about … long." }
];

const avatars: Record<string, string> = {
  "Gig Analyst": "◎",
  Structurer: "⌘",
  "Punch-Up Writer": "✦",
  "Test Audience": "☻",
  Director: "◉"
};

const reactions: Record<string, string> = {
  laugh: "😂",
  smile: "🙂",
  flat: "😐",
  wince: "😬",
  confused: "🤨",
  moved: "🥹"
};

function asRecord(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = "—") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function asText(value: unknown, fallback = "—") {
  return typeof value === "number" || typeof value === "string" ? String(value) : fallback;
}

function formatDuration(seconds: unknown) {
  const total = typeof seconds === "number" && Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function beatLabel(beat: RecordValue) {
  const type = asString(beat.type, "bit").toLowerCase();
  if (type === "opener" || type === "closer") return type;
  if (asString(beat.notes, "").toLowerCase().includes("callback")) return "callback";
  return "bit";
}

function RawOutput({ output }: { output: unknown }) {
  return <details className="raw-output"><summary>Show raw output</summary><pre>{JSON.stringify(output, null, 2)}</pre></details>;
}

function GigAnalystCard({ output }: { output: unknown }) {
  const profile = asRecord(asRecord(output).gig_profile);
  const assumptions = asArray(profile.assumptions).filter((item): item is string => typeof item === "string");
  const audience = asArray(profile.audience_group).filter((item): item is string => typeof item === "string");
  return <>
    <div className="agent-tags">
      <span><b>Occasion</b>{asString(profile.occasion)}</span>
      <span><b>Audience</b>{audience.join(", ") || "mixed"}</span>
      <span><b>Edge</b>{asString(profile.edginess)}</span>
      <span><b>Length</b>{formatDuration(profile.target_length_seconds)}</span>
    </div>
    {assumptions.length > 0 && <div className="agent-assumptions">{assumptions.map((assumption) => <span key={assumption}>{assumption}</span>)}</div>}
  </>;
}

function StructurerCard({ output }: { output: unknown }) {
  const skeleton = asRecord(asRecord(output).skeleton);
  const beats = asArray(skeleton.beats).map(asRecord);
  return <>
    <h3 className="premise">{asString(skeleton.premise)}</h3>
    <ol className="set-list">{beats.map((beat, index) => <li key={`${asString(beat.id, String(index))}-${index}`}><span className={`beat-type ${beatLabel(beat)}`}>{beatLabel(beat)}</span><span>{asString(beat.intent)}</span></li>)}</ol>
  </>;
}

function PunchUpCard({ output }: { output: unknown }) {
  const draft = asRecord(asRecord(output).draft);
  const beats = asArray(draft.beats).map(asRecord);
  const samples = beats.map((beat) => asString(beat.text, "")).filter(Boolean).slice(0, 2);
  return <>
    <p className="draft-summary">Draft v{asText(draft.version, "?")} <span>—</span> {beats.length} beat{beats.length === 1 ? "" : "s"} written</p>
    {samples.length > 0 && <div className="draft-teaser">{samples.map((line, index) => <blockquote key={`${line}-${index}`}>{line}</blockquote>)}</div>}
  </>;
}

function TestAudienceCard({ output }: { output: unknown }) {
  const feedback = asRecord(asRecord(output).audience_feedback);
  const personas = asArray(feedback.personas).map(asRecord);
  const verdict = asString(feedback.verdict, "revise").toLowerCase();
  const targets = asArray(feedback.revision_targets).filter((item): item is string => typeof item === "string");
  return <>
    <div className="verdict-row"><span className={`verdict ${verdict === "pass" ? "pass" : "revise"}`}>{verdict === "pass" ? "PASS" : "REVISE"}</span></div>
    <div className="persona-list">{personas.map((persona, personaIndex) => {
      const reactionsForPersona = asArray(persona.beat_reactions).map(asRecord);
      const notable = reactionsForPersona.find((reaction) => ["wince", "confused", "flat"].includes(asString(reaction.reaction, "").toLowerCase()))
        ?? reactionsForPersona.find((reaction) => ["laugh", "smile", "moved"].includes(asString(reaction.reaction, "").toLowerCase()));
      const notableComment = notable ? asString(notable.comment, "") : "";
      return <div className="persona-row" key={`${asString(persona.name, "Persona")}-${personaIndex}`}><div className="persona-top"><strong>{asString(persona.name, "Audience member")}</strong><div className="reaction-list">{reactionsForPersona.map((reaction, reactionIndex) => {
        const kind = asString(reaction.reaction, "flat").toLowerCase();
        return <span className="reaction" title={asString(reaction.comment, "No comment")} key={`${asString(reaction.beat_id, String(reactionIndex))}-${reactionIndex}`}>{reactions[kind] ?? "•"}</span>;
      })}</div></div>{notableComment && <p className="persona-comment">“{notableComment}”</p>}</div>;
    })}</div>
    {verdict !== "pass" && targets.length > 0 && <div className="revision-targets"><b>Revision targets</b><ul>{targets.map((target) => <li key={target}>{target}</li>)}</ul></div>}
  </>;
}

function DirectorCard({ output }: { output: unknown }) {
  const final = asRecord(asRecord(output).final);
  return <div className="director-summary"><h3>{asString(final.title)}</h3><p>Final cut assembled <span>·</span> {formatDuration(final.estimated_duration_seconds)}</p></div>;
}

function AgentCard({ item }: { item: AgentEvent }) {
  const content = item.agent === "Gig Analyst" ? <GigAnalystCard output={item.output} />
    : item.agent === "Structurer" ? <StructurerCard output={item.output} />
      : item.agent === "Punch-Up Writer" ? <PunchUpCard output={item.output} />
        : item.agent === "Test Audience" ? <TestAudienceCard output={item.output} />
          : <DirectorCard output={item.output} />;
  return <article className="feed-item"><div className="avatar">{avatars[item.agent] ?? "•"}</div><div className="agent-card"><strong>{item.agent}</strong>{item.status === "thinking" ? <p className="agent-thinking">Thinking<span>.</span><span>.</span><span>.</span></p> : <><div className="agent-content">{content}</div><RawOutput output={item.output} /></>}</div></article>;
}

function SetText({ text }: { text: string }) {
  const parts = text.split(/(\[(?:[A-Z][A-Z\s-]*|ACT-OUT(?::[^\]]*)?)\])/g);
  return <div className="set-text">{parts.map((part, index) => part.startsWith("[") && part.endsWith("]") ? <span className="delivery-mark" key={`${part}-${index}`}>{part}</span> : <span key={`text-${index}`}>{part}</span>)}</div>;
}

export default function Home() {
  const [brief, setBrief] = useState("");
  const [feed, setFeed] = useState<AgentEvent[]>([]);
  const [feedback, setFeedback] = useState("");
  const [finalState, setFinalState] = useState<WritersRoomState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runRoom(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/room", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok || !response.body) throw new Error("Could not reach the writers' room.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const data = frame.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
          if (!data) continue;
          const event = JSON.parse(data) as AgentEvent | { type: "session"; sessionId: string } | { type: "final"; state: WritersRoomState } | { type: "error"; message: string };
          if (event.type === "agent") setFeed((current) => {
            if (event.status !== "complete") return [...current, event];
            const thinkingIndex = current.map((item) => item.agent === event.agent && item.status === "thinking").lastIndexOf(true);
            return thinkingIndex < 0 ? [...current, event] : current.map((item, index) => index === thinkingIndex ? event : item);
          });
          if (event.type === "final") setFinalState(event.state);
          if (event.type === "error") setError(event.message);
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The room hit an unexpected error.");
    } finally {
      setBusy(false);
    }
  }

  function start(event: FormEvent) {
    event.preventDefault();
    if (!brief.trim() || busy) return;
    setFeed([]); setFinalState(null);
    void runRoom({ action: "start", text: brief.trim() });
  }

  function refine(event: FormEvent) {
    event.preventDefault();
    if (!finalState || !feedback.trim() || busy) return;
    setFeed([]); setFeedback("");
    void runRoom({ action: "refine", state: finalState, text: feedback.trim() });
  }

  async function copySet() {
    if (finalState) await navigator.clipboard.writeText(finalState.final.set_text);
  }

  function appendHint(template: string) {
    setBrief((current) => `${current}${current.trim() ? "\n" : ""}${template}`);
  }

  if (!finalState && !busy && !error) return <main className="landing"><span className="eyebrow">FIVE AGENTS. ONE KILLER SET.</span><h1>The Writers&apos; Room</h1><p>Bring the details. We&apos;ll shape them into a safe, performable stand-up set and test every beat before it reaches the mic.</p><form onSubmit={start} className="occasion-form"><label htmlFor="brief">Tell the room everything</label><textarea id="brief" value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="The occasion, who&apos;s in the audience, what you do, stories to include, and the tone you want. The more you give, the better the set." rows={8} /><div className="input-hints"><p>Things you could tell the room <em>(all optional)</em></p><div>{inputHints.map((hint) => <button key={hint.label} type="button" onClick={() => appendHint(hint.template)}>{hint.label}</button>)}</div><small>The room fills any gaps with safe assumptions.</small></div><button type="submit">Enter the room <span>→</span></button></form><div className="examples">{examples.map((example) => <button key={example} type="button" onClick={() => setBrief(example)}>{example}</button>)}</div></main>;

  return <main className="room-shell">
    <header className="room-header"><div><span className="eyebrow">THE WRITERS&apos; ROOM</span><strong>{finalState ? finalState.final.title : "Building your set"}</strong></div><span className={`status ${busy ? "live" : ""}`}>{busy ? "ROOM IN SESSION" : "ROOM PAUSED"}</span></header>
    {error && <p className="error">{error}</p>}
    <section className="room-grid solo-feed"><div className="brief-pane"><div className="pane-title"><span>01</span> Your brief</div><p>{brief}</p>{busy && <div className="typing">The room is thinking<span>.</span><span>.</span><span>.</span></div>}</div><div className="feed-pane"><div className="pane-title"><span>02</span> Live writers&apos; room</div><div className="feed-log">{feed.map((item, index) => <AgentCard item={item} key={`${item.agent}-${index}`} />)}</div></div></section>
    {finalState && <section className="final-card"><div className="final-heading"><div><span className="eyebrow">FINAL SET · {finalState.loop.stop_reason?.replace("_", " ")}</span><h2>{finalState.final.title}</h2></div><button onClick={copySet}>Copy plain text</button></div><p className="duration">{formatDuration(finalState.final.estimated_duration_seconds)} · {finalState.loop.iteration} room pass{finalState.loop.iteration === 1 ? "" : "es"}</p>{finalState.gig_profile.assumptions.length > 0 && <div className="assumptions"><strong>The room assumed:</strong>{finalState.gig_profile.assumptions.map((assumption) => <span key={assumption}>{assumption}</span>)}</div>}<SetText text={finalState.final.set_text} /><div className="delivery"><h3>Delivery notes</h3><ul>{finalState.final.delivery_tips.map((tip) => <li key={tip}>{tip}</li>)}</ul></div><form className="feedback-form" onSubmit={refine}><label htmlFor="feedback">Tell the room what to change</label><div><input id="feedback" value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="More jokes about my job, shorter, keep it clean…" disabled={busy} /><button disabled={busy || !feedback.trim()}>Refine set</button></div></form></section>}
  </main>;
}

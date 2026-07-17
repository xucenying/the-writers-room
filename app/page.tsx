"use client";

import { FormEvent, useState } from "react";

type AgentEvent = { type: "agent"; agent: string; status: "thinking" | "complete"; output?: unknown };
type ChatMessage = { speaker: "You" | "Analyst" | "Interviewer"; text: string };
type FinalState = {
  occasion_profile: { humor_ceiling: "gentle" | "playful" | "roast"; sensitive_mode: boolean };
  final: { title: string; speech_text: string; estimated_duration_seconds: number; delivery_tips: string[] };
  loop: { iteration: number; stop_reason: string | null };
};

const examples = [
  "I'm the best man giving a wedding toast for my oldest friend.",
  "I need a warm, funny speech for my manager's retirement.",
  "I'm speaking at my sister's 40th birthday party.",
  "I have to say goodbye to a brilliant colleague at work."
];

const avatars: Record<string, string> = {
  "Occasion Analyst": "◎",
  Interviewer: "?",
  Structurer: "⌘",
  "Punch-Up Writer": "✦",
  "Test Audience": "☻",
  Director: "◉"
};

export default function Home() {
  const [occasion, setOccasion] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [feed, setFeed] = useState<AgentEvent[]>([]);
  const [answer, setAnswer] = useState("");
  const [finalState, setFinalState] = useState<FinalState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runRoom(payload: Record<string, string>) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
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
          const event = JSON.parse(data) as AgentEvent | { type: "session"; sessionId: string } | { type: "chat"; speaker: "Analyst" | "Interviewer"; text: string } | { type: "final"; state: FinalState } | { type: "error"; message: string };
          if (event.type === "session") setSessionId(event.sessionId);
          if (event.type === "agent") setFeed((current) => [...current, event]);
          if (event.type === "chat") setChat((current) => [...current, { speaker: event.speaker, text: event.text }]);
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
    if (!occasion.trim() || busy) return;
    setChat([]);
    setFeed([]);
    setFinalState(null);
    setSessionId(null);
    void runRoom({ action: "start", text: occasion });
  }

  function sendAnswer(event: FormEvent) {
    event.preventDefault();
    if (!sessionId || !answer.trim() || busy) return;
    setChat((current) => [...current, { speaker: "You", text: answer.trim() }]);
    setAnswer("");
    void runRoom({ action: "answer", sessionId, text: answer.trim() });
  }

  async function copySpeech() {
    if (finalState) await navigator.clipboard.writeText(finalState.final.speech_text);
  }

  if (!sessionId && !busy && !error) {
    return (
      <main className="landing">
        <span className="eyebrow">SIX AGENTS. ONE GREAT SPEECH.</span>
        <h1>The Writers&apos; Room</h1>
        <p>Bring the occasion. We&apos;ll find the stories, test the laughs, and make the words sound like you.</p>
        <form onSubmit={start} className="occasion-form">
          <label htmlFor="occasion">What are you speaking for?</label>
          <textarea id="occasion" value={occasion} onChange={(event) => setOccasion(event.target.value)} placeholder="e.g. My sister is getting married and I am her older brother..." rows={4} />
          <button type="submit">Enter the room <span>→</span></button>
        </form>
        <div className="examples">
          {examples.map((example) => <button key={example} type="button" onClick={() => setOccasion(example)}>{example}</button>)}
        </div>
      </main>
    );
  }

  return (
    <main className="room-shell">
      <header className="room-header">
        <div><span className="eyebrow">THE WRITERS&apos; ROOM</span><strong>{finalState ? finalState.final.title : "Finding the good stuff"}</strong></div>
        <span className={`status ${busy ? "live" : ""}`}>{busy ? "ROOM IN SESSION" : "ROOM PAUSED"}</span>
      </header>
      {error && <p className="error">{error}</p>}
      <section className="room-grid">
        <div className="chat-pane">
          <div className="pane-title"><span>01</span> Your conversation</div>
          <div className="chat-log">
            {chat.map((message, index) => <article key={`${message.speaker}-${index}`} className={`bubble ${message.speaker === "You" ? "user" : "agent"}`}><small>{message.speaker}</small><p>{message.text}</p></article>)}
            {busy && <div className="typing">The room is thinking<span>.</span><span>.</span><span>.</span></div>}
          </div>
          {!finalState && <form onSubmit={sendAnswer} className="answer-form"><input value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Give us the details…" disabled={busy || !sessionId} /><button disabled={busy || !sessionId || !answer.trim()} aria-label="Send answer">↑</button></form>}
        </div>
        <div className="feed-pane">
          <div className="pane-title"><span>02</span> Live writers&apos; room</div>
          <div className="feed-log">
            {feed.map((item, index) => <article className="feed-item" key={`${item.agent}-${index}`}><div className="avatar">{avatars[item.agent] ?? "•"}</div><div><strong>{item.agent}</strong><p>{item.status === "thinking" ? "is at work…" : "checked in"}</p>{item.status === "complete" && Boolean(item.output) && <pre>{JSON.stringify(item.output, null, 2)}</pre>}</div></article>)}
          </div>
        </div>
      </section>
      {finalState && <section className="final-card">
        <div className="final-heading"><div><span className="eyebrow">FINAL DRAFT · {finalState.loop.stop_reason?.replace("_", " ")}</span><h2>{finalState.final.title}</h2></div><button onClick={copySpeech}>Copy speech</button></div>
        <p className="duration">≈ {finalState.final.estimated_duration_seconds} seconds · {finalState.loop.iteration} room pass{finalState.loop.iteration === 1 ? "" : "es"}</p>
        <div className="speech-text">{finalState.final.speech_text}</div>
        <div className="delivery"><h3>Delivery notes</h3><ul>{finalState.final.delivery_tips.map((tip) => <li key={tip}>{tip}</li>)}</ul></div>
        <div className="rerun"><label htmlFor="humor">Humor ceiling</label><select id="humor" defaultValue={finalState.occasion_profile.humor_ceiling} disabled={finalState.occasion_profile.sensitive_mode || busy} onChange={(event) => { if (sessionId) void runRoom({ action: "rerun", sessionId, humor: event.target.value }); }}><option value="gentle">Gentle</option><option value="playful">Playful</option><option value="roast">Roast</option></select>{finalState.occasion_profile.sensitive_mode && <small>Remembrance mode keeps this gentle.</small>}</div>
      </section>}
    </main>
  );
}

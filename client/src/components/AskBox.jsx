import { useState } from "react";
import { askQuestion } from "../api.js";

const SUGGESTIONS = ["How do I run this project?", "Where should a beginner start?", "How do I contribute?"];

export default function AskBox({ url }) {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");

  async function ask(q) {
    const text = (q ?? question).trim();
    if (text.length < 3 || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await askQuestion(url, text);
      setHistory((h) => [{ q: text, a: res.answer, mode: res.mode, notice: res.notice }, ...h]);
      setQuestion("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card ask">
      <h3>Ask RepoSaathi about this repository</h3>
      <div className="ask-row">
        <input
          value={question}
          maxLength={500}
          placeholder="e.g. What does the src folder do?"
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          aria-label="Your question"
        />
        <button type="button" className="btn" disabled={loading || question.trim().length < 3} onClick={() => ask()}>
          {loading ? "Thinking..." : "Ask"}
        </button>
      </div>
      <div className="suggest">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" className="pill" disabled={loading} onClick={() => ask(s)}>
            {s}
          </button>
        ))}
      </div>
      {error && <p className="error-text">{error}</p>}
      {history.map((h, i) => (
        <div key={i} className="qa">
          <p className="q">{h.q}</p>
          <p className="a">{h.a}</p>
          <p className="muted small">
            {h.mode === "ai" ? "AI answer based on the files read from this repository." : "Keyword search (AI mode is off or unavailable)."}
            {h.notice ? ` ${h.notice}` : ""}
          </p>
        </div>
      ))}
    </section>
  );
}

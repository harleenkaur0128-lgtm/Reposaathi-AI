import { useEffect, useState } from "react";
import { analyzeRepo, getHealth } from "./api.js";
import XRay from "./components/XRay.jsx";
import Roadmap from "./components/Roadmap.jsx";
import SetupDoctor from "./components/SetupDoctor.jsx";
import AskBox from "./components/AskBox.jsx";
import AiSettings from "./components/AiSettings.jsx";

const EXAMPLES = ["firstcontributions/first-contributions", "expressjs/express", "pallets/flask", "octocat/Hello-World"];

const TABS = [
  { id: "xray", label: "Repository X-ray", icon: "🔍" },
  { id: "roadmap", label: "Contribution Roadmap", icon: "🧭" },
  { id: "setup", label: "Setup Doctor", icon: "🛠️" },
];

const STAGES = ["Fetching repository data from GitHub...", "Reading README and key files...", "Preparing your beginner guide..."];

export default function App() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [analyzedUrl, setAnalyzedUrl] = useState("");
  const [tab, setTab] = useState("xray");
  const [health, setHealth] = useState(null);
  const [showAi, setShowAi] = useState(false);

  const refreshHealth = () => getHealth().then(setHealth);
  useEffect(() => {
    refreshHealth();
  }, []);

  // Rotate the loading message so the user sees progress.
  useEffect(() => {
    if (!loading) return undefined;
    setStage(0);
    const id = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 1800);
    return () => clearInterval(id);
  }, [loading]);

  async function analyze(value) {
    const target = (value ?? url).trim();
    if (!target || loading) return;
    setLoading(true);
    setError("");
    try {
      const data = await analyzeRepo(target);
      setResult(data);
      setAnalyzedUrl(target);
      setTab("xray");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function pickExample(ex) {
    setUrl(ex);
    analyze(ex);
  }

  const aiLabel = health?.ai?.enabled ? `AI: ${health.ai.provider} • ${health.ai.model}` : health ? "AI off • rule-based mode" : null;

  return (
    <div className="page">
      <header className="top">
        <div className="brand">
          <span className="logo">🧭</span>
          <div>
            <h1>RepoSaathi AI</h1>
            <p>Your first step into open source starts here.</p>
          </div>
        </div>
        <button
          type="button"
          className={`badge btn-badge ${health?.ai?.enabled ? "on" : "off"}`}
          title={health?.ai?.reason || "Click to change AI settings"}
          onClick={() => setShowAi((v) => !v)}
        >
          {aiLabel || "AI settings"} ⚙️
        </button>
      </header>

      <main>
        {showAi && <AiSettings health={health} onChanged={refreshHealth} onClose={() => setShowAi(false)} />}
        <section className="hero">
          <h2>Paste a GitHub repository. Get a clear next step.</h2>
          <form
            className="url-row"
            onSubmit={(e) => {
              e.preventDefault();
              analyze();
            }}
          >
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/owner/repository"
              aria-label="GitHub repository URL"
              autoFocus
            />
            <button type="submit" className="btn big" disabled={loading || !url.trim()}>
              {loading ? "Analysing..." : "Analyse"}
            </button>
          </form>
          <div className="suggest">
            <span className="muted small">Try:</span>
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" className="pill" disabled={loading} onClick={() => pickExample(ex)}>
                {ex}
              </button>
            ))}
          </div>
        </section>

        {loading && (
          <div className="loading" role="status">
            <div className="spinner" />
            <p>{STAGES[stage]}</p>
          </div>
        )}

        {error && !loading && (
          <div className="error-box" role="alert">
            <strong>Could not analyse this repository</strong>
            <p>{error}</p>
          </div>
        )}

        {result && !loading && (
          <section className="results">
            <div className="repo-head card">
              {result.repo.avatar && <img src={result.repo.avatar} alt="" width="56" height="56" />}
              <div className="grow">
                <h2>
                  <a href={result.repo.url} target="_blank" rel="noreferrer">
                    {result.repo.fullName}
                  </a>
                </h2>
                <p>{result.repo.description || "No description provided."}</p>
                <div className="meta">
                  <span>⭐ {result.repo.stars.toLocaleString()}</span>
                  <span>🍴 {result.repo.forks.toLocaleString()}</span>
                  <span>🐞 {result.repo.openIssues.toLocaleString()} open issues</span>
                  {result.repo.language && <span>💻 {result.repo.language}</span>}
                  <span>📄 {result.repo.license || "No license detected"}</span>
                </div>
              </div>
            </div>

            {result.warnings.map((w) => (
              <p key={w} className="notice warn-box">
                ⚠️ {w}
              </p>
            ))}

            <nav className="tabs" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  className={tab === t.id ? "tab active" : "tab"}
                  onClick={() => setTab(t.id)}
                >
                  <span>{t.icon}</span> {t.label}
                </button>
              ))}
            </nav>

            {tab === "xray" && <XRay data={result} />}
            {tab === "roadmap" && <Roadmap data={result} />}
            {tab === "setup" && <SetupDoctor data={result} />}

            <AskBox url={analyzedUrl} />

            <p className="disclaimer">
              {result.ai.used
                ? `Explanations were written by ${result.ai.model} using only the files retrieved from this repository, and file names are checked against the real file list. `
                : "These guides were generated with built-in rules from the retrieved repository files (no AI model used). "}
              RepoSaathi is a guide, not a replacement for reading the project's documentation and contribution rules. AI can make mistakes and repositories change.
            </p>
          </section>
        )}
      </main>

      <footer className="foot">RepoSaathi AI • Built for Hacktoberfest Hack Day • MIT License</footer>
    </div>
  );
}

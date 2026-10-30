import { useState } from "react";
import { saveAiConfig, testAiConnection, clearAiConfig } from "../api.js";

const PROVIDERS = {
  anthropic: { label: "Anthropic (Claude)", hint: "Key starts with sk-ant-  •  get one at console.anthropic.com", model: "claude-sonnet-5-5" },
  openai: { label: "OpenAI / compatible", hint: "Key starts with sk-  •  also works with Groq, OpenRouter, etc.", model: "gpt-4o-mini" },
  gemini: { label: "Google Gemini (free tier)", hint: "Get a free key at aistudio.google.com/apikey", model: "gemini-2.0-flash" },
};

export default function AiSettings({ health, onChanged, onClose }) {
  const [provider, setProvider] = useState(health?.ai?.provider && PROVIDERS[health.ai.provider] ? health.ai.provider : "gemini");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function run(fn) {
    setBusy(true);
    setResult(null);
    try {
      const r = await fn();
      setResult(r);
      onChanged();
    } catch (err) {
      setResult({ ok: false, message: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card ai-settings">
      <div className="ai-head">
        <h3>AI settings</h3>
        <button type="button" className="pill" onClick={onClose}>Close</button>
      </div>
      <p className="muted small">
        Paste your key here and click <strong>Save &amp; Test</strong>. It is saved to <code>server/.env</code> on your computer and works immediately, with no restart needed.
      </p>

      <label className="field">
        Provider
        <select value={provider} onChange={(e) => setProvider(e.target.value)}>
          {Object.entries(PROVIDERS).map(([id, p]) => (
            <option key={id} value={id}>{p.label}</option>
          ))}
        </select>
      </label>
      <p className="muted small">{PROVIDERS[provider].hint}</p>

      <label className="field">
        API key
        <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Paste your API key" autoComplete="off" />
      </label>

      <label className="field">
        Model (optional, default: {PROVIDERS[provider].model})
        <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={PROVIDERS[provider].model} />
      </label>

      {provider === "openai" && (
        <label className="field">
          Base URL (optional, for Groq / OpenRouter / Ollama)
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" />
        </label>
      )}

      <div className="ai-actions">
        <button type="button" className="btn" disabled={busy || apiKey.trim().length < 8} onClick={() => run(() => saveAiConfig({ provider, apiKey, model, baseUrl }))}>
          {busy ? "Testing..." : "Save & Test"}
        </button>
        {health?.ai?.enabled && (
          <>
            <button type="button" className="pill" disabled={busy} onClick={() => run(testAiConnection)}>Re-test current key</button>
            <button type="button" className="pill" disabled={busy} onClick={() => run(clearAiConfig)}>Remove key</button>
          </>
        )}
      </div>

      {result && (
        <p className={result.ok ? "notice ok-box" : "notice warn-box"}>
          {result.ok ? "✅ " : "⚠️ "}
          {result.message || (result.ok ? "Done." : "Something went wrong.")}
        </p>
      )}
    </section>
  );
}

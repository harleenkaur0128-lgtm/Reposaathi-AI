// AI layer. Talks to Anthropic, OpenAI-compatible APIs or Google Gemini using plain fetch.
// The model only ever sees data retrieved from GitHub, and its output is checked against the
// real file tree before it is shown (so it cannot invent files that do not exist).

import { AppError } from "./github.js";

const AI_TIMEOUT_MS = 60000;

const DEFAULT_MODELS = {
  anthropic: "claude-sonnet-5-5",
  openai: "gpt-4o-mini",
  gemini: "gemini-2.0-flash",
};

// ---------- configuration ----------

// Clean a value from .env: trim spaces and remove accidental quotes.
const clean = (v) => String(v ?? "").trim().replace(/^["']|["']$/g, "").trim();

export function getAiConfig() {
  const e = process.env;
  const keys = {
    anthropic: clean(e.ANTHROPIC_API_KEY),
    openai: clean(e.OPENAI_API_KEY),
    gemini: clean(e.GEMINI_API_KEY),
  };
  let provider = clean(e.AI_PROVIDER).toLowerCase();

  if (provider === "none") {
    return { enabled: false, provider: "none", model: null, reason: "AI_PROVIDER is set to \"none\" in your .env file." };
  }
  if (provider && !keys[provider]) {
    const known = Object.keys(keys).includes(provider);
    return {
      enabled: false,
      provider: "none",
      model: null,
      reason: known
        ? `AI_PROVIDER=${provider} but ${provider.toUpperCase()}_API_KEY is empty in your .env file.`
        : `AI_PROVIDER=${provider} is not valid. Use anthropic, openai or gemini (or leave it empty).`,
    };
  }
  if (!provider) {
    if (keys.anthropic) provider = "anthropic";
    else if (keys.openai) provider = "openai";
    else if (keys.gemini) provider = "gemini";
    else {
      return { enabled: false, provider: "none", model: null, reason: "No API key found. Put a key after ANTHROPIC_API_KEY= (or OPENAI_API_KEY= / GEMINI_API_KEY=) in server/.env and restart." };
    }
  }
  return { enabled: true, provider, model: clean(e.AI_MODEL) || DEFAULT_MODELS[provider], key: keys[provider] };
}

export function publicAiStatus() {
  const { enabled, provider, model, reason } = getAiConfig();
  return { enabled, provider, model, reason };
}

// ---------- provider calls ----------

async function postJson(url, headers, body) {
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
  } catch {
    throw new Error("could not reach the AI provider (network or timeout)");
  }
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* leave data null */
  }
  if (!res.ok) {
    const detail = data?.error?.message || data?.error || text.slice(0, 200);
    throw new Error(`AI provider returned ${res.status}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  }
  return data;
}

async function callModel({ system, user, maxTokens = 3500 }) {
  const cfg = getAiConfig();
  if (!cfg.enabled) throw new Error("AI is not configured");

  if (cfg.provider === "anthropic") {
    const data = await postJson(
      "https://api.anthropic.com/v1/messages",
      { "x-api-key": cfg.key, "anthropic-version": "2023-06-01" },
      { model: cfg.model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] }
    );
    const text = (data?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    if (!text) throw new Error("AI returned an empty response");
    return text;
  }

  if (cfg.provider === "openai") {
    const base = (clean(process.env.OPENAI_BASE_URL) || "https://api.openai.com/v1").replace(/\/+$/, "");
    const data = await postJson(
      `${base}/chat/completions`,
      { Authorization: `Bearer ${cfg.key}` },
      {
        model: cfg.model,
        temperature: 0.2,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }
    );
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error("AI returned an empty response");
    return text;
  }

  if (cfg.provider === "gemini") {
    const data = await postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`,
      { "x-goog-api-key": cfg.key },
      {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: maxTokens },
      }
    );
    const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
    if (!text) throw new Error("AI returned an empty response");
    return text;
  }

  throw new Error(`Unknown AI provider: ${cfg.provider}`);
}

// ---------- prompt building ----------

function buildContextText(ctx) {
  const { meta } = ctx;
  const langs = Object.keys(ctx.languages).slice(0, 6).join(", ") || "unknown";
  const parts = [
    `Repository: ${meta.fullName}`,
    `Description: ${meta.description || "(none)"}`,
    `Main languages: ${langs}`,
    `Topics: ${meta.topics.join(", ") || "(none)"}`,
    `License: ${meta.license || "(none detected)"}`,
    `Default branch: ${meta.defaultBranch}`,
    `Clone URL: ${meta.url}.git`,
    "",
    `FILE TREE (${ctx.promptTree.length} of ${ctx.totalFiles} files shown, depth up to 3):`,
    ctx.promptTree.join("\n"),
  ];
  if (ctx.readme.text) parts.push("", `--- README (${ctx.readme.path}) ---`, ctx.readme.text);
  for (const [path, text] of Object.entries(ctx.files)) parts.push("", `--- FILE: ${path} ---`, text);
  return parts.join("\n");
}

const GUIDE_SYSTEM = `You are RepoSaathi AI, a patient mentor who helps complete beginners understand GitHub repositories and make their first open-source contribution.

STRICT RULES:
- Use ONLY the repository context provided. Never invent files, folders, commands or features.
- If something is not in the provided context, say "not found in the files I read" instead of guessing.
- Only mention file or folder paths that appear in the FILE TREE.
- Write in simple, friendly English. Explain jargon in a few words.
- Setup commands must come from the README or config files provided. If unsure, say so in "note".
- Do NOT invent GitHub issues; issues are provided separately by the app.
- Respond with ONE valid JSON object and nothing else (no markdown fences).`;

const GUIDE_SCHEMA = `Return JSON with exactly this shape:
{
  "summary": "2-4 sentences: what this project is, who uses it, why it matters",
  "techStack": [{"name": "", "note": "short, beginner friendly"}],
  "keyFolders": [{"path": "folder from the tree", "explanation": "what it holds, in one sentence"}],
  "keyFiles": [{"path": "file from the tree", "why": "why a beginner should read it"}],
  "roadmap": [{"title": "", "detail": "1-2 sentences, practical, specific to THIS repo"}],
  "setup": {
    "prerequisites": ["tools to install"],
    "steps": [{"title": "", "command": "exact command or empty string", "note": "short explanation", "source": "file the step came from or empty string"}],
    "commonErrors": [{"problem": "", "fix": ""}]
  },
  "questions": ["3-5 questions a beginner should investigate while reading the code"]
}
Limits: techStack max 8, keyFolders max 8, keyFiles max 8, roadmap 5-7 steps (end with fork/branch/pull request), setup.steps max 8, commonErrors max 5.`;

// ---------- JSON parsing & normalisation ----------

function extractJson(text) {
  const cleaned = text.replace(/```json|```/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("AI did not return JSON");
  return JSON.parse(cleaned.slice(start, end + 1));
}

const str = (v) => (typeof v === "string" ? v.trim() : "");
const list = (v) => (Array.isArray(v) ? v : []);

function normalizeGuide(raw, fallback, ctx) {
  const { meta } = ctx;
  const pathSet = new Set(ctx.allPaths);
  const dirSet = new Set(ctx.dirs);
  const fileUrl = (p) => `${meta.url}/blob/${meta.defaultBranch}/${p}`;
  const dirUrl = (p) => `${meta.url}/tree/${meta.defaultBranch}/${p}`;

  const techStack = list(raw.techStack)
    .map((t) => ({ name: str(t?.name), note: str(t?.note) }))
    .filter((t) => t.name)
    .slice(0, 8);

  // Grounding check: drop any folder/file the model mentioned that does not exist in the repo.
  const keyFolders = list(raw.keyFolders)
    .map((f) => ({ path: str(f?.path).replace(/\/+$/, ""), explanation: str(f?.explanation) }))
    .filter((f) => f.path && f.explanation && (dirSet.has(f.path) || ctx.allPaths.some((p) => p.startsWith(f.path + "/"))))
    .slice(0, 8)
    .map((f) => ({ ...f, url: dirUrl(f.path) }));

  const keyFiles = list(raw.keyFiles)
    .map((f) => ({ path: str(f?.path), why: str(f?.why) }))
    .filter((f) => f.path && f.why && pathSet.has(f.path))
    .slice(0, 8)
    .map((f) => ({ ...f, url: fileUrl(f.path) }));

  const roadmapRaw = list(raw.roadmap)
    .map((s) => ({ title: str(s?.title), detail: str(s?.detail), link: null }))
    .filter((s) => s.title && s.detail)
    .slice(0, 8);

  const rawSetup = raw.setup && typeof raw.setup === "object" ? raw.setup : {};
  const setupSteps = list(rawSetup.steps)
    .map((s) => ({
      title: str(s?.title),
      command: typeof s?.command === "string" ? s.command.trim() : "",
      note: str(s?.note),
      source: pathSet.has(str(s?.source)) ? str(s?.source) : null,
    }))
    .filter((s) => s.title)
    .slice(0, 8);
  const prerequisites = list(rawSetup.prerequisites).map(str).filter(Boolean).slice(0, 8);
  const commonErrors = list(rawSetup.commonErrors)
    .map((e) => ({ problem: str(e?.problem), fix: str(e?.fix) }))
    .filter((e) => e.problem && e.fix)
    .slice(0, 6);

  const questions = list(raw.questions).map(str).filter(Boolean).slice(0, 5);

  // For every section the AI left empty (or that we filtered out as ungrounded), use the rule-based version.
  return {
    summary: str(raw.summary) || fallback.summary,
    techStack: techStack.length ? techStack : fallback.techStack,
    keyFolders: keyFolders.length ? keyFolders : fallback.keyFolders,
    keyFiles: keyFiles.length ? keyFiles : fallback.keyFiles,
    roadmap: roadmapRaw.length >= 3 ? roadmapRaw : fallback.roadmap,
    setup: {
      prerequisites: prerequisites.length ? prerequisites : fallback.setup.prerequisites,
      steps: setupSteps.length ? setupSteps : fallback.setup.steps,
      commonErrors: commonErrors.length ? commonErrors : fallback.setup.commonErrors,
    },
    questions: questions.length ? questions : fallback.questions,
  };
}

// ---------- public functions ----------

// Returns { guide, ai: {used, provider, model, error?} }
export async function generateGuide(ctx, fallbackGuide) {
  const cfg = getAiConfig();
  if (!cfg.enabled) {
    return { guide: fallbackGuide, ai: { used: false, provider: "none", model: null } };
  }
  try {
    const user = `${buildContextText(ctx)}\n\n=====\nTask: create a beginner guide for this repository.\n${GUIDE_SCHEMA}`;
    const text = await callModel({ system: GUIDE_SYSTEM, user });
    const raw = extractJson(text);
    return {
      guide: normalizeGuide(raw, fallbackGuide, ctx),
      ai: { used: true, provider: cfg.provider, model: cfg.model },
    };
  } catch (err) {
    console.error("[ai] guide generation failed:", err.message);
    return {
      guide: fallbackGuide,
      ai: { used: false, provider: cfg.provider, model: cfg.model, error: `AI unavailable (${err.message}). Showing rule-based guidance instead.` },
    };
  }
}

const ASK_SYSTEM = `You are RepoSaathi AI, a patient mentor for beginners exploring a GitHub repository.
Answer the user's question using ONLY the repository context provided.
- Keep the answer under 180 words, in simple friendly English.
- Mention the file names your answer comes from.
- If the context does not contain the answer, say so honestly and suggest where the beginner could look (e.g. the Issues tab or docs folder).
- Never invent files, commands or features.
- Plain text only (short paragraphs or "-" bullets). No JSON.`;

export async function answerQuestion(ctx, question) {
  const cfg = getAiConfig();
  if (!cfg.enabled) throw new AppError("AI mode is off.", 503, "AI_OFF");
  const user = `${buildContextText(ctx)}\n\n=====\nBeginner's question: ${question}`;
  try {
    const answer = await callModel({ system: ASK_SYSTEM, user, maxTokens: 800 });
    return answer.trim();
  } catch (err) {
    console.error("[ai] ask failed:", err.message);
    throw new AppError(`The AI could not answer right now (${err.message}).`, 502, "AI_FAILED");
  }
}

// Sends a tiny request to check that the key and model really work. Returns { ok, message }.
export async function testAi() {
  const cfg = getAiConfig();
  if (!cfg.enabled) return { ok: false, message: cfg.reason };
  try {
    const text = await callModel({ system: "Reply with the single word: ok", user: "ping", maxTokens: 20 });
    return { ok: true, message: `Connected to ${cfg.provider} (${cfg.model}). Reply: ${text.trim().slice(0, 40)}` };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

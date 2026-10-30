import { envInfo, saveEnv } from "./src/env.js";
import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { AppError, parseRepoUrl, fetchRepoContext } from "./src/github.js";
import { buildHeuristicGuide, keywordAnswer } from "./src/heuristic.js";
import { generateGuide, answerQuestion, publicAiStatus, testAi } from "./src/ai.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 5001;

const app = express();
app.use(cors());
app.use(express.json({ limit: "50kb" }));

// ---------- tiny in-memory helpers ----------

// Cache repository data for 10 minutes so repeated demos do not burn the GitHub rate limit.
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map();

async function getContext(owner, repo) {
  const key = `${owner}/${repo}`.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.ctx;
  const ctx = await fetchRepoContext(owner, repo);
  cache.set(key, { at: Date.now(), ctx });
  if (cache.size > 50) cache.delete(cache.keys().next().value);
  return ctx;
}

// Very small rate limiter: 30 API requests per minute per IP.
const hits = new Map();
function rateLimit(req, res, next) {
  const ip = req.ip || "unknown";
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60000);
  if (recent.length >= 30) {
    return res.status(429).json({ error: "Too many requests. Please wait a minute and try again." });
  }
  recent.push(now);
  hits.set(ip, recent);
  next();
}

// ---------- routes ----------

app.get("/api/health", (req, res) => {
  res.json({ ok: true, ai: publicAiStatus(), envFile: envInfo.loadedFrom ? "found" : "missing", githubToken: Boolean(process.env.GITHUB_TOKEN) });
});

app.post("/api/analyze", rateLimit, async (req, res, next) => {
  try {
    const { owner, repo } = parseRepoUrl(req.body?.url);
    const ctx = await getContext(owner, repo);

    const fallback = buildHeuristicGuide(ctx);
    const { guide, ai } = await generateGuide(ctx, fallback);

    const sources = [ctx.readme.path, ...Object.keys(ctx.files)].filter(Boolean);
    const warnings = [...ctx.warnings];
    if (ai.error) warnings.push(ai.error);

    res.json({
      repo: ctx.meta,
      languages: ctx.languages,
      totalFiles: ctx.totalFiles,
      guide: {
        summary: guide.summary,
        techStack: guide.techStack,
        keyFolders: guide.keyFolders,
        keyFiles: guide.keyFiles,
        questions: guide.questions,
      },
      roadmap: {
        steps: guide.roadmap,
        issues: ctx.issues, // always real GitHub data, never AI-generated
        issuesUrl: `${ctx.meta.url}/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22`,
      },
      setup: guide.setup,
      ai,
      sources,
      warnings,
    });
  } catch (err) {
    next(err);
  }
});

app.post("/api/ask", rateLimit, async (req, res, next) => {
  try {
    const question = String(req.body?.question || "").trim();
    if (question.length < 3) throw new AppError("Please type a question.", 400, "BAD_QUESTION");
    if (question.length > 500) throw new AppError("Please keep your question under 500 characters.", 400, "BAD_QUESTION");

    const { owner, repo } = parseRepoUrl(req.body?.url);
    const ctx = await getContext(owner, repo);

    try {
      const answer = await answerQuestion(ctx, question);
      return res.json({ answer, mode: "ai", sources: [] });
    } catch (err) {
      if (!(err instanceof AppError) || (err.code !== "AI_OFF" && err.code !== "AI_FAILED")) throw err;
      const fb = keywordAnswer(ctx, question);
      return res.json({ answer: fb.answer, mode: "keyword", sources: fb.sources, notice: err.code === "AI_FAILED" ? err.message : undefined });
    }
  } catch (err) {
    next(err);
  }
});

// ---------- AI settings (so you never have to edit .env by hand) ----------

// Only the person running the server (this computer) may read or change keys.
function localOnly(req, res, next) {
  const ip = req.socket.remoteAddress || "";
  if (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") return next();
  res.status(403).json({ error: "AI settings can only be changed from the computer running the server." });
}

app.post("/api/ai/config", localOnly, async (req, res) => {
  const provider = String(req.body?.provider || "").trim().toLowerCase();
  const apiKey = String(req.body?.apiKey || "").trim().replace(/^["']|["']$/g, "");
  const model = String(req.body?.model || "").trim();
  const baseUrl = String(req.body?.baseUrl || "").trim();
  if (!["anthropic", "openai", "gemini"].includes(provider)) {
    return res.status(400).json({ ok: false, message: "Choose a provider." });
  }
  if (apiKey.length < 8) return res.status(400).json({ ok: false, message: "Paste your API key first." });

  const keyName = { anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY", gemini: "GEMINI_API_KEY" }[provider];
  const updates = { AI_PROVIDER: provider, [keyName]: apiKey, AI_MODEL: model };
  if (provider === "openai" && baseUrl) updates.OPENAI_BASE_URL = baseUrl;
  try {
    saveEnv(updates);
  } catch (err) {
    return res.status(500).json({ ok: false, message: `Could not save server/.env: ${err.message}` });
  }
  cache.clear();
  const result = await testAi();
  res.json({ ...result, ai: publicAiStatus() });
});

app.post("/api/ai/test", localOnly, async (req, res) => {
  const result = await testAi();
  res.json({ ...result, ai: publicAiStatus() });
});

app.post("/api/ai/clear", localOnly, (req, res) => {
  saveEnv({ AI_PROVIDER: "", ANTHROPIC_API_KEY: "", OPENAI_API_KEY: "", GEMINI_API_KEY: "", AI_MODEL: "" });
  cache.clear();
  res.json({ ok: true, ai: publicAiStatus() });
});

app.use("/api", (req, res) => {
  res.status(404).json({ error: "API route not found." });
});

// ---------- serve the built React app (after `npm run build`) ----------

const dist = path.resolve(__dirname, "../client/dist");
if (fs.existsSync(path.join(dist, "index.html"))) {
  app.use(express.static(dist));
  app.get("*", (req, res) => res.sendFile(path.join(dist, "index.html")));
}

// ---------- error handler ----------

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, code: err.code });
  }
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid request body." });
  }
  console.error("[server] unexpected error:", err);
  res.status(500).json({ error: "Something went wrong on the server. Please try again." });
});

const server = app.listen(PORT, () => {
  const ai = publicAiStatus();
  console.log(`\n  RepoSaathi AI server running on http://localhost:${PORT}`);
  console.log(`  .env file: ${envInfo.loadedFrom || "NOT FOUND (expected at server/.env)"}`);
  for (const f of envInfo.misnamed) console.log(`  WARNING: "${f}" looks like a wrongly named env file. Rename it to exactly ".env"`);
  console.log(`  AI mode: ${ai.enabled ? `ON - ${ai.provider} (${ai.model})` : `OFF - ${ai.reason}`}`);
  console.log(`  GitHub token: ${process.env.GITHUB_TOKEN ? "set" : "not set (60 requests/hour limit)"}\n`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n  ERROR: port ${PORT} is already in use. An old copy of the server is still running.`);
    console.error("  Close the other terminal windows running RepoSaathi, or run in PowerShell:");
    console.error(`  Get-NetTCPConnection -LocalPort ${PORT} | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }\n`);
    process.exit(1);
  }
  throw err;
});

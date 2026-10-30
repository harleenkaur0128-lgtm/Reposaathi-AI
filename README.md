# 🧭 RepoSaathi AI

**Your first step into open source starts here.**

Paste a public GitHub repository link and RepoSaathi AI turns it into a beginner-friendly learning path:

| Tool | What it does |
|---|---|
| 🔍 **Repository X-ray** | Plain-language summary, technologies, important folders and the files to read first |
| 🧭 **Contribution Roadmap** | Step-by-step path to a first contribution + real "good first issue" / "help wanted" issues from GitHub |
| 🛠️ **Setup Doctor** | Setup commands (copy-paste ready) and fixes for common errors, based on the repo's own files |
| 💬 **Ask box** | Ask follow-up questions about the repository |

Built for **Hacktoberfest Hack Day (Amritsar × KCET)**.

---

## ⚡ Quick start (3 steps)

**You need:** [Node.js](https://nodejs.org) version **18 or newer** (check with `node -v`).

```bash
# 1. Open a terminal inside the extracted reposaathi-ai folder, then install everything
npm run setup

# 2. (Optional but recommended) add your keys
#    Copy server/.env.example to server/.env and fill in a key  (see "AI setup" below)

# 3. Start the app
npm run dev
```

Open **http://localhost:5173** in your browser. That's it.

> The app works even with **no keys at all** (rule-based mode). Add an AI key for much better explanations.

---

## 🤖 AI setup

**Easiest way:** run the app, click the **⚙️ AI** badge at the top right, pick a provider, paste your key and press **Save & Test**. It works instantly (no restart) and tells you the exact error if the key is rejected. Google Gemini has a free tier (key from https://aistudio.google.com/apikey).

**Manual way:**

Open `server/.env` (copy it from `server/.env.example`) and fill **one** provider:

```env
# Claude (Anthropic)
ANTHROPIC_API_KEY=your_key_here

# OR any OpenAI-compatible API (OpenAI, Groq, OpenRouter, ...)
OPENAI_API_KEY=your_key_here
OPENAI_BASE_URL=https://api.openai.com/v1

# OR Google Gemini
GEMINI_API_KEY=your_key_here

# Optional: choose a specific model (otherwise sensible defaults are used)
AI_MODEL=
```

⚠️ **Hackathon rule check:** your slides say the exact model must follow the official event brief.
If the brief requires a specific model/provider, set it here (`AI_PROVIDER` + key + `AI_MODEL`). No code changes needed.

Also add a free `GITHUB_TOKEN` (https://github.com/settings/tokens, no scopes needed) to avoid GitHub's 60-requests/hour limit during the demo.

The header badge in the app shows whether AI is **on** or **off**.

---

## 🧠 How it works

```
React UI  →  Express API  →  GitHub REST API  →  AI model  →  Result in React UI
 (paste URL)   (validate)     (README, tree,       (explains      (X-ray, Roadmap,
                               config files,        retrieved       Setup Doctor)
                               issues)              files only)
```

**Keeping the AI honest (grounding):**
- The model only receives data fetched from GitHub (README, file tree, config files).
- The prompt forbids inventing files/commands; unknown things must be reported as "not found".
- Every file/folder the AI mentions is **checked against the real file tree**. Made-up paths are dropped.
- GitHub issues are always **real API data**, never AI-generated.
- If the AI fails or returns incomplete data, rule-based guidance fills the gap, so the demo never breaks.
- Errors handled gracefully: invalid URL, repo not found/private, GitHub rate limit, missing README, empty repo, AI failure.

---

## 📁 Project structure

```
reposaathi-ai/
├── package.json            ← root scripts: setup / dev / build / start
├── server/                 ← Node.js + Express backend
│   ├── index.js            ← routes: /api/analyze, /api/ask, /api/health
│   ├── .env.example        ← copy to .env
│   └── src/
│       ├── github.js       ← URL parsing + GitHub API fetching
│       ├── ai.js           ← Claude / OpenAI-compatible / Gemini + grounding checks
│       └── heuristic.js    ← rule-based fallback guide
└── client/                 ← React (Vite) frontend
    └── src/
        ├── App.jsx
        ├── api.js
        ├── styles.css
        └── components/     ← XRay, Roadmap, SetupDoctor, AskBox, CopyButton
```

---

## 🎤 Demo script (matches your slide 10)

1. Open the app, paste `https://github.com/firstcontributions/first-contributions` (or any repo you know well).
2. Show the repository card and the **X-ray** tab (summary, folders, files to read first).
3. Open **Contribution Roadmap** and show the real beginner issues.
4. Open **Setup Doctor**, click **Copy** on a command.
5. Use the **Ask box**: "How do I contribute?"
6. Be honest about limits: AI can be wrong, repos change, suggested issues may be claimed. The app says so on screen.

**Before submitting:** test 2–3 different repos, test an invalid URL, make the GitHub repo public, and keep the MIT `LICENSE` file.

---

## 🛠️ Troubleshooting

| Problem | Fix |
|---|---|
| `npm run setup` fails | Check `node -v` is 18+. Delete `node_modules` folders and run again. |
| Page loads but "Cannot reach the RepoSaathi server" | The backend is not running. Use `npm run dev` from the root folder (it starts both). |
| `EADDRINUSE` (port in use) | Change `PORT` in `server/.env` **and** the proxy `target` in `client/vite.config.js`. |
| "GitHub API rate limit reached" | Add `GITHUB_TOKEN` to `server/.env`, restart. |
| Header says "AI off" | Hover the badge, or read the `AI mode: OFF - ...` line in the server terminal: it tells you the exact reason. Usually the key after `ANTHROPIC_API_KEY=` is empty, the file is not named exactly `.env`, or the server was not restarted. |
| "AI unavailable (... 401 ...)" | The API key is wrong or expired. |
| "AI unavailable (... 404 ...)" | The model name is wrong for your provider. Set `AI_MODEL`. |
| `.env` changes not picked up | Stop and restart `npm run dev`. |

### One-port production mode (optional)
```bash
npm run build     # builds the React app
npm start         # Express serves API + UI on http://localhost:5001
```

---

## 🌱 Contributing

Ideas welcome: more languages detected, a "repo health" score, support for GitLab, caching with Redis, saving favourite repos.

## 📄 License

MIT. See [LICENSE](LICENSE).

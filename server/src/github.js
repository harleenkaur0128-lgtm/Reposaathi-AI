// Fetches everything RepoSaathi needs from the public GitHub REST API.
// Uses Node's built-in fetch (Node 18+), so no extra HTTP library is required.

const GH_API = "https://api.github.com";
const TIMEOUT_MS = 15000;
const MAX_README_CHARS = 9000;
const MAX_FILE_CHARS = 3500;
const MAX_PROMPT_TREE = 300;

export class AppError extends Error {
  constructor(message, status = 500, code = "ERROR") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// ---------- URL parsing ----------

function cleanParts(owner, repo) {
  const cleanRepo = repo.replace(/\.git$/i, "");
  const ok = /^[A-Za-z0-9_.-]+$/;
  if (!ok.test(owner) || !ok.test(cleanRepo) || !cleanRepo) {
    throw new AppError("That does not look like a valid GitHub repository URL.", 400, "INVALID_URL");
  }
  return { owner, repo: cleanRepo };
}

export function parseRepoUrl(input) {
  if (!input || typeof input !== "string") {
    throw new AppError("Please paste a public GitHub repository URL.", 400, "INVALID_URL");
  }
  let text = input.trim();
  if (text.length > 300) {
    throw new AppError("That URL is too long to be a GitHub repository.", 400, "INVALID_URL");
  }

  // Accept the shorthand "owner/repo"
  const shorthand = text.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (shorthand && !shorthand[1].includes(".")) {
    return cleanParts(shorthand[1], shorthand[2]);
  }

  // Accept "github.com/owner/repo" without https://
  if (!/^https?:\/\//i.test(text)) text = "https://" + text;

  let url;
  try {
    url = new URL(text);
  } catch {
    throw new AppError("That does not look like a valid URL.", 400, "INVALID_URL");
  }
  const host = url.hostname.toLowerCase();
  if (!host.includes(".")) {
    throw new AppError("Please paste a GitHub URL like https://github.com/owner/repo.", 400, "INVALID_URL");
  }
  if (host !== "github.com" && host !== "www.github.com") {
    throw new AppError("Only github.com repositories are supported.", 400, "INVALID_URL");
  }
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new AppError("Please include both the owner and repository name, e.g. github.com/owner/repo.", 400, "INVALID_URL");
  }
  return cleanParts(parts[0], parts[1]);
}

// ---------- low-level request helper ----------

async function ghRequest(path, { accept = "application/vnd.github+json", optional = false } = {}) {
  const headers = {
    Accept: accept,
    "User-Agent": "RepoSaathi-AI",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  let res;
  try {
    res = await fetch(`${GH_API}${path}`, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new AppError("Could not reach GitHub. Check your internet connection and try again.", 502, "NETWORK");
  }
  if (res.ok) return res;

  const rateLimited =
    res.status === 429 || (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0");
  if (rateLimited) {
    throw new AppError(
      "GitHub API rate limit reached. Add a GITHUB_TOKEN to server/.env (free) or try again in a few minutes.",
      429,
      "RATE_LIMIT"
    );
  }
  if (optional) return null;
  if (res.status === 404) {
    throw new AppError("Repository not found. Check the URL and make sure the repository is public.", 404, "NOT_FOUND");
  }
  if (res.status === 403) {
    throw new AppError("GitHub refused access. The repository may be private.", 403, "FORBIDDEN");
  }
  throw new AppError(`GitHub returned an unexpected error (${res.status}).`, 502, "GITHUB_ERROR");
}

const encodePath = (p) => p.split("/").map(encodeURIComponent).join("/");
const clip = (text, max) => (text.length > max ? text.slice(0, max) + "\n...[truncated]" : text);

// ---------- tree helpers ----------

const NOISE = /(^|\/)(node_modules|\.git|dist|build|vendor|__pycache__|\.next|coverage|\.idea|\.vscode|target|out)(\/|$)/i;
const BORING_EXT = /\.(png|jpe?g|gif|svg|ico|webp|mp4|mp3|woff2?|ttf|eot|lock|map|min\.js|pdf|zip|gz|jar)$/i;
const LOCK_FILES = /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/i;

function isInteresting(path) {
  return !NOISE.test(path) && !BORING_EXT.test(path) && !LOCK_FILES.test(path);
}

function buildPromptTree(paths) {
  return paths
    .filter((p) => p.split("/").length <= 3)
    .sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b))
    .slice(0, MAX_PROMPT_TREE);
}

const KEY_FILE_CANDIDATES = [
  "package.json",
  "requirements.txt",
  "pyproject.toml",
  "setup.py",
  "go.mod",
  "Cargo.toml",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "Gemfile",
  "composer.json",
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "Makefile",
  ".env.example",
  ".env.sample",
  ".nvmrc",
  "CONTRIBUTING.md",
  ".github/CONTRIBUTING.md",
  "docs/CONTRIBUTING.md",
  "CONTRIBUTING.rst",
];

// ---------- main entry ----------

export async function fetchRepoContext(owner, repo) {
  const warnings = [];

  const metaRes = await ghRequest(`/repos/${owner}/${repo}`);
  const meta = await metaRes.json();
  const branch = meta.default_branch || "main";
  const base = `/repos/${meta.full_name}`;

  if (meta.archived) warnings.push("This repository is archived, so it no longer accepts contributions.");
  if (meta.fork) warnings.push("This repository is a fork. The original project may be a better place to contribute.");

  // Fetch the independent pieces in parallel.
  const [languagesRes, treeRes, readmeRes, issues] = await Promise.all([
    ghRequest(`${base}/languages`, { optional: true }),
    ghRequest(`${base}/git/trees/${encodeURIComponent(branch)}?recursive=1`, { optional: true }),
    ghRequest(`${base}/readme?ref=${encodeURIComponent(branch)}`, {
      accept: "application/vnd.github.raw+json",
      optional: true,
    }),
    fetchIssues(base, warnings),
  ]);

  const languages = languagesRes ? await languagesRes.json() : {};

  let allPaths = [];
  let dirs = [];
  if (treeRes) {
    const tree = await treeRes.json();
    const items = Array.isArray(tree.tree) ? tree.tree : [];
    allPaths = items.filter((i) => i.type === "blob").map((i) => i.path).filter(isInteresting);
    dirs = items.filter((i) => i.type === "tree").map((i) => i.path).filter(isInteresting);
    if (tree.truncated) warnings.push("This repository is very large, so only part of its file list was analysed.");
  } else {
    warnings.push("Could not read the file list (the repository may be empty).");
  }

  // README
  let readme = { path: null, text: "" };
  if (readmeRes) {
    const raw = await readmeRes.text();
    const readmePath = allPaths.find((p) => /^readme(\.[a-z]+)?$/i.test(p)) || "README.md";
    readme = { path: readmePath, text: clip(raw, MAX_README_CHARS) };
  } else {
    warnings.push("No README found in this repository.");
  }

  // Key config / contribution files (only ones that really exist in the tree)
  const lowerMap = new Map(allPaths.map((p) => [p.toLowerCase(), p]));
  const wanted = [];
  for (const candidate of KEY_FILE_CANDIDATES) {
    const real = lowerMap.get(candidate.toLowerCase());
    if (real && !wanted.includes(real)) wanted.push(real);
  }
  const files = {};
  await Promise.all(
    wanted.slice(0, 10).map(async (path) => {
      const res = await ghRequest(`${base}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`, {
        accept: "application/vnd.github.raw+json",
        optional: true,
      }).catch(() => null);
      if (res) files[path] = clip(await res.text(), MAX_FILE_CHARS);
    })
  );

  return {
    meta: {
      owner: meta.owner?.login || owner,
      name: meta.name || repo,
      fullName: meta.full_name,
      url: meta.html_url,
      description: meta.description || "",
      stars: meta.stargazers_count ?? 0,
      forks: meta.forks_count ?? 0,
      openIssues: meta.open_issues_count ?? 0,
      license: meta.license?.spdx_id || meta.license?.name || null,
      language: meta.language || null,
      defaultBranch: branch,
      topics: meta.topics || [],
      homepage: meta.homepage || "",
      updatedAt: meta.pushed_at || meta.updated_at || null,
      avatar: meta.owner?.avatar_url || "",
      archived: Boolean(meta.archived),
    },
    languages,
    allPaths,
    dirs,
    promptTree: buildPromptTree(allPaths),
    totalFiles: allPaths.length,
    readme,
    files,
    issues,
    warnings,
  };
}

async function fetchIssues(base, warnings) {
  const labels = ["good first issue", "help wanted"];
  try {
    for (const label of labels) {
      const res = await ghRequest(
        `${base}/issues?state=open&labels=${encodeURIComponent(label)}&per_page=10&sort=updated`,
        { optional: true }
      );
      if (!res) continue;
      const data = await res.json();
      const real = (Array.isArray(data) ? data : [])
        .filter((i) => !i.pull_request)
        .slice(0, 6)
        .map((i) => ({
          number: i.number,
          title: i.title,
          url: i.html_url,
          labels: (i.labels || []).map((l) => (typeof l === "string" ? l : l.name)).filter(Boolean),
          comments: i.comments ?? 0,
          assigned: Boolean(i.assignee),
          createdAt: i.created_at,
          label,
        }));
      if (real.length) return real;
    }
  } catch (err) {
    if (err instanceof AppError && err.code === "RATE_LIMIT") {
      warnings.push("Could not load beginner-friendly issues because of the GitHub rate limit.");
    }
  }
  return [];
}

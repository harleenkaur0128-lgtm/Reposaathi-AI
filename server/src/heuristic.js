// Rule-based analysis. Used (1) when no AI key is configured and
// (2) as a safety net / gap-filler if the AI call fails or returns incomplete data.
// Everything here is derived only from data we actually retrieved from GitHub.

const FOLDER_HINTS = {
  src: "Main source code of the project. Most features live here.",
  lib: "Core library code used by the rest of the project.",
  app: "Application code, often the main app, pages or routes.",
  apps: "Several applications in one repository (a monorepo).",
  packages: "Separate packages in a monorepo; each usually has its own README.",
  docs: "Documentation. A friendly place to start if you enjoy writing.",
  doc: "Documentation files.",
  test: "Automated tests. Read these to learn how the code should behave.",
  tests: "Automated tests. Read these to learn how the code should behave.",
  __tests__: "Automated tests. Read these to learn how the code should behave.",
  spec: "Automated tests / specifications.",
  examples: "Small example projects showing how to use this software.",
  example: "A small example showing how to use this software.",
  samples: "Sample code showing how to use this software.",
  scripts: "Helper scripts for building, releasing or automating tasks.",
  public: "Static files served as-is (images, index.html, icons).",
  static: "Static files such as images, CSS and fonts.",
  assets: "Images, fonts and other media files.",
  ".github": "GitHub settings: issue templates, pull request templates and CI workflows.",
  cmd: "Entry points (main programs) of a Go project.",
  internal: "Private Go packages used only inside this project.",
  pkg: "Reusable Go packages.",
  bin: "Executable scripts or command-line entry points.",
  config: "Configuration files.",
  configs: "Configuration files.",
  client: "Frontend / user-interface code.",
  frontend: "Frontend / user-interface code.",
  web: "Web frontend code.",
  ui: "User-interface code.",
  server: "Backend / server code.",
  backend: "Backend / server code.",
  api: "API code (the part other programs talk to).",
  components: "Reusable user-interface building blocks.",
  utils: "Small helper functions used across the project.",
  helpers: "Small helper functions used across the project.",
  models: "Data models (how information is structured).",
  controllers: "Code that handles incoming requests.",
  routes: "URL routes and what each one does.",
  views: "Pages or templates shown to the user.",
  middleware: "Code that runs between a request and its response.",
  migrations: "Database changes over time.",
  locales: "Translations. Often a very beginner-friendly area to contribute.",
  i18n: "Translations. Often a very beginner-friendly area to contribute.",
  data: "Data files used by the project.",
  build: "Generated build output. Usually not edited by hand.",
  dist: "Generated output. Usually not edited by hand.",
  docker: "Docker-related files for running the project in containers.",
  deploy: "Deployment configuration.",
};

const NODE_DEPS = {
  react: "React",
  next: "Next.js",
  vue: "Vue",
  nuxt: "Nuxt",
  "@angular/core": "Angular",
  svelte: "Svelte",
  express: "Express",
  fastify: "Fastify",
  "@nestjs/core": "NestJS",
  typescript: "TypeScript",
  tailwindcss: "Tailwind CSS",
  vite: "Vite",
  webpack: "Webpack",
  jest: "Jest (tests)",
  vitest: "Vitest (tests)",
  mocha: "Mocha (tests)",
  electron: "Electron",
  "react-native": "React Native",
  mongoose: "MongoDB (Mongoose)",
  prisma: "Prisma",
  eslint: "ESLint",
};

const PY_DEPS = {
  django: "Django",
  flask: "Flask",
  fastapi: "FastAPI",
  numpy: "NumPy",
  pandas: "pandas",
  torch: "PyTorch",
  tensorflow: "TensorFlow",
  "scikit-learn": "scikit-learn",
  pytest: "pytest (tests)",
  requests: "Requests",
};

// ---------- small helpers ----------

const fileUrl = (meta, path) => `${meta.url}/blob/${meta.defaultBranch}/${path}`;
const dirUrl = (meta, path) => `${meta.url}/tree/${meta.defaultBranch}/${path}`;

function findFile(ctx, name) {
  const lower = name.toLowerCase();
  return ctx.allPaths.find((p) => p.toLowerCase() === lower) || null;
}

function parseJson(text) {
  try {
    return JSON.parse(String(text).replace(/\n\.\.\.\[truncated\]$/, ""));
  } catch {
    return null;
  }
}

function topLevelDirs(ctx) {
  const set = new Set();
  for (const p of ctx.allPaths) {
    if (p.includes("/")) set.add(p.split("/")[0]);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

function firstParagraph(readmeText) {
  if (!readmeText) return "";
  const lines = readmeText.split(/\r?\n/);
  const out = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (out.length) break;
      continue;
    }
    if (/^(#|!\[|\[!\[|<|---|===|\||```|\*\*\*)/.test(line)) {
      if (out.length) break;
      continue;
    }
    if (line.length < 25 && !out.length) continue;
    out.push(line.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, ""));
  }
  const text = out.join(" ").trim();
  return text.length > 420 ? text.slice(0, 417).trimEnd() + "..." : text;
}

function detectPackageManager(ctx) {
  if (findFile(ctx, "pnpm-lock.yaml")) return "pnpm";
  if (findFile(ctx, "yarn.lock")) return "yarn";
  if (findFile(ctx, "bun.lockb")) return "bun";
  return "npm";
}

function runScript(pm, script) {
  if (pm === "npm" && (script === "start" || script === "test")) return `npm ${script}`;
  if (pm === "yarn") return `yarn ${script}`;
  return `${pm} run ${script}`;
}

// ---------- tech stack ----------

function detectTechStack(ctx) {
  const stack = [];
  const seen = new Set();
  const add = (name, note) => {
    if (!seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      stack.push({ name, note });
    }
  };

  const total = Object.values(ctx.languages).reduce((a, b) => a + b, 0);
  Object.entries(ctx.languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .forEach(([lang, bytes]) => {
      const pct = total ? Math.round((bytes / total) * 100) : 0;
      if (pct >= 1) add(lang, `About ${pct}% of the code`);
    });

  const pkgPath = findFile(ctx, "package.json");
  const pkg = pkgPath ? parseJson(ctx.files[pkgPath]) : null;
  if (pkg) {
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    for (const [dep, label] of Object.entries(NODE_DEPS)) {
      if (deps[dep]) add(label, "Found in package.json");
    }
  }

  const reqPath = findFile(ctx, "requirements.txt") || findFile(ctx, "pyproject.toml");
  if (reqPath && ctx.files[reqPath]) {
    const text = ctx.files[reqPath].toLowerCase();
    for (const [dep, label] of Object.entries(PY_DEPS)) {
      if (text.includes(dep)) add(label, `Found in ${reqPath}`);
    }
  }

  if (findFile(ctx, "go.mod")) add("Go modules", "go.mod found");
  if (findFile(ctx, "Cargo.toml")) add("Rust (Cargo)", "Cargo.toml found");
  if (findFile(ctx, "pom.xml")) add("Maven (Java)", "pom.xml found");
  if (findFile(ctx, "Dockerfile")) add("Docker", "Dockerfile found");

  return stack.slice(0, 10);
}

// ---------- key folders / files ----------

function detectKeyFolders(ctx) {
  const dirs = topLevelDirs(ctx);
  const known = dirs.filter((d) => FOLDER_HINTS[d.toLowerCase()]);
  const unknown = dirs.filter((d) => !FOLDER_HINTS[d.toLowerCase()]);
  const chosen = [...known, ...unknown].slice(0, 8);
  return chosen.map((d) => ({
    path: d,
    explanation: FOLDER_HINTS[d.toLowerCase()] || "Project folder. Open it and read the file names to see what it contains.",
    url: dirUrl(ctx.meta, d),
  }));
}

function detectKeyFiles(ctx) {
  const items = [];
  const push = (path, why) => {
    if (path && !items.some((i) => i.path === path)) {
      items.push({ path, why, url: fileUrl(ctx.meta, path) });
    }
  };
  push(ctx.readme.path, "Start here. Explains what the project is and how to use it.");
  push(
    findFile(ctx, "CONTRIBUTING.md") || findFile(ctx, ".github/CONTRIBUTING.md") || findFile(ctx, "docs/CONTRIBUTING.md"),
    "The project's own rules for contributing. Read before you change anything."
  );
  push(findFile(ctx, "CODE_OF_CONDUCT.md"), "How contributors are expected to behave.");
  push(findFile(ctx, "package.json"), "Lists dependencies and the commands (scripts) to run the project.");
  push(findFile(ctx, "requirements.txt"), "Python packages the project needs.");
  push(findFile(ctx, "pyproject.toml"), "Python project settings and dependencies.");
  push(findFile(ctx, "go.mod"), "Go module name and dependencies.");
  push(findFile(ctx, "Cargo.toml"), "Rust package settings and dependencies.");
  push(findFile(ctx, "pom.xml"), "Maven build configuration for a Java project.");
  push(findFile(ctx, "Dockerfile"), "Describes how to run the project in a container.");
  push(findFile(ctx, ".env.example"), "Shows which environment variables you must set.");
  push(findFile(ctx, "LICENSE") || findFile(ctx, "LICENSE.md"), "The license: what others may do with this code.");
  return items.slice(0, 8);
}

// ---------- setup doctor ----------

function buildSetup(ctx) {
  const { meta } = ctx;
  const prerequisites = [];
  const steps = [];
  const commonErrors = [];

  steps.push({
    title: "Get the code",
    command: `git clone ${meta.url}.git\ncd ${meta.name}`,
    note: "Requires Git. To contribute, fork the repository first and clone your fork instead.",
    source: null,
  });

  const envExample = findFile(ctx, ".env.example") || findFile(ctx, ".env.sample");
  const pkgPath = findFile(ctx, "package.json");
  const pkg = pkgPath ? parseJson(ctx.files[pkgPath]) : null;

  if (pkgPath) {
    const pm = detectPackageManager(ctx);
    const nodeVersion = pkg?.engines?.node;
    prerequisites.push(`Node.js${nodeVersion ? ` (${nodeVersion} required by package.json)` : " (use the current LTS version)"}`);
    if (pm !== "npm") prerequisites.push(`${pm} package manager`);
    steps.push({
      title: "Install dependencies",
      command: `${pm} install`,
      note: "Downloads every package the project needs.",
      source: pkgPath,
    });
    const scripts = pkg?.scripts || {};
    const order = ["dev", "start", "build", "test"];
    const wanted = order.filter((s) => scripts[s]).slice(0, 3);
    for (const s of wanted) {
      steps.push({
        title: s === "test" ? "Run the tests" : s === "build" ? "Build the project" : "Start the project",
        command: runScript(pm, s),
        note: `Runs the "${s}" script from package.json: ${String(scripts[s]).slice(0, 80)}`,
        source: pkgPath,
      });
    }
    commonErrors.push(
      {
        problem: "Errors mentioning an unsupported Node.js version",
        fix: "Install the Node version the project asks for (check package.json \"engines\" or a .nvmrc file). A tool like nvm makes switching easy.",
      },
      {
        problem: "EACCES / permission denied during install",
        fix: "Do not use sudo. Fix your npm folder permissions or use a Node version manager.",
      },
      {
        problem: "\"Cannot find module\" when starting",
        fix: `Delete the node_modules folder and run ${pm} install again.`,
      }
    );
  }

  const pyReq = findFile(ctx, "requirements.txt");
  const pyProj = findFile(ctx, "pyproject.toml");
  if (pyReq || pyProj || findFile(ctx, "setup.py")) {
    prerequisites.push("Python 3 (3.9 or newer is a safe choice)");
    steps.push({
      title: "Create a virtual environment",
      command: "python -m venv .venv\nsource .venv/bin/activate   # Windows: .venv\\Scripts\\activate",
      note: "Keeps this project's packages separate from the rest of your computer.",
      source: null,
    });
    steps.push({
      title: "Install dependencies",
      command: pyReq ? "pip install -r requirements.txt" : "pip install -e .",
      note: "Downloads the Python packages the project needs.",
      source: pyReq || pyProj || "setup.py",
    });
    commonErrors.push(
      {
        problem: "ModuleNotFoundError",
        fix: "Make sure the virtual environment is activated, then run the install command again.",
      },
      {
        problem: "'python' is not recognized",
        fix: "Try python3 instead, or install Python from python.org and tick \"Add to PATH\".",
      }
    );
  }

  if (findFile(ctx, "go.mod")) {
    prerequisites.push("Go (version listed in go.mod)");
    steps.push({ title: "Download Go modules", command: "go mod download", note: "Fetches dependencies.", source: "go.mod" });
    steps.push({ title: "Build and run", command: "go build ./...\ngo test ./...", note: "Compiles the code and runs tests.", source: "go.mod" });
    commonErrors.push({ problem: "go: command not found", fix: "Install Go from go.dev/dl and restart your terminal." });
  }

  if (findFile(ctx, "Cargo.toml")) {
    prerequisites.push("Rust toolchain (install with rustup)");
    steps.push({ title: "Build and test", command: "cargo build\ncargo test", note: "Compiles the project and runs its tests.", source: "Cargo.toml" });
    commonErrors.push({ problem: "cargo: command not found", fix: "Install Rust from rustup.rs and restart your terminal." });
  }

  if (findFile(ctx, "pom.xml")) {
    prerequisites.push("Java JDK and Maven");
    steps.push({ title: "Build with Maven", command: "mvn clean install", note: "Compiles the code and runs tests.", source: "pom.xml" });
    commonErrors.push({ problem: "JAVA_HOME is not set", fix: "Install a JDK and point JAVA_HOME to its folder." });
  }

  const compose = findFile(ctx, "docker-compose.yml") || findFile(ctx, "docker-compose.yaml");
  if (compose) {
    prerequisites.push("Docker Desktop (optional, for the container setup)");
    steps.push({
      title: "Run with Docker (alternative)",
      command: "docker compose up --build",
      note: "Starts everything in containers.",
      source: compose,
    });
    commonErrors.push({ problem: "Cannot connect to the Docker daemon", fix: "Open Docker Desktop and wait until it says it is running." });
  }

  if (envExample) {
    steps.splice(Math.min(2, steps.length), 0, {
      title: "Create your environment file",
      command: `cp ${envExample} .env\n# Windows: copy ${envExample} .env`,
      note: "Then open .env and fill in the values (API keys, ports, etc.).",
      source: envExample,
    });
    commonErrors.push({ problem: "App crashes saying a variable is undefined", fix: "You probably skipped the .env file. Copy the example file and fill in every value." });
  }

  if (steps.length === 1) {
    steps.push({
      title: "Read the README for setup instructions",
      command: "",
      note: "No standard build file (package.json, requirements.txt, ...) was detected, so check the README for the exact steps.",
      source: ctx.readme.path,
    });
  }

  commonErrors.push({
    problem: "Something still fails",
    fix: "Copy the exact error message, search it in the repository's Issues tab, and read the README troubleshooting section.",
  });

  return { prerequisites: [...new Set(prerequisites)], steps, commonErrors: commonErrors.slice(0, 7) };
}

// ---------- roadmap ----------

function buildRoadmap(ctx) {
  const { meta } = ctx;
  const contributing =
    findFile(ctx, "CONTRIBUTING.md") || findFile(ctx, ".github/CONTRIBUTING.md") || findFile(ctx, "docs/CONTRIBUTING.md");
  const dirs = topLevelDirs(ctx);
  const interesting = dirs.filter((d) => FOLDER_HINTS[d.toLowerCase()]).slice(0, 3);
  const steps = [];

  steps.push({
    title: "Read the README",
    detail: "Understand what the project does and who uses it. Write down one sentence in your own words.",
    link: ctx.readme.path ? fileUrl(meta, ctx.readme.path) : meta.url,
  });

  if (contributing) {
    steps.push({
      title: "Read the contribution guide",
      detail: "This file explains the project's rules: coding style, how to name branches, and how to open a pull request.",
      link: fileUrl(meta, contributing),
    });
  } else {
    steps.push({
      title: "Look for contribution rules",
      detail: "No CONTRIBUTING file was found. Check the README and open pull requests to see how others contribute.",
      link: `${meta.url}/pulls?q=is%3Apr+is%3Amerged`,
    });
  }

  steps.push({
    title: "Run the project on your computer",
    detail: "Follow the Setup Doctor tab. Seeing it run makes the code much easier to understand.",
    link: null,
  });

  if (interesting.length) {
    steps.push({
      title: `Explore ${interesting.map((d) => d + "/").join(", ")}`,
      detail: "Open a few files, read the comments, and try to follow how one feature works from start to finish.",
      link: dirUrl(meta, interesting[0]),
    });
  }

  steps.push({
    title: "Pick a beginner-friendly issue",
    detail:
      "Look for issues labelled 'good first issue' or 'help wanted'. Check that nobody else is assigned, and comment to say you would like to work on it.",
    link: `${meta.url}/issues?q=is%3Aopen+is%3Aissue+label%3A%22good+first+issue%22`,
  });

  steps.push({
    title: "Make your change and open a pull request",
    detail:
      "Fork the repository, create a branch (git checkout -b my-first-change), commit your work, push it, and open a pull request. Explain what you changed and why.",
    link: "https://docs.github.com/en/get-started/exploring-projects-on-github/contributing-to-a-project",
  });

  return steps;
}

function buildQuestions(ctx) {
  const q = [
    "What problem does this project solve, and who would use it?",
    "Which file or folder is the entry point where the program starts?",
    "How do the maintainers want changes to be tested?",
  ];
  if (ctx.issues.length) q.push("Which of the listed issues could I understand after reading the related code?");
  return q;
}

// ---------- public API ----------

export function buildHeuristicGuide(ctx) {
  const { meta } = ctx;
  const intro = firstParagraph(ctx.readme.text);
  const parts = [];
  if (meta.description) {
    const d = meta.description.replace(/\s+/g, " ").trim();
    parts.push(/[.!?]$/.test(d) ? d : d + ".");
  }
  if (intro && !parts.join(" ").includes(intro.slice(0, 40))) parts.push(intro);
  const summary =
    parts.join(" ") ||
    `${meta.fullName} is a public GitHub repository${meta.language ? ` written mostly in ${meta.language}` : ""}. It has no description or README summary, so open the files listed below to learn more.`;

  return {
    summary,
    techStack: detectTechStack(ctx),
    keyFolders: detectKeyFolders(ctx),
    keyFiles: detectKeyFiles(ctx),
    roadmap: buildRoadmap(ctx),
    setup: buildSetup(ctx),
    questions: buildQuestions(ctx),
  };
}

// Used by the "Ask" box when no AI is available: return README passages that match the question.
export function keywordAnswer(ctx, question) {
  const stop = new Set(["the", "a", "an", "is", "are", "to", "of", "in", "and", "or", "how", "what", "do", "does", "i", "can", "this", "that", "for", "with", "it", "me", "my", "on"]);
  const words = question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !stop.has(w));
  const chunks = [];
  const addChunks = (label, text) => {
    for (const para of String(text || "").split(/\n{2,}/)) {
      const clean = para.trim();
      if (clean.length > 20) chunks.push({ label, text: clean });
    }
  };
  addChunks(ctx.readme.path || "README", ctx.readme.text);
  for (const [path, text] of Object.entries(ctx.files)) {
    if (/\.(md|rst|txt)$/i.test(path)) addChunks(path, text);
  }

  const scored = chunks
    .map((c) => ({ ...c, score: words.reduce((n, w) => n + (c.text.toLowerCase().includes(w) ? 1 : 0), 0) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2);

  if (!scored.length) {
    return {
      answer:
        "I could not find anything about that in the README or contribution files I read. Try opening the repository's docs folder or searching its Issues tab.",
      sources: [],
    };
  }
  return {
    answer:
      "AI mode is off, so here are the most relevant passages I found in the repository files:\n\n" +
      scored.map((c) => `From ${c.label}:\n${c.text.slice(0, 600)}`).join("\n\n"),
    sources: [...new Set(scored.map((c) => c.label))],
  };
}

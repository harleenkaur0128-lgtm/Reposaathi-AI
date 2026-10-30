// Loads the .env file reliably, no matter which folder you start the server from.
// Looks in server/.env first, then the project root .env. Also tolerates the common
// Windows mistake of saving the file as ".env.txt".
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(here, "..");
const rootDir = path.resolve(serverDir, "..");

const candidates = [
  path.join(serverDir, ".env"),
  path.join(serverDir, ".env.txt"),
  path.join(rootDir, ".env"),
  path.join(rootDir, ".env.txt"),
];

export const envInfo = { loadedFrom: null, tried: candidates, misnamed: [] };

for (const file of candidates) {
  if (!fs.existsSync(file)) continue;
  // override: true so an empty variable already present in your OS environment cannot block the file
  const parsed = dotenv.parse(fs.readFileSync(file));
  for (const [k, v] of Object.entries(parsed)) {
    if (v !== "" || process.env[k] === undefined) process.env[k] = v;
  }
  if (!envInfo.loadedFrom) envInfo.loadedFrom = file;
  if (file.endsWith(".txt")) envInfo.misnamed.push(file);
}

// Detect wrongly named files like "create.env", "env", ".env.example.txt"
for (const dir of [serverDir, rootDir]) {
  for (const name of fs.readdirSync(dir)) {
    if (/env/i.test(name) && ![".env", ".env.example", ".env.txt", "node_modules"].includes(name) && !fs.statSync(path.join(dir, name)).isDirectory()) {
      envInfo.misnamed.push(path.join(dir, name));
    }
  }
}

// Save/update variables in server/.env (creates the file if needed) and apply them immediately.
export function saveEnv(updates) {
  const file = path.join(serverDir, ".env");
  let lines = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/) : [];
  for (const [key, value] of Object.entries(updates)) {
    const clean = String(value ?? "").replace(/[\r\n]/g, "");
    process.env[key] = clean;
    const i = lines.findIndex((l) => new RegExp(`^\\s*${key}\\s*=`).test(l));
    if (i >= 0) lines[i] = `${key}=${clean}`;
    else lines.push(`${key}=${clean}`);
  }
  fs.writeFileSync(file, lines.join("\n").replace(/\n*$/, "\n"));
  envInfo.loadedFrom = file;
  return file;
}

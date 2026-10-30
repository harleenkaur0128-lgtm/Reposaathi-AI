async function post(path, body) {
  let res;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Cannot reach the RepoSaathi server. Make sure it is running (npm run dev).");
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* response was not JSON */
  }
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status}). Is the server running?`);
  }
  return data;
}

export const analyzeRepo = (url) => post("/api/analyze", { url });
export const askQuestion = (url, question) => post("/api/ask", { url, question });

export async function getHealth() {
  try {
    const res = await fetch("/api/health");
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export const saveAiConfig = (cfg) => post("/api/ai/config", cfg);
export const testAiConnection = () => post("/api/ai/test", {});
export const clearAiConfig = () => post("/api/ai/clear", {});

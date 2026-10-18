import fs from "node:fs/promises";
import path from "node:path";

const rootDir = process.cwd();

function parseEnvFile(contents) {
  const values = {};
  for (const line of String(contents || "").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

async function loadConfig() {
  const fileValues = parseEnvFile(await fs.readFile(path.join(rootDir, ".env.jellyfin.local"), "utf8").catch(() => ""));
  const env = { ...fileValues, ...process.env };
  const baseUrl = String(env.JELLYFIN_URL || "http://127.0.0.1:8096").replace(/\/+$/, "");
  const apiKey = String(env.JELLYFIN_API_KEY || "").trim();
  if (!apiKey) throw new Error("JELLYFIN_API_KEY is not configured in the local environment.");
  const timeoutMs = Math.min(120_000, Math.max(5_000, Number(env.SYNC_JELLYFIN_TIMEOUT_MS) || 60_000));
  return { baseUrl, apiKey, timeoutMs };
}

async function refreshLibrary({ baseUrl, apiKey, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/Library/Refresh`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "X-Emby-Token": apiKey,
        Authorization: `MediaBrowser Client="Movie Room", Device="Movie Room Server", DeviceId="movie-room-server", Version="1.0.0", Token="${apiKey}"`,
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Jellyfin library refresh returned HTTP ${response.status}.`);
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`Jellyfin library refresh timed out after ${timeoutMs} ms.`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

try {
  const config = await loadConfig();
  await refreshLibrary(config);
  console.log(JSON.stringify({ ok: true, action: "library-refresh" }));
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
}

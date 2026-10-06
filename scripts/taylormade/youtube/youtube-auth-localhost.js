const fs = require("fs/promises");
const http = require("http");
const path = require("path");
const { execFile } = require("child_process");
const { google } = require("googleapis");

const ROOT = __dirname;
const CLIENT_SECRET_PATH = path.join(ROOT, "private", "client_secret.json");
const TOKEN_PATH = path.join(ROOT, "tokens", "youtube-token.json");
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

async function readClientConfig() {
  const raw = await fs.readFile(CLIENT_SECRET_PATH, "utf8");
  const json = JSON.parse(raw);
  const config = json.installed || json.web;
  if (!config) throw new Error("client_secret.json missing installed/web OAuth client.");
  return config;
}

function openBrowser(url) {
  return new Promise((resolve) => {
    const child = execFile(
      "powershell.exe",
      ["-NoProfile", "-Command", "Start-Process -LiteralPath $args[0]", url],
      { windowsHide: true },
      () => resolve()
    );
    child.on("error", () => resolve());
  });
}

async function main() {
  const config = await readClientConfig();
  await fs.mkdir(path.dirname(TOKEN_PATH), { recursive: true });

  const server = http.createServer();
  const port = await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
    server.on("error", reject);
  });
  const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
  const oauth2Client = new google.auth.OAuth2(config.client_id, config.client_secret, redirectUri);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
    include_granted_scopes: true,
  });

  const codePromise = new Promise((resolve, reject) => {
    server.on("request", async (req, res) => {
      try {
        const url = new URL(req.url, redirectUri);
        if (url.pathname !== "/oauth2callback") {
          res.writeHead(404);
          res.end("Not found");
          return;
        }
        const error = url.searchParams.get("error");
        if (error) throw new Error(error);
        const code = url.searchParams.get("code");
        if (!code) throw new Error("OAuth callback did not include a code.");
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h1>YouTube automation connected</h1><p>You can close this tab and return to Codex.</p>");
        resolve(code);
      } catch (error) {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end(error.message);
        reject(error);
      }
    });
  });

  console.log(JSON.stringify({
    ok: true,
    waiting_for_browser_consent: true,
    auth_url: authUrl,
    redirect_uri: redirectUri,
  }, null, 2));
  await openBrowser(authUrl);
  const code = await codePromise;
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2), "utf8");

  const youtube = google.youtube({ version: "v3", auth: oauth2Client });
  const response = await youtube.channels.list({
    part: ["snippet", "id"],
    mine: true,
    maxResults: 5,
  });
  const channels = (response.data.items || []).map((item) => ({
    id: item.id,
    title: item.snippet && item.snippet.title,
  }));
  console.log(JSON.stringify({
    ok: true,
    token_saved: TOKEN_PATH,
    channels,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error.message,
  }, null, 2));
  process.exitCode = 1;
}).finally(() => {
  try {
    // `server` is scoped in main, so process exit handles close after completion.
  } catch {}
});

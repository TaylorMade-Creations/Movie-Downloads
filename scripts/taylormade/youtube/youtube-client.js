const fs = require("fs/promises");
const path = require("path");
const { google } = require("googleapis");

const ROOT = __dirname;
const CLIENT_SECRET_PATH = path.join(ROOT, "private", "client_secret.json");
const TOKEN_PATH = path.join(ROOT, "tokens", "youtube-token.json");

async function loadOAuthClient() {
  const clientSecretRaw = await fs.readFile(CLIENT_SECRET_PATH, "utf8");
  const tokenRaw = await fs.readFile(TOKEN_PATH, "utf8");
  const clientSecret = JSON.parse(clientSecretRaw);
  const token = JSON.parse(tokenRaw);
  const config = clientSecret.installed || clientSecret.web;
  if (!config) {
    throw new Error("client_secret.json does not contain installed or web OAuth credentials.");
  }
  const client = new google.auth.OAuth2(
    config.client_id,
    config.client_secret,
    Array.isArray(config.redirect_uris) ? config.redirect_uris[0] : undefined
  );
  client.setCredentials(token);
  return client;
}

module.exports = { loadOAuthClient, TOKEN_PATH };

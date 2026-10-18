const { google } = require("googleapis");
const { loadOAuthClient, TOKEN_PATH } = require("./youtube-client");

async function main() {
  const auth = await loadOAuthClient();
  const youtube = google.youtube({ version: "v3", auth });
  const response = await youtube.channels.list({
    part: ["snippet", "id", "status"],
    mine: true,
    maxResults: 10,
  });
  const channels = (response.data.items || []).map((item) => ({
    id: item.id,
    title: item.snippet && item.snippet.title,
    privacyStatus: item.status && item.status.privacyStatus,
  }));
  console.log(JSON.stringify({
    ok: true,
    token_path: TOKEN_PATH,
    channel_count: channels.length,
    channels,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error.message,
    hint: "Run node youtube-auth.js first, then complete the Google OAuth consent in the browser.",
  }, null, 2));
  process.exitCode = 1;
});

const fsp = require("fs/promises");
const { google } = require("googleapis");
const { loadOAuthClient } = require("./youtube-client");

function readArg(name, fallback = undefined) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  if (!match) return fallback;
  return match.slice(prefix.length);
}

async function main() {
  const videoId = readArg("video-id");
  const metadataPath = readArg("metadata");
  const dryRun = readArg("dry-run", "false").toLowerCase() === "true";

  if (!videoId) throw new Error("Missing --video-id=<youtube video id>");
  if (!metadataPath) throw new Error("Missing --metadata=<metadata json path>");

  const metadata = JSON.parse(await fsp.readFile(metadataPath, "utf8"));
  const privacyStatus =
    metadata?.youtube?.privacyStatus ||
    (metadata.visibility_recommendation && metadata.visibility_recommendation.includes("public") ? "public" : "private");

  const requestBody = {
    id: videoId,
    snippet: {
      title: metadata.title,
      description: metadata.description,
      tags: Array.isArray(metadata.tags) ? metadata.tags : [],
      categoryId: "27",
    },
    status: {
      privacyStatus,
      selfDeclaredMadeForKids: metadata.made_for_kids_recommendation !== false,
    },
  };

  if (!requestBody.snippet.title) throw new Error("Metadata is missing title");
  if (!requestBody.snippet.description) throw new Error("Metadata is missing description");

  if (dryRun) {
    console.log(JSON.stringify({ ok: true, dry_run: true, video_id: videoId, requestBody }, null, 2));
    return;
  }

  const auth = await loadOAuthClient();
  const youtube = google.youtube({ version: "v3", auth });
  const response = await youtube.videos.update({
    part: ["snippet", "status"],
    requestBody,
  });

  console.log(JSON.stringify({
    ok: true,
    updated: true,
    video_id: response.data.id,
    title: response.data.snippet?.title,
    privacyStatus: response.data.status?.privacyStatus,
    madeForKids: response.data.status?.madeForKids ?? response.data.status?.selfDeclaredMadeForKids ?? null,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exitCode = 1;
});

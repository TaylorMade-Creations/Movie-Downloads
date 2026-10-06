const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { google } = require("googleapis");
const mime = require("mime-types");
const { loadOAuthClient } = require("./youtube-client");

function readArg(name, fallback = undefined) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  if (!match) return fallback;
  return match.slice(prefix.length);
}

function parseTags(value) {
  if (!value) return [];
  return value.split(",").map((tag) => tag.trim()).filter(Boolean);
}

async function readMetadata(metadataPath) {
  if (!metadataPath) return {};
  const raw = (await fsp.readFile(metadataPath, "utf8")).replace(/^\uFEFF/, "");
  return JSON.parse(raw);
}

async function main() {
  const videoPath = readArg("video");
  const metadataPath = readArg("metadata");
  const dryRun = readArg("dry-run", "false").toLowerCase() === "true";
  const privacyStatus = readArg("privacy", "private");
  const notifySubscribers = readArg("notify-subscribers", "false").toLowerCase() === "true";
  const titleOverride = readArg("title");
  const descriptionOverride = readArg("description");
  const tagsOverride = readArg("tags");

  if (!videoPath) throw new Error("Missing --video=<absolute mp4 path>");
  if (!fs.existsSync(videoPath)) throw new Error(`Video file not found: ${videoPath}`);
  const metadata = await readMetadata(metadataPath);
  const title = titleOverride || metadata.title || path.basename(videoPath, path.extname(videoPath));
  const description = descriptionOverride || metadata.description || "Kiddo Learn / TaylorMade educational video.";
  const tags = tagsOverride ? parseTags(tagsOverride) : (Array.isArray(metadata.tags) ? metadata.tags : []);
  const madeForKids = metadata.made_for_kids_recommendation !== false;
  const body = {
    snippet: {
      title,
      description,
      tags,
      categoryId: "27",
    },
    status: {
      privacyStatus,
      selfDeclaredMadeForKids: madeForKids,
    },
  };

  if (dryRun) {
    console.log(JSON.stringify({
      ok: true,
      dry_run: true,
      video: videoPath,
      metadata: metadataPath || null,
      request: body,
    }, null, 2));
    return;
  }

  const auth = await loadOAuthClient();
  const youtube = google.youtube({ version: "v3", auth });
  const mimeType = mime.lookup(videoPath) || "video/mp4";
  const response = await youtube.videos.insert({
    part: ["snippet", "status"],
    notifySubscribers,
    requestBody: body,
    media: {
      mimeType,
      body: fs.createReadStream(videoPath),
    },
  });
  const id = response.data.id;
  const watchUrl = id ? `https://www.youtube.com/watch?v=${id}` : null;
  console.log(JSON.stringify({
    ok: true,
    uploaded: true,
    video_id: id,
    watch_url: watchUrl,
    title,
    privacyStatus,
    madeForKids,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error.message,
  }, null, 2));
  process.exitCode = 1;
});

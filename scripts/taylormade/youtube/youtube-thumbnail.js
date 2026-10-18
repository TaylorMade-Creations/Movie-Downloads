const fs = require("fs");
const { google } = require("googleapis");
const mime = require("mime-types");
const { loadOAuthClient } = require("./youtube-client");

function readArg(name, fallback = undefined) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  if (!match) return fallback;
  return match.slice(prefix.length);
}

async function main() {
  const videoId = readArg("video-id");
  const imagePath = readArg("image");
  const dryRun = readArg("dry-run", "false").toLowerCase() === "true";

  if (!videoId) throw new Error("Missing --video-id=<youtube video id>");
  if (!imagePath) throw new Error("Missing --image=<absolute thumbnail path>");
  if (!fs.existsSync(imagePath)) throw new Error(`Thumbnail file not found: ${imagePath}`);

  const mimeType = mime.lookup(imagePath) || "image/png";

  if (dryRun) {
    console.log(JSON.stringify({
      ok: true,
      dry_run: true,
      video_id: videoId,
      image: imagePath,
      mimeType
    }, null, 2));
    return;
  }

  const auth = await loadOAuthClient();
  const youtube = google.youtube({ version: "v3", auth });
  const response = await youtube.thumbnails.set({
    videoId,
    media: {
      mimeType,
      body: fs.createReadStream(imagePath),
    },
  });

  console.log(JSON.stringify({
    ok: true,
    uploaded_thumbnail: true,
    video_id: videoId,
    image: imagePath,
    response: response.data,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error.message,
  }, null, 2));
  process.exitCode = 1;
});

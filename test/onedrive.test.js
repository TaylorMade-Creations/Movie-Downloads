const test = require("node:test");
const assert = require("node:assert/strict");

const { createOneDriveProvider } = require("../lib/providers/onedrive");

test("OneDrive provider hides zero-byte upload placeholders from the catalog", async () => {
  const tokenUrl = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
  const childrenUrl = "https://graph.microsoft.com/v1.0/drives/drive/items/root/children"
    + "?$select=id,name,size,file,folder,eTag,lastModifiedDateTime";
  const provider = createOneDriveProvider({
    env: {
      ONEDRIVE_CLIENT_ID: "test-client",
      ONEDRIVE_CLIENT_SECRET: "test-secret",
      ONEDRIVE_REDIRECT_URI: "https://example.test/callback",
      ONEDRIVE_REFRESH_TOKEN: "test-refresh-token",
      ONEDRIVE_DRIVE_ID: "drive",
      ONEDRIVE_ROOT_ITEM_ID: "root",
    },
    fetchImpl: async (url) => {
      if (url === tokenUrl) {
        return new Response(JSON.stringify({ access_token: "test-access-token", expires_in: 3600 }), { status: 200 });
      }
      if (url === childrenUrl) {
        return new Response(JSON.stringify({
          value: [
            {
              id: "still-uploading",
              name: "Fifty Shades Freed 2018.firetv.mp4",
              size: 0,
              file: { mimeType: "video/mp4" },
            },
            {
              id: "ready-original",
              name: "Fifty Shades Freed 2018.mkv",
              size: 16835891702,
              file: { mimeType: "video/x-matroska" },
            },
          ],
        }), { status: 200 });
      }
      throw new Error(`Unexpected OneDrive request: ${url}`);
    },
  });

  const library = await provider.refreshLibrary();

  assert.deepEqual(library.movies.map((movie) => movie.fileName), ["Fifty Shades Freed 2018.mkv"]);
  assert.equal(library.movies[0].size, 16835891702);
});

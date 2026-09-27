import fs from "node:fs/promises";
import path from "node:path";

const graphRoot = "https://graph.microsoft.com/v1.0";
const tokenUrl = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const repoRoot = process.cwd();

function parseEnvFile(contents) {
  const values = {};
  for (const line of String(contents || "").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

async function config() {
  const fileValues = parseEnvFile(await fs.readFile(path.join(repoRoot, ".env.jellyfin.local"), "utf8").catch(() => ""));
  const env = { ...fileValues, ...process.env };
  const required = ["ONEDRIVE_CLIENT_ID", "ONEDRIVE_REDIRECT_URI", "ONEDRIVE_REFRESH_TOKEN", "ONEDRIVE_DRIVE_ID", "ONEDRIVE_ROOT_ITEM_ID"];
  const missing = required.filter((key) => !String(env[key] || "").trim());
  if (missing.length) throw new Error(`Missing OneDrive settings: ${missing.join(", ")}`);
  if (!env.ONEDRIVE_PUBLIC_CLIENT && !env.ONEDRIVE_CLIENT_SECRET) {
    throw new Error("ONEDRIVE_CLIENT_SECRET or ONEDRIVE_PUBLIC_CLIENT=true is required.");
  }
  return {
    env,
    root: path.resolve(env.MOVIE_LIBRARY_ROOT || "C:/Users/kylet/OneDrive/Desktop/Movie downloads"),
    driveId: String(env.ONEDRIVE_DRIVE_ID),
    rootItemId: String(env.ONEDRIVE_ROOT_ITEM_ID),
  };
}

async function getAccessToken(env) {
  const body = new URLSearchParams({
    client_id: String(env.ONEDRIVE_CLIENT_ID),
    grant_type: "refresh_token",
    redirect_uri: String(env.ONEDRIVE_REDIRECT_URI),
    refresh_token: String(env.ONEDRIVE_REFRESH_TOKEN),
    scope: "offline_access Files.ReadWrite",
  });
  if (env.ONEDRIVE_CLIENT_SECRET) body.set("client_secret", String(env.ONEDRIVE_CLIENT_SECRET));
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    throw new Error(`OneDrive write authorization failed (HTTP ${response.status}). The app registration needs Files.ReadWrite consent.`);
  }
  const payload = await response.json();
  if (!payload.access_token) throw new Error("OneDrive did not return a write token.");
  return payload.access_token;
}

function graphPath(...parts) {
  return parts.map((part) => encodeURIComponent(String(part))).join("/");
}

async function graphJson(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(options.headers || {}) },
  });
  if (!response.ok) throw new Error(`OneDrive request failed (HTTP ${response.status}).`);
  return response.json();
}

async function listFolders(config, token) {
  const folders = new Map([["", config.rootItemId]]);
  async function walk(parentId, relative) {
    let nextUrl = `${graphRoot}/drives/${encodeURIComponent(config.driveId)}/items/${encodeURIComponent(parentId)}/children?$select=id,name,folder&$top=200`;
    while (nextUrl) {
      const payload = await graphJson(nextUrl, token);
      for (const entry of payload.value || []) {
        if (!entry.folder) continue;
        const childPath = relative ? `${relative}/${entry.name}` : entry.name;
        folders.set(childPath.toLowerCase(), entry.id);
        await walk(entry.id, childPath);
      }
      nextUrl = payload["@odata.nextLink"] || "";
    }
  }
  await walk(config.rootItemId, "");
  return folders;
}

function shouldExport(name, relativeFolder) {
  const top = relativeFolder.split(/[\\/]/)[0].toLowerCase();
  if (top !== "movies" && top !== "tv shows") return false;
  return /\.jellyfin\.json$/i.test(name)
    || /^(?:poster|folder|thumb|backdrop|fanart|background)\.(?:jpe?g|png|webp)$/i.test(name)
    || /-(?:poster|thumb)\.(?:jpe?g|png|webp)$/i.test(name);
}

async function localFiles(root) {
  const files = [];
  async function walk(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const relative = path.relative(root, fullPath);
        const folder = path.dirname(relative) === "." ? "" : path.dirname(relative).replaceAll("\\", "/");
        if (shouldExport(entry.name, folder)) files.push({ fullPath, name: entry.name, folder });
      }
    }
  }
  await walk(root);
  return files;
}

async function ensureFolder(config, token, folders, relativeFolder) {
  if (!relativeFolder) return config.rootItemId;
  const parts = relativeFolder.split("/").filter(Boolean);
  let currentPath = "";
  let parentId = config.rootItemId;
  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    const key = currentPath.toLowerCase();
    if (folders.has(key)) {
      parentId = folders.get(key);
      continue;
    }
    const response = await fetch(
      `${graphRoot}/drives/${encodeURIComponent(config.driveId)}/items/${encodeURIComponent(parentId)}/children`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name: part, folder: {}, "@microsoft.graph.conflictBehavior": "fail" }),
      },
    );
    if (response.status === 409) {
      const listing = await graphJson(`${graphRoot}/drives/${encodeURIComponent(config.driveId)}/items/${encodeURIComponent(parentId)}/children?$select=id,name,folder`, token);
      const existing = (listing.value || []).find((entry) => entry.folder && String(entry.name).toLowerCase() === part.toLowerCase());
      if (!existing) throw new Error(`Unable to create OneDrive folder ${currentPath}.`);
      parentId = existing.id;
    } else if (!response.ok) {
      throw new Error(`Unable to create OneDrive folder ${currentPath} (HTTP ${response.status}).`);
    } else {
      const created = await response.json();
      parentId = created.id;
    }
    folders.set(key, parentId);
  }
  return parentId;
}

async function uploadFile(config, token, parentId, file) {
  const bytes = await fs.readFile(file.fullPath);
  const url = `${graphRoot}/drives/${encodeURIComponent(config.driveId)}/items/${encodeURIComponent(parentId)}:/${graphPath(file.name)}:/content?@microsoft.graph.conflictBehavior=replace`;
  const response = await fetch(url, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" },
    body: bytes,
  });
  if (!response.ok) throw new Error(`${file.folder}/${file.name} (HTTP ${response.status})`);
}

async function main() {
  const settings = await config();
  const token = await getAccessToken(settings.env);
  const [folders, files] = await Promise.all([listFolders(settings, token), localFiles(settings.root)]);
  let uploaded = 0;
  let skipped = 0;
  const failures = [];
  for (const file of files) {
    try {
      const parentId = await ensureFolder(settings, token, folders, file.folder);
      await uploadFile(settings, token, parentId, file);
      uploaded += 1;
    } catch (error) {
      failures.push(error.message);
      skipped += 1;
    }
  }
  console.log(JSON.stringify({ ok: failures.length === 0, root: settings.root, filesFound: files.length, uploaded, skipped, failures: failures.slice(0, 10) }));
  if (failures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }));
  process.exitCode = 1;
});

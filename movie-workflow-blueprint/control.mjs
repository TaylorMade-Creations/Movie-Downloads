import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(directory, "manifest.json");
const requiredApplications = Object.freeze(["web", "android", "firetv", "shell", "aospPrototype"]);
const lockedProductionUrl = "https://movie-downloads-six.vercel.app";

export const manifest = Object.freeze(JSON.parse(await fs.readFile(manifestPath, "utf8")));
export const sourceOfTruth = Object.freeze({ ...manifest.sourceOfTruth });
export const productionUrl = manifest.deployment.productionUrl.replace(/\/+$/, "");
export const libraryConfigPath = manifest.libraryConfigPath || manifest.paths?.libraryConfigPath || "config/library.local.json";
export const applications = Object.freeze([...(manifest.applications || [])].map((item) => Object.freeze({ ...item })));
export const artifactManifests = Object.freeze([...(manifest.artifactManifests || [])].map((item) => Object.freeze({ ...item })));
export const buildCommands = Object.freeze({ ...(manifest.buildCommands || {}) });
export const authoritativeMovieDownloadsRoot = libraryConfigPath;

export function validateManifest(candidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("Manifest is required.");
  if (candidate.version !== 2) throw new Error("Movie Room Master manifest version must be 2.");
  const candidateProductionUrl = String(candidate.deployment?.productionUrl || "").replace(/\/+$/, "");
  if (candidateProductionUrl !== lockedProductionUrl) {
    throw new Error("Production URL must remain https://movie-downloads-six.vercel.app.");
  }
  const candidateApplications = Array.isArray(candidate.applications) ? candidate.applications : [];
  const ids = new Set(candidateApplications.map((app) => app && app.id).filter(Boolean));
  for (const id of requiredApplications) {
    if (!ids.has(id)) throw new Error(`Missing required application: ${id}`);
  }
  const packages = Object.fromEntries(candidateApplications.map((app) => [app.id, app.packageName]));
  if (packages.web !== "pwa") throw new Error("Web application packageName must be pwa.");
  if (packages.android !== "com.movieroom.web") throw new Error("Android APK packageName changed unexpectedly.");
  if (packages.firetv !== "com.movieroom.firetv") throw new Error("Fire TV APK packageName changed unexpectedly.");
  if (packages.shell !== "com.movieroom.shell") throw new Error("Shell APK packageName changed unexpectedly.");
  return true;
}

export function verificationChecklist() {
  return [...(manifest.verificationGates || [])];
}

export function workflowCommands() {
  return { ...buildCommands };
}

validateManifest(manifest);

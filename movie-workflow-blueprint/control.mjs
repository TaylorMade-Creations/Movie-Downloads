import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const manifestPath = path.join(directory, "manifest.json");

export const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
export const sourceOfTruth = Object.freeze({ ...manifest.sourceOfTruth });
export const productionUrl = manifest.deployment.productionUrl;
export const authoritativeMovieDownloadsRoot = manifest.paths.authoritativeLocalMovieDownloadsRoot;

export function verificationChecklist() {
  return [...manifest.verificationGates];
}

export function workflowCommands() {
  return { ...manifest.commands };
}

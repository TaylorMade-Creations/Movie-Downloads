import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SECRET_FILE_PATTERNS = [
  /^\.env(?:\.|$)/i,
  /^config\/library\.local\.json$/i,
  /(?:^|\/)(?:[^/]*key[^/]*|[^/]*secret[^/]*|[^/]*token[^/]*)\.(?:json|txt|env|pem|key)$/i
];

const SECRET_VALUE_PATTERN =
  /(sk-(?:proj|live|test)-[A-Za-z0-9_-]{8,}|RUNWAYML_API_SECRET\s*=|client_secret\s*=|refresh_token\s*=|api[_-]?key\s*=|bearer\s+[A-Za-z0-9._-]{12,})/i;

const GENERATED_PATH_PATTERNS = [
  /^\.git(?:\/|$)/,
  /^\.gradle(?:\/|$)/,
  /^\.vercel(?:\/|$)/,
  /^\.superpowers(?:\/|$)/,
  /^node_modules(?:\/|$)/,
  /^test-results(?:\/|$)/,
  /^tmp-runtime(?:\/|$)/,
  /^inventories\/local(?:\/|$)/,
  /^release\/master-build-report\.json$/i,
  /(?:^|\/)build(?:\/|$)/,
  /^[^/]+\.apk$/i
];

function normalizeRelativePath(relativePath) {
  return String(relativePath || "").replace(/\\/g, "/").replace(/^\.?\//, "");
}

export function classifyPath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized) return { include: false, reason: "empty-path" };
  if (normalized === "movies/.gitkeep") return { include: true, reason: "tracked-placeholder" };
  if (normalized.startsWith("movies/")) return { include: false, reason: "repository-media-placeholder" };
  if (SECRET_FILE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { include: false, reason: "secret-or-local-config" };
  }
  if (GENERATED_PATH_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { include: false, reason: "generated-or-local-output" };
  }
  return { include: true, reason: "source-or-release-artifact" };
}

async function walkFiles(root) {
  const files = [];
  async function walk(directory) {
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }
      if (entry.isFile()) files.push(absolutePath);
    }
  }
  await walk(root);
  return files;
}

function hashBuffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function collectRepositoryInventory({ repoRoot = process.cwd() } = {}) {
  const root = path.resolve(repoRoot);
  const files = [];
  const excluded = [];
  for (const absolutePath of await walkFiles(root)) {
    const relativePath = normalizeRelativePath(path.relative(root, absolutePath));
    const classification = classifyPath(relativePath);
    if (!classification.include) {
      excluded.push({ relativePath, reason: classification.reason });
      continue;
    }
    const content = await fs.readFile(absolutePath);
    if (SECRET_VALUE_PATTERN.test(content.toString("utf8"))) {
      excluded.push({ relativePath, reason: "redacted-secret-pattern" });
      continue;
    }
    const stat = await fs.stat(absolutePath);
    files.push({
      relativePath,
      byteSize: stat.size,
      mtimeMs: stat.mtimeMs,
      sha256: hashBuffer(content)
    });
  }
  return {
    root,
    generatedAt: new Date().toISOString(),
    files,
    excluded
  };
}

export async function collectLibraryMetadata({ libraryRoot } = {}) {
  if (!libraryRoot) {
    return { root: null, files: [], unavailable: "library-root-not-configured" };
  }
  const root = path.resolve(libraryRoot);
  const files = [];
  for (const absolutePath of await walkFiles(root)) {
    const stat = await fs.stat(absolutePath);
    files.push({
      relativePath: normalizeRelativePath(path.relative(root, absolutePath)),
      byteSize: stat.size,
      mtimeMs: stat.mtimeMs
    });
  }
  return {
    root,
    generatedAt: new Date().toISOString(),
    files
  };
}

export async function writeInventory({ outputPath, inventory }) {
  if (!outputPath) throw new Error("outputPath is required");
  const absoluteOutput = path.resolve(outputPath);
  await fs.mkdir(path.dirname(absoluteOutput), { recursive: true });
  const tempPath = `${absoluteOutput}.${process.pid}.tmp`;
  const payload = JSON.stringify(inventory, null, 2) + "\n";
  await fs.writeFile(tempPath, payload, { encoding: "utf8", flag: "wx" });
  await fs.rename(tempPath, absoluteOutput);
  return absoluteOutput;
}

function readArgValue(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return null;
  return args[index + 1] || null;
}

export async function main(argv = process.argv.slice(2)) {
  const outputPath = readArgValue(argv, "--output");
  const repoRoot = readArgValue(argv, "--repo-root") || process.cwd();
  const libraryRoot = readArgValue(argv, "--library-root") || process.env.MOVIE_LIBRARY_ROOT || null;
  if (!outputPath) {
    throw new Error("Usage: node scripts/master/create-preservation-inventory.mjs --output inventories/local/pre-conversion.json [--repo-root .] [--library-root PATH]");
  }
  const inventory = {
    generatedAt: new Date().toISOString(),
    repository: await collectRepositoryInventory({ repoRoot }),
    library: await collectLibraryMetadata({ libraryRoot })
  };
  return writeInventory({ outputPath, inventory });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
    .then((outputPath) => {
      console.log(`wrote ${outputPath}`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

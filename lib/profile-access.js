const crypto = require("node:crypto");

const ACCESS_STATES = Object.freeze([
  "needs_setup",
  "logged_out",
  "home_unlocked",
  "profile_locked",
  "profile_unlocked",
]);

const DEFAULT_ACCENT_COLORS = Object.freeze({
  home: "#f0c45b",
  mom: "#28c48f",
  morganne: "#ff74ad",
  kids: "#f59e0b",
});

const DEFAULT_AVATARS = Object.freeze({
  home: "home-family",
  mom: "mom",
  morganne: "morganne",
  kids: "kids",
});

const PIN_PATTERN = /^\d{4,8}$/;
const PUBLIC_PREVIEW_LIMIT_SECONDS = 180;
const DEFAULT_ENTITLEMENT = "free";

function cleanString(value, fallback = "") {
  const cleaned = String(value ?? "").trim();
  return cleaned || fallback;
}

function normalizeId(value, fallback = "profile") {
  const cleaned = cleanString(value, fallback)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

function normalizeColor(value, fallback) {
  const color = cleanString(value, fallback);
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
}

function normalizeStringList(value) {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => cleanString(item)).filter(Boolean))]
    : [];
}

function normalizeAccessState(value) {
  const state = typeof value === "string" ? value : value?.state;
  return ACCESS_STATES.includes(state) ? state : "needs_setup";
}

function normalizeProfile(raw = {}) {
  const id = normalizeId(raw.id || raw.displayName, "profile");
  const displayName = cleanString(raw.displayName, id === "profile" ? "Profile" : id);
  const settings = raw.settings && typeof raw.settings === "object" ? raw.settings : {};
  const pin = cleanString(raw.pin);

  return {
    id,
    displayName,
    avatarId: cleanString(raw.avatarId, DEFAULT_AVATARS[id] || "default-profile"),
    accentColor: normalizeColor(raw.accentColor, DEFAULT_ACCENT_COLORS[id] || "#f0c45b"),
    pinRequired: Boolean(raw.pinRequired || PIN_PATTERN.test(pin)),
    settings: {
      appOrder: normalizeStringList(settings.appOrder),
      hiddenApps: normalizeStringList(settings.hiddenApps),
      shelfOrder: normalizeStringList(settings.shelfOrder),
      reducedMotion: Boolean(settings.reducedMotion),
    },
    watchState: settings.watchState && typeof settings.watchState === "object"
      ? { ...settings.watchState }
      : {},
  };
}

function createDefaultProfiles() {
  return [
    normalizeProfile({ id: "home", displayName: "Home" }),
    normalizeProfile({ id: "mom", displayName: "Mom" }),
    normalizeProfile({ id: "morganne", displayName: "Morganne" }),
    normalizeProfile({ id: "kids", displayName: "Kids" }),
  ];
}

function assertPin(pin) {
  const normalized = cleanString(pin);
  if (!PIN_PATTERN.test(normalized)) {
    throw new TypeError("PIN must be 4 to 8 digits");
  }
  return normalized;
}

function hashPin(pin, salt) {
  const normalizedPin = assertPin(pin);
  const normalizedSalt = cleanString(salt);
  if (!normalizedSalt) {
    throw new TypeError("PIN salt is required");
  }
  return crypto.scryptSync(normalizedPin, normalizedSalt, 64).toString("hex");
}

function verifyPin(pin, salt, digest) {
  if (!PIN_PATTERN.test(cleanString(pin)) || !cleanString(salt) || !/^[a-f0-9]{128}$/i.test(cleanString(digest))) {
    return false;
  }

  const expected = Buffer.from(cleanString(digest), "hex");
  const actual = Buffer.from(hashPin(pin, salt), "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function withEntitlement(item) {
  return {
    ...item,
    entitlement: ["free", "paid", "profile_only", "unavailable"].includes(item?.entitlement)
      ? item.entitlement
      : DEFAULT_ENTITLEMENT,
  };
}

function scopeCatalog(items, access = "needs_setup") {
  const catalog = Array.isArray(items) ? items.map(withEntitlement) : [];
  const state = normalizeAccessState(access);

  if (state === "profile_locked") {
    return [];
  }

  if (state === "home_unlocked" || state === "profile_unlocked") {
    return catalog;
  }

  return catalog.map((item) => ({
    ...item,
    previewOnly: true,
    previewLimitSeconds: PUBLIC_PREVIEW_LIMIT_SECONDS,
  }));
}

module.exports = {
  ACCESS_STATES,
  createDefaultProfiles,
  hashPin,
  normalizeAccessState,
  normalizeProfile,
  PUBLIC_PREVIEW_LIMIT_SECONDS,
  scopeCatalog,
  verifyPin,
};

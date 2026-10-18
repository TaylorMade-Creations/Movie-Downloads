(function viewerStateModule(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.MovieRoomViewerState = api;
  }
}(typeof window !== "undefined" ? window : globalThis, function createModule() {
  const profiles = new Set(["home", "mom", "morganne", "kids"]);
  const legacyProfileAliases = new Map([["family", "mom"], ["guest", "kids"]]);

  function normalizeProfileId(value) {
    const profileId = String(value || "").trim().toLowerCase();
    const canonical = legacyProfileAliases.get(profileId) || profileId;
    if (!profiles.has(canonical)) {
      throw new Error("A valid viewer profile is required.");
    }
    return canonical;
  }

  function createViewerStateClient({ fetchImpl = fetch, onUnauthorized = () => {} } = {}) {
    async function request(url, options, fallbackMessage) {
      const response = await fetchImpl(url, {
        credentials: "same-origin",
        ...options,
      });
      if (response.status === 401) {
        onUnauthorized();
        throw new Error("Your Movie Room session expired.");
      }
      if (!response.ok) {
        let payload = null;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }
        throw new Error((payload && payload.error) || fallbackMessage);
      }
      return response.json();
    }

    return {
      load(profileId = "home") {
        const normalized = normalizeProfileId(profileId);
        return request(
          `/api/viewer-state?profileId=${encodeURIComponent(normalized)}`,
          {},
          "Unable to load viewer state.",
        );
      },
      apply(profileId = "home", operations = []) {
        const normalized = normalizeProfileId(profileId);
        return request(
          "/api/viewer-state",
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ profileId: normalized, operations }),
          },
          "Unable to save viewer state.",
        );
      },
    };
  }

  return { createViewerStateClient, normalizeProfileId };
}));

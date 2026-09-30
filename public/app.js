const KIDS_MOVIE_PATTERN = /\b(?:home\s+alone|toy\s+story|paw\s+patrol|magic\s+faraway\s+tree|inside\s+out|minions?|despicable\s+me|shrek|finding\s+nemo|frozen)\b/i;
const FAMILY_MOVIE_PATTERN = /\b(?:family|spider\s*man|superman|jurassic\s+world|jurassic\s+park|harry\s+potter|star\s+wars|marvel|pixar|disney)\b/i;
const MOM_MOVIE_PATTERN = /\b(?:mom|moms|northern\s+exposure|romance|romantic|drama|love|fifty\s+shades|bomb\s+girls|hallmark)\b/i;
const TECHNICAL_FOLDER_PATTERN = /^(?:subs?|images?|drawable(?:[-_ ]?nodpi)?|res|src|main|java|providers?|firetv|api|cast|playback|stream|tv|pairings?|docs?|test|gradle|node_modules?|skills?|agents?|patterns?|search|commands|migrations|performance|advanced features)$/i;
const LIBRARY_ROOT_FOLDER_PATTERN = /^(?:movies?|movie downloads?|my movie downloads?|tv shows?|shows?|series|library)$/i;
const SEASON_FOLDER_PATTERN = /^season\s+\d+/i;
const COLLECTION_FOLDER_PATTERN = /(?:^|[\s_-])collection(?:$|[\s_-])/i;
const ALPHA_CATEGORIES = [
  ["alpha-a-c", "A-C", /^[A-C]/i],
  ["alpha-d-h", "D-H", /^[D-H]/i],
  ["alpha-i-n", "I-N", /^[I-N]/i],
  ["alpha-o-z", "O-Z", /^[O-Z]/i],
];
const VIEWER_STATE_API = typeof require === "function"
  ? require("./viewer-state")
  : (typeof window !== "undefined" ? window.MovieRoomViewerState : null);

function movieSearchableText(movie) {
  const source = movie || {};
  const genres = Array.isArray(source.genres) ? source.genres.join(" ") : "";
  const tags = Array.isArray(source.tags) ? source.tags.join(" ") : "";
  return `${source.title || ""} ${source.fileName || ""} ${source.folder || ""} ${genres} ${tags}`;
}

function searchMovies(movies, { term = "", genre = "all" } = {}) {
  const normalizedTerm = String(term || "").trim().toLowerCase();
  const normalizedGenre = String(genre || "all").trim().toLowerCase() || "all";
  return (Array.isArray(movies) ? movies : [])
    .filter((movie) => !isSampleMovie(movie))
    .filter((movie) => {
      const searchable = movieSearchableText(movie).toLowerCase();
      const matchesTerm = !normalizedTerm || searchable.includes(normalizedTerm);
      const matchesGenre = normalizedGenre === "all"
        ? true
        : normalizedGenre.startsWith("alpha-")
          ? movieAlphaCategory(movie) === normalizedGenre
          : movieInAudience(movie, normalizedGenre)
            || genresForMovie(movie).some((value) => value.toLowerCase() === normalizedGenre);
      return matchesTerm && matchesGenre;
    })
    .sort((left, right) => String(left.title || left.fileName || "").localeCompare(String(right.title || right.fileName || "")));
}

function browseGenreOptions(movies) {
  const source = Array.isArray(movies) ? movies.filter((movie) => !isSampleMovie(movie)) : [];
  const options = [
    { id: "all", label: "All Movies", count: source.length },
    ...["kids", "family", "mom", "adults"].map((id) => ({
      id,
      label: id.charAt(0).toUpperCase() + id.slice(1),
      count: source.filter((movie) => movieInAudience(movie, id)).length,
    })),
  ];
  const genres = new Map();
  for (const movie of source) {
    for (const genre of genresForMovie(movie)) {
      const id = String(genre).trim().toLowerCase();
      if (!id || genres.has(id) || options.some((option) => option.id === id)) continue;
      genres.set(id, { id, label: genre, count: 0 });
    }
  }
  for (const option of genres.values()) {
    option.count = source.filter((movie) => genresForMovie(movie).some((genre) => genre.toLowerCase() === option.id)).length;
  }
  return [...options, ...genres.values()].filter((option) => option.count > 0);
}

function metadataSourceLabel(movie) {
  const source = String((movie && (movie.metadataSource || movie.source)) || "").toLowerCase();
  return source === "jellyfin" || source === "hybrid" ? "Jellyfin metadata" : "Metadata pending";
}

function movieAddedTimestamp(movie) {
  const value = movie && (movie.dateAdded || movie.premiered || movie.createdDateTime) || "";
  const parsed = Date.parse(value);
  if (Number.isFinite(parsed)) return parsed;
  const year = Number(movie && movie.year);
  return Number.isFinite(year) && year > 0 ? Date.UTC(year, 0, 1) : 0;
}

function classifyMovie(movie) {
  const searchable = movieSearchableText(movie);
  if (KIDS_MOVIE_PATTERN.test(searchable)) {
    return "kids";
  }
  if (MOM_MOVIE_PATTERN.test(searchable)) {
    return "mom";
  }
  if (FAMILY_MOVIE_PATTERN.test(searchable)) {
    return "family";
  }
  return "adults";
}

const GENRE_PATTERNS = {
  horror: /\b(?:horror|scary|haunt|haunted|backrooms|obsession|the end of oak street)\b/i,
  action: /\b(?:action|jurassic|superman|spider\s*man|mutiny|the fix|jackass|masters of the universe)\b/i,
  comedy: /\b(?:comedy|home\s+alone|jackass|paw\s+patrol|toy\s+story|magic faraway tree)\b/i,
  drama: /\b(?:drama|fifty\s+shades|mamma\s+mia|northern\s+exposure|bomb\s+girls|love hypothesis)\b/i,
  family: FAMILY_MOVIE_PATTERN,
  kids: KIDS_MOVIE_PATTERN,
};

function genresForMovie(movie) {
  const metadataGenres = Array.isArray(movie && movie.genres)
    ? movie.genres.map((genre) => String(genre || "").trim()).filter(Boolean)
    : [];
  const searchable = movieSearchableText(movie);
  const inferred = Object.entries(GENRE_PATTERNS)
    .filter(([, pattern]) => pattern.test(searchable))
    .map(([genre]) => genre.charAt(0).toUpperCase() + genre.slice(1));
  const combined = [...metadataGenres, ...inferred];
  return combined.length
    ? combined.filter((genre, index, genres) => genres.findIndex((value) => value.toLowerCase() === genre.toLowerCase()) === index)
    : ["Uncategorized"];
}

function movieInAudience(movie, category) {
  if (category === "all") {
    return true;
  }

  const searchable = movieSearchableText(movie);
  if (category === "kids") {
    return KIDS_MOVIE_PATTERN.test(searchable);
  }
  if (category === "mom") {
    return MOM_MOVIE_PATTERN.test(searchable);
  }
  if (category === "family") {
    return FAMILY_MOVIE_PATTERN.test(searchable) || KIDS_MOVIE_PATTERN.test(searchable);
  }
  if (category === "adults") {
    return !KIDS_MOVIE_PATTERN.test(searchable)
      && !FAMILY_MOVIE_PATTERN.test(searchable)
      && !MOM_MOVIE_PATTERN.test(searchable);
  }

  if (GENRE_PATTERNS[category]) {
    return genresForMovie(movie).some((genre) => genre.toLowerCase() === category);
  }

  return true;
}

function movieAlphaCategory(movie) {
  const title = String((movie && (movie.title || movie.fileName)) || "").trim();
  const first = title.replace(/^(?:the|a|an)\s+/i, "").charAt(0).toUpperCase();
  const match = ALPHA_CATEGORIES.find(([, , pattern]) => pattern.test(first));
  return match ? match[0] : "alpha-o-z";
}

function isMoviePlayable(movie) {
  if (movie && movie.playbackAvailable === false) {
    return false;
  }
  return (Number(movie && movie.size) || 0) > 0;
}

function isSampleMovie(movie) {
  const folder = String((movie && movie.folder) || "");
  const fileName = String((movie && movie.fileName) || "");
  return folder.split(/[\\/]/).some((part) => /^samples?$/i.test(part.trim()))
    || /(?:^|[._ -])samples?(?:[._ -]|$)/i.test(fileName.replace(/\.[^.]+$/, ""));
}

function isCollectionFolder(folderPath) {
  const parts = String(folderPath || "").split(/[\\/]/).filter(Boolean);
  return COLLECTION_FOLDER_PATTERN.test(parts[parts.length - 1] || "");
}

function filterMovieFolders(folders) {
  const candidates = (Array.isArray(folders) ? folders : [])
    .filter((folder) => folder && folder.path && !folder.hidden && Number(folder.movieCount) > 0)
    .map((folder) => ({
      ...folder,
      path: String(folder.path).replace(/\\/g, "/"),
    }))
    .filter((folder) => {
      const parts = String(folder.path).split(/[\\/]/).filter(Boolean);
      return !parts.some((part) => TECHNICAL_FOLDER_PATTERN.test(part.trim()));
    });

  const seriesRoots = new Set();
  const collectionRoots = new Set();
  for (const folder of candidates) {
    const parts = String(folder.path).split("/").filter(Boolean);
    const lastPart = parts[parts.length - 1] || "";
    if (COLLECTION_FOLDER_PATTERN.test(lastPart)) {
      collectionRoots.add(folder.path);
    }
    if (!SEASON_FOLDER_PATTERN.test(lastPart)) {
      continue;
    }

    for (let index = parts.length - 2; index >= 0; index -= 1) {
      const parentName = parts[index];
      if (!LIBRARY_ROOT_FOLDER_PATTERN.test(parentName.trim())) {
        seriesRoots.add(parts.slice(0, index + 1).join("/"));
        break;
      }
    }
  }

  return candidates
    .filter((folder) => {
      if (seriesRoots.has(folder.path)) {
        return true;
      }
      if ([...seriesRoots].some((seriesPath) => folder.path.startsWith(`${seriesPath}/`))) {
        return false;
      }
      if ([...collectionRoots].some((collectionPath) => folder.path.startsWith(`${collectionPath}/`))) {
        return false;
      }
      if (collectionRoots.has(folder.path)) {
        return true;
      }
      return !candidates.some((other) => (
        other.path !== folder.path && other.path.startsWith(`${folder.path}/`)
      ));
    })
    .sort((left, right) => left.path.localeCompare(right.path));
}

function createApp({
  movieSelect,
  reloadButton,
  logoutButton,
  searchInput,
  searchOverlay,
  searchOverlayClose,
  searchOverlayResults,
  searchOverlayGenres,
  searchOverlaySummary,
  passwordForm,
  passwordInput,
  submitButton,
  player,
  timeline,
  timelineCurrent,
  timelineDuration,
  playerFrame,
  status,
  bufferStatus,
  nowPlayingTitle,
  nowPlayingDetail,
  loginStatus,
  librarySummary,
  catalogStatus,
  folderShelf,
  categoryShelf,
  movieGrid,
  watchPlaceholder,
  watchStage,
  permissionPanel,
  enablePermissionsButton,
  skipPermissionsButton,
  permissionStatus,
  seekBackwardButton,
  seekForwardButton,
  castButton,
  tvGuideTitle,
  tvGuideSteps,
  tvGuideStatus,
  keepAwakeButton,
  fullscreenButton,
  authPanel,
  libraryPanel,
  pairFireTvButton,
  fireTvPairingForm,
  fireTvCodeInput,
  fireTvPairingStatus,
  profileToggle,
  profileMenu,
  profileLabel,
  profileAvatar,
  profileButtons = [],
  heroMovie,
  heroBackdrop,
  heroPreviewVideo,
  libraryBackgroundPreview,
  heroTitle,
  heroMeta,
  heroDescription,
  heroPlay,
  heroDetails,
  heroPrev,
  heroNext,
  heroIndicator,
  continueWatchingShelf,
  continueSummary,
  recentlyAddedShelf,
  picksShelf,
  movieDetailsDialog,
  detailsClose,
  detailsPoster,
  detailsTitle,
  detailsMeta,
  detailsDescription,
  detailsPlay,
  detailsWatchLater,
  detailsQueue,
  detailsFavorite,
  detailsStatus,
  theaterModeButton,
  miniplayerModeButton,
  upNextPanel,
  upNextTitle,
  upNextPlay,
  closePlayerPage,
  remoteControlBar,
  remoteFocusLabel,
  remoteUpButton,
  remoteLeftButton,
  remoteSelectButton,
  remoteRightButton,
  remoteDownButton,
  remoteBackButton,
  remoteHomeButton,
  remotePlayButton,
  remoteSettingsButton,
  settingsDialog,
  settingsNetworkButton,
  settingsDisplayButton,
  settingsBluetoothButton,
  settingsSystemButton,
  settingsReloadButton,
  settingsCloseButton,
  playerSettingsButton,
  playerNetworkSettingsButton,
  fetchImpl,
  locationOrigin,
  createOption,
  documentRef = typeof document !== "undefined" ? document : null,
  navigatorRef = typeof navigator !== "undefined" ? navigator : null,
  windowRef = typeof window !== "undefined" ? window : null,
  localStorageRef = typeof localStorage !== "undefined" ? localStorage : null,
  mediaMetadataCtor = typeof MediaMetadata !== "undefined" ? MediaMetadata : null,
  setTimeoutImpl = (callback, delay) => setTimeout(callback, delay),
  clearTimeoutImpl = (timer) => clearTimeout(timer),
  stallRecoveryMs = 12000,
  maxPlaybackRefreshes = 3,
  targetBufferSeconds = 300,
}) {
  let playbackRefreshInProgress = false;
  let playbackRefreshAttempts = 0;
  let resumeAfterRefresh = null;
  let stallRecoveryTimer = null;
  let stallPosition = null;
  let playbackRequestVersion = 0;
  let stableRefreshPosition = null;
  let isSeeking = false;
  let activePreviewCancel = null;
  let allMovies = [];
  let allFolders = [];
  let viewerState = { movies: {}, queue: [], settings: {} };
  let detailsMovie = null;
  let playerMode = "normal";
  let progressTimer = null;
  let restoredMovieId = "";
  let progressWriteInFlight = null;
  let activeFolder = "all";
  let activeCategory = "all";
  let activeLibraryView = "movies";
  let activePage = "home";
  let heroMovies = [];
  let heroIndex = 0;
  let heroPreviewVersion = 0;
  let heroSelectionInitialized = false;
  let searchTerm = "";
  let searchOverlayGenre = "all";
  let searchOverlayPreviousFocus = null;
  let playerVisible = false;
  let remoteTarget = null;
  let wakeLock = null;
  let keepAwakeWanted = true;
  let safariAirPlayAvailable = false;
  let googleCastContext = null;
  let googleCastReady = false;
  let authenticated = false;
  let publicAccess = false;
  let authTransitionVersion = 0;
  let activeProfile = "home";
  let pendingFireTvCode = "";
  const permissionStorageKey = "movie_room_permissions_v1";
  const libraryStorageKey = "movie_room_library_cache_v1";
  const profileStorageKey = "movie_room_viewer_profile_v1";
  const profileLastMoviePrefix = "movie_room_last_movie_v1_";
  const profileSearchPrefix = "movie_room_search_history_v1_";
  const viewerProfiles = {
    home: { label: "Home", initial: "H", palette: "home", pick: () => true },
    mom: { label: "Mom", initial: "M", palette: "mom", pick: (movie) => classifyMovie(movie) === "mom" || genresForMovie(movie).some((genre) => /drama|romance|family/i.test(genre)) },
    morganne: { label: "Morganne", initial: "M", palette: "morganne", pick: (movie) => classifyMovie(movie) === "adults" || genresForMovie(movie).some((genre) => /action|comedy|horror/i.test(genre)) },
    kids: { label: "Kids", initial: "K", palette: "kids", pick: (movie) => classifyMovie(movie) === "kids" || classifyMovie(movie) === "family" },
  };
  const viewerStateClient = VIEWER_STATE_API && typeof VIEWER_STATE_API.createViewerStateClient === "function"
    ? VIEWER_STATE_API.createViewerStateClient({
      fetchImpl,
      onUnauthorized: () => setAuthenticated(false),
    })
    : null;

  function hasMethod(value, methodName) {
    return Boolean(value && typeof value[methodName] === "function");
  }

  function readLocalValue(key) {
    try {
      return localStorageRef && hasMethod(localStorageRef, "getItem")
        ? localStorageRef.getItem(key)
        : null;
    } catch {
      return null;
    }
  }

  function writeLocalValue(key, value) {
    try {
      if (localStorageRef && hasMethod(localStorageRef, "setItem")) {
        localStorageRef.setItem(key, value);
      }
    } catch {
      // Private browsing can disable local storage. Profiles still work for this page view.
    }
  }

  function readCachedLibrary() {
    try {
      const raw = readLocalValue(libraryStorageKey);
      if (!raw) return null;
      const payload = JSON.parse(raw);
      return payload && Array.isArray(payload.movies) ? normalizeLibraryPayload(payload) : null;
    } catch {
      return null;
    }
  }

  function updateProfileUi() {
    const profile = viewerProfiles[activeProfile] || viewerProfiles.home;
    if (documentRef && documentRef.body && documentRef.body.dataset) {
      documentRef.body.dataset.viewerProfile = profile.palette;
    }
    if (profileLabel) {
      profileLabel.textContent = profile.label;
    }
    if (profileAvatar) {
      profileAvatar.textContent = profile.initial;
    }
    for (const button of profileButtons) {
      const selected = button.dataset && button.dataset.viewerProfile === activeProfile;
      if (button.classList && typeof button.classList.toggle === "function") {
        button.classList.toggle("active", selected);
      }
      if (typeof button.setAttribute === "function") {
        button.setAttribute("aria-checked", selected ? "true" : "false");
      }
    }
  }

  function storedMovieForProfile() {
    return readLocalValue(`${profileLastMoviePrefix}${activeProfile}`) || "";
  }

  function rememberMovieForProfile(movieId) {
    if (movieId) {
      writeLocalValue(`${profileLastMoviePrefix}${activeProfile}`, movieId);
    }
  }

  function setViewerProfile(profileId) {
    activeProfile = Object.prototype.hasOwnProperty.call(viewerProfiles, profileId)
      ? profileId
      : "home";
    writeLocalValue(profileStorageKey, activeProfile);
    if (profileMenu) {
      profileMenu.hidden = true;
    }
    if (profileToggle && typeof profileToggle.setAttribute === "function") {
      profileToggle.setAttribute("aria-expanded", "false");
    }
    updateProfileUi();
  }

  function initializeViewerProfile() {
    setViewerProfile(readLocalValue(profileStorageKey) || "home");
  }

  function updateStatus(message) {
    status.textContent = message;
    if (catalogStatus) {
      catalogStatus.textContent = message;
      catalogStatus.hidden = playerVisible || !message;
    }
  }

  function clearStallRecovery() {
    if (stallRecoveryTimer !== null) {
      clearTimeoutImpl(stallRecoveryTimer);
      stallRecoveryTimer = null;
    }
    stallPosition = null;
  }

  function bufferedSecondsAhead() {
    if (!player.buffered || typeof player.buffered.length !== "number") {
      return 0;
    }

    const currentTime = Number.isFinite(player.currentTime) ? player.currentTime : 0;
    try {
      for (let index = 0; index < player.buffered.length; index += 1) {
        const start = player.buffered.start(index);
        const end = player.buffered.end(index);
        if (currentTime >= start - 0.25 && currentTime <= end + 0.25) {
          return Math.max(0, end - currentTime);
        }
      }
    } catch {
      return 0;
    }

    return 0;
  }

  function statusWithBuffer(message) {
    const seconds = Math.floor(bufferedSecondsAhead());
    updateBufferStatus();
    if (seconds >= targetBufferSeconds) {
      return `${message} 5 minutes ready ahead.`;
    }
    return seconds >= 2 ? `${message} ${formatBufferSeconds(seconds)} ready ahead.` : message;
  }

  function formatBufferSeconds(seconds) {
    if (seconds >= 60) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return remainingSeconds
        ? `${minutes} min ${remainingSeconds} sec`
        : `${minutes} min`;
    }

    return `${seconds} seconds`;
  }

  function updateBufferStatus() {
    if (!bufferStatus) {
      return;
    }

    const seconds = Math.floor(bufferedSecondsAhead());
    const progress = Math.min(seconds / targetBufferSeconds, 1);
    bufferStatus.textContent = seconds >= targetBufferSeconds
      ? "Buffer target met: 5 minutes ready ahead."
      : `Buffer target: ${formatBufferSeconds(seconds)} ready of 5 minutes.`;
    if (bufferStatus.style) {
      bufferStatus.style.setProperty("--buffer-progress", `${Math.round(progress * 100)}%`);
    }
  }

  function formatTimelineTime(seconds) {
    const safeSeconds = Number.isFinite(Number(seconds)) ? Math.max(0, Math.floor(Number(seconds))) : 0;
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const remaining = safeSeconds % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
    }
    return `${minutes}:${String(remaining).padStart(2, "0")}`;
  }

  function updateTimeline() {
    const duration = Number.isFinite(player && player.duration) ? Math.max(0, Number(player.duration)) : 0;
    const current = Number.isFinite(player && player.currentTime)
      ? Math.max(0, Math.min(Number(player.currentTime), duration || Number(player.currentTime)))
      : 0;
    if (timeline) {
      timeline.min = "0";
      timeline.max = String(duration);
      timeline.value = String(current);
      timeline.disabled = duration <= 0;
      if (typeof timeline.setAttribute === "function") {
        timeline.setAttribute("aria-valuetext", `${formatTimelineTime(current)} of ${formatTimelineTime(duration)}`);
      }
    }
    if (timelineCurrent) timelineCurrent.textContent = formatTimelineTime(current);
    if (timelineDuration) timelineDuration.textContent = formatTimelineTime(duration);
  }

  function seekPlayerBy(offsetSeconds) {
    if (!player || !Number.isFinite(player.duration)) {
      updateStatus("Fast forward is available when the movie finishes loading.");
      return;
    }

    const currentTime = Number.isFinite(player.currentTime) ? player.currentTime : 0;
    const targetTime = Math.max(
      0,
      Math.min(currentTime + offsetSeconds, Math.max(player.duration - 0.1, 0)),
    );

    try {
      clearStallRecovery();
      isSeeking = true;
      player.currentTime = targetTime;
      updateStatus(offsetSeconds < 0 ? "Rewinding 10 seconds..." : "Fast forwarding 30 seconds...");
      updateBufferStatus();
    } catch {
      isSeeking = false;
      updateStatus("This browser could not seek in the current video.");
    }
  }

  function selectedMovie() {
    const movieId = movieSelect.value;
    return allMovies.find((movie) => movie.id === movieId) || null;
  }

  function setPlayerVisibility(visible, { scroll = false } = {}) {
    playerVisible = Boolean(visible);
    if (watchStage) {
      watchStage.hidden = !playerVisible;
    }
    if (watchPlaceholder) {
      watchPlaceholder.hidden = playerVisible;
    }
    if (playerFrame) {
      playerFrame.hidden = !playerVisible;
    }
    const watchMeta = playerFrame && playerFrame.parentNode && typeof playerFrame.parentNode.querySelector === "function"
      ? playerFrame.parentNode.querySelector(".watch-meta")
      : null;
    if (watchMeta) {
      watchMeta.hidden = !playerVisible;
    }
    if (watchStage && watchStage.classList) watchStage.classList.toggle("player-page", playerVisible);
    if (visible) {
      const playerTarget = player && hasMethod(player, "focus") ? player : closePlayerPage;
      if (playerTarget && hasMethod(playerTarget, "focus")) {
        playerTarget.focus();
        rememberRemoteTarget(playerTarget);
      }
    }
    if (visible && scroll && watchStage && hasMethod(watchStage, "scrollIntoView")) {
      setTimeoutImpl(() => watchStage.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    }
  }

  function setActivePage(page) {
    activePage = ["home", "library", "user"].includes(page) ? page : "home";
    const homeVisible = activePage === "home";
    const libraryVisible = activePage === "library";
    const userVisible = activePage === "user";
    if (heroMovie) heroMovie.hidden = !homeVisible;
    if (continueWatchingShelf && continueWatchingShelf.closest) {
      const shelves = continueWatchingShelf.closest(".discovery-shelves");
      if (shelves) shelves.hidden = !homeVisible;
    }
    if (movieGrid && movieGrid.closest) {
      const browse = movieGrid.closest(".browse-section");
      if (browse) browse.hidden = !libraryVisible;
    }
    if (categoryShelf && categoryShelf.parentElement) categoryShelf.parentElement.hidden = !libraryVisible;
    if (folderShelf && folderShelf.parentElement) folderShelf.parentElement.hidden = !libraryVisible;
    if (profileMenu) {
      profileMenu.hidden = !userVisible;
      if (profileToggle && typeof profileToggle.setAttribute === "function") profileToggle.setAttribute("aria-expanded", userVisible ? "true" : "false");
    }
    if (documentRef && typeof documentRef.querySelectorAll === "function") {
      for (const button of documentRef.querySelectorAll("[data-page]")) {
        button.classList.toggle("active", button.dataset.page === activePage);
      }
    }
  }

  function updateMediaSession(movie) {
    if (!navigatorRef || !navigatorRef.mediaSession || !mediaMetadataCtor || !movie) {
      return;
    }

    try {
      navigatorRef.mediaSession.metadata = new mediaMetadataCtor({
        title: movie.title || movie.fileName || "Movie Room",
        artist: movieFolderLabel(movie),
        album: "Movie Downloads",
      });
    } catch {
      return;
    }

    const actions = {
      play: () => {
        if (hasMethod(player, "play")) {
          player.play();
        }
      },
      pause: () => {
        if (hasMethod(player, "pause")) {
          player.pause();
        }
      },
      seekbackward: () => {
        player.currentTime = Math.max((Number(player.currentTime) || 0) - 10, 0);
      },
      seekforward: () => {
        const currentTime = Number(player.currentTime) || 0;
        player.currentTime = Number.isFinite(player.duration)
          ? Math.min(currentTime + 30, Math.max(player.duration - 0.1, 0))
          : currentTime + 30;
      },
    };

    for (const [action, handler] of Object.entries(actions)) {
      try {
        navigatorRef.mediaSession.setActionHandler(action, handler);
      } catch {
        // Some browsers expose Media Session but not every action.
      }
    }
  }

  function updatePlaybackState(state) {
    if (navigatorRef && navigatorRef.mediaSession) {
      navigatorRef.mediaSession.playbackState = state;
    }
  }

  function updateKeepAwakeButton(message = "") {
    if (!keepAwakeButton) {
      return;
    }

    if (!navigatorRef || !navigatorRef.wakeLock || !hasMethod(navigatorRef.wakeLock, "request")) {
      keepAwakeButton.textContent = "Keep Awake Unavailable";
      keepAwakeButton.disabled = true;
      return;
    }

    keepAwakeButton.disabled = false;
    keepAwakeButton.textContent = wakeLock
      ? "Keep Awake On"
      : "Keep Awake";

    if (message) {
      updateStatus(message);
    }
  }

  async function requestWakeLock() {
    if (!navigatorRef || !navigatorRef.wakeLock || !hasMethod(navigatorRef.wakeLock, "request") || wakeLock) {
      updateKeepAwakeButton();
      return false;
    }

    try {
      wakeLock = await navigatorRef.wakeLock.request("screen");
      if (hasMethod(wakeLock, "addEventListener")) {
        wakeLock.addEventListener("release", () => {
          wakeLock = null;
          updateKeepAwakeButton();
        });
      }
      updateKeepAwakeButton("Keep awake is on while this browser stays open.");
      return true;
    } catch {
      updateKeepAwakeButton("Keep awake could not be started. Start playback, then tap Keep Awake again.");
      return false;
    }
  }

  async function releaseWakeLock() {
    const lock = wakeLock;
    wakeLock = null;
    if (hasMethod(lock, "release")) {
      await lock.release().catch(() => {});
    }
    updateKeepAwakeButton();
  }

  function updateCastButton() {
    if (!castButton) {
      return;
    }

    castButton.disabled = !authenticated;
    if (safariAirPlayAvailable || player.webkitShowPlaybackTargetPicker) {
      castButton.textContent = "Safari AirPlay";
      return;
    }

    if (googleCastReady) {
      castButton.textContent = "Choose Google TV";
      return;
    }

    castButton.textContent = browserCastLabel();
  }

  function browserInfo() {
    const userAgent = navigatorRef && navigatorRef.userAgent ? navigatorRef.userAgent : "";
    const vendor = navigatorRef && navigatorRef.vendor ? navigatorRef.vendor : "";
    const isChromium = /Chrome|CriOS|Chromium|Edg|OPR/i.test(userAgent);
    const isSafari = /Safari/i.test(userAgent) && /Apple/i.test(vendor) && !/Chrome|CriOS|Chromium|Edg|OPR/i.test(userAgent);
    const isIOS = /iPad|iPhone|iPod/i.test(userAgent) || (navigatorRef && navigatorRef.platform === "MacIntel" && navigatorRef.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(userAgent);

    return { isAndroid, isChromium, isIOS, isSafari };
  }

  function browserCastLabel() {
    const info = browserInfo();
    if (info.isSafari || info.isIOS) {
      return "Safari AirPlay Help";
    }
    if (info.isChromium || info.isAndroid) {
      return "Google Cast Help";
    }
    return "TV Cast Help";
  }

  function browserCastInstructions() {
    const info = browserInfo();
    if (info.isSafari || info.isIOS) {
      return "iPhone TV playback uses Safari AirPlay: keep the iPhone and Apple TV or AirPlay TV on the same Wi-Fi, start the movie, then tap Safari AirPlay or the AirPlay icon in the video controls. Keep Safari open while the TV plays.";
    }
    if (info.isChromium || info.isAndroid) {
      return "Google Cast uses Wi-Fi: keep this device and the Chromecast, Google TV, or Cast-enabled TV on the same Wi-Fi, start the movie, tap Google Cast, then choose the TV by its Google Home name.";
    }
    return "Start the movie, then use your browser's Cast, AirPlay, or screen-mirroring option. TV discovery happens through the same Wi-Fi network.";
  }

  function castDeviceName(session) {
    const activeSession = session || (googleCastContext && hasMethod(googleCastContext, "getCurrentSession")
      ? googleCastContext.getCurrentSession()
      : null);
    const castDevice = activeSession && hasMethod(activeSession, "getCastDevice")
      ? activeSession.getCastDevice()
      : null;
    const friendlyName = castDevice && castDevice.friendlyName;
    return typeof friendlyName === "string" && friendlyName.trim()
      ? friendlyName.trim()
      : "Google TV";
  }

  function castState() {
    return googleCastContext && hasMethod(googleCastContext, "getCastState")
      ? googleCastContext.getCastState()
      : "";
  }

  async function initializeGoogleCast() {
    const info = browserInfo();
    if (info.isIOS || info.isSafari || !info.isChromium) {
      return false;
    }

    const castAvailable = windowRef ? await windowRef.__movieRoomCastApiReady : false;
    const castFramework = windowRef && windowRef.cast ? windowRef.cast.framework : null;
    const chromeCast = windowRef && windowRef.chrome ? windowRef.chrome.cast : null;
    if (
      !castAvailable
      || !castFramework
      || !castFramework.CastContext
      || !hasMethod(castFramework.CastContext, "getInstance")
      || !chromeCast
      || !chromeCast.media
      || !chromeCast.media.DEFAULT_MEDIA_RECEIVER_APP_ID
    ) {
      updateCastButton();
      updateTvGuide();
      return false;
    }

    googleCastContext = castFramework.CastContext.getInstance();
    googleCastContext.setOptions({
      receiverApplicationId: chromeCast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
      autoJoinPolicy: chromeCast.AutoJoinPolicy ? chromeCast.AutoJoinPolicy.ORIGIN_SCOPED : undefined,
    });
    googleCastReady = true;

    const castStateChanged = castFramework.CastContextEventType
      ? castFramework.CastContextEventType.CAST_STATE_CHANGED
      : null;
    if (castStateChanged) {
      googleCastContext.addEventListener(castStateChanged, () => {
        updateCastButton();
        updateTvGuide();
      });
    }

    const sessionStateChanged = castFramework.CastContextEventType
      ? castFramework.CastContextEventType.SESSION_STATE_CHANGED
      : null;
    if (sessionStateChanged) {
      googleCastContext.addEventListener(sessionStateChanged, () => {
        updateCastButton();
        updateTvGuide();
      });
    }

    updateCastButton();
    updateTvGuide();
    return true;
  }

  async function requestCastPlayback(movieId) {
    const response = await handleApiResponse(
      await fetchImpl("/api/cast/playback", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ movieId }),
      }),
      "Unable to prepare this movie for Google Cast.",
    );
    return response.json();
  }

  async function loadSelectedMovieOnCast(session) {
    const movie = selectedMovie();
    if (!movie) {
      updateStatus("Select a movie before choosing a TV.");
      return false;
    }

    updateStatus(`Preparing ${movie.title || "this movie"} for ${castDeviceName(session)}...`);
    const playback = await requestCastPlayback(movie.id);
    const mediaApi = windowRef && windowRef.chrome && windowRef.chrome.cast ? windowRef.chrome.cast.media : null;
    if (!mediaApi || !mediaApi.MediaInfo || !mediaApi.LoadRequest) {
      throw new Error("Google Cast became unavailable. Reload Chrome and try again.");
    }

    const mediaInfo = new mediaApi.MediaInfo(playback.url, playback.contentType || "video/mp4");
    if (mediaApi.GenericMediaMetadata) {
      const metadata = new mediaApi.GenericMediaMetadata();
      metadata.title = playback.title || movie.title || movie.fileName || "Movie Room";
      metadata.subtitle = movieFolderLabel(movie);
      mediaInfo.metadata = metadata;
    }

    const request = new mediaApi.LoadRequest(mediaInfo);
    request.autoplay = true;
    request.currentTime = Number.isFinite(player.currentTime)
      ? Math.max(0, player.currentTime)
      : 0;
    await session.loadMedia(request);
    if (hasMethod(player, "pause")) {
      player.pause();
    }
    updateStatus(`Playing on ${castDeviceName(session)}. This device is now the remote.`);
    if (tvGuideStatus) {
      tvGuideStatus.textContent = `${castDeviceName(session)} is connected through Wi-Fi and playing the selected movie.`;
    }
    return true;
  }

  function replaceGuideSteps(steps) {
    if (!tvGuideSteps || !tvGuideSteps.ownerDocument) {
      return;
    }

    tvGuideSteps.replaceChildren();
    for (const step of steps) {
      const item = tvGuideSteps.ownerDocument.createElement("li");
      item.textContent = step;
      tvGuideSteps.append(item);
    }
  }

  function updateTvGuide() {
    const info = browserInfo();
    if (info.isSafari || info.isIOS) {
      if (tvGuideTitle) {
        tvGuideTitle.textContent = "iPhone to TV";
      }
      replaceGuideSteps([
        "Connect the iPhone and Apple TV or AirPlay TV to the same Wi-Fi network.",
        "Open this page in Safari, sign in, and start the movie.",
        "Tap Safari AirPlay above, or tap the AirPlay icon inside the video controls, then choose the TV.",
        "Keep Safari open on the phone while the TV plays.",
      ]);
      if (tvGuideStatus) {
        tvGuideStatus.textContent = player.webkitShowPlaybackTargetPicker || safariAirPlayAvailable
          ? "AirPlay is available from this player. Tap Safari AirPlay after the movie starts."
          : "If the AirPlay icon is missing, use iPhone Control Center Screen Mirroring or confirm the TV supports AirPlay and is on the same Wi-Fi.";
      }
      return;
    }

    if (info.isChromium || info.isAndroid) {
      if (tvGuideTitle) {
        tvGuideTitle.textContent = "Google Cast to TV";
      }
      replaceGuideSteps([
        "Connect the Android phone and Chromecast, Google TV, or Cast-capable TV to the same Wi-Fi network.",
        "Open this page in Chrome, sign in, and start the movie.",
        "Tap Choose Google TV to open Google's Wi-Fi device picker and select the TV by its Google Home name.",
        "Keep Chrome open on the phone while the TV plays.",
      ]);
      if (tvGuideStatus) {
        const session = googleCastContext && hasMethod(googleCastContext, "getCurrentSession")
          ? googleCastContext.getCurrentSession()
          : null;
        if (session) {
          tvGuideStatus.textContent = `${castDeviceName(session)} is connected through Wi-Fi.`;
        } else if (
          googleCastReady
          && windowRef
          && windowRef.cast
          && windowRef.cast.framework
          && windowRef.cast.framework.CastState
          && castState() === windowRef.cast.framework.CastState.NO_DEVICES_AVAILABLE
        ) {
          tvGuideStatus.textContent = "No Google Cast TVs were found. Confirm the TV and this device are on the same Wi-Fi and that the TV appears in Google Home.";
        } else if (googleCastReady) {
          tvGuideStatus.textContent = "Google Cast is ready. Tap Choose Google TV to see the friendly device names saved in Google Home.";
        } else {
          tvGuideStatus.textContent = "Google Cast is loading in Chrome. TV discovery uses Wi-Fi, not Bluetooth pairing.";
        }
      }
      return;
    }

    if (tvGuideTitle) {
      tvGuideTitle.textContent = "Phone to TV";
    }
    if (tvGuideStatus) {
      tvGuideStatus.textContent = browserCastInstructions();
    }
  }

  async function promptRemotePlayback() {
    if (player.webkitShowPlaybackTargetPicker) {
      try {
        player.webkitShowPlaybackTargetPicker();
        updateStatus("Choose your Apple TV or AirPlay TV in the Safari picker. Keep Safari open on the iPhone as the controller.");
        return;
      } catch {
        updateStatus("AirPlay was not started. Open the video controls and use the AirPlay icon if Safari shows it there.");
        return;
      }
    }

    if (googleCastReady && googleCastContext) {
      try {
        let session = hasMethod(googleCastContext, "getCurrentSession")
          ? googleCastContext.getCurrentSession()
          : null;
        if (!session) {
          updateStatus("Opening the Google Cast Wi-Fi device picker...");
          const errorCode = await googleCastContext.requestSession();
          if (errorCode) {
            updateStatus("Google Cast did not connect. Confirm the TV is on the same Wi-Fi and try again.");
            return;
          }
          session = hasMethod(googleCastContext, "getCurrentSession")
            ? googleCastContext.getCurrentSession()
            : null;
        }

        if (!session) {
          updateStatus("No Google Cast TV was selected.");
          return;
        }

        await loadSelectedMovieOnCast(session);
        return;
      } catch {
        updateStatus("Google Cast was canceled or could not connect. Confirm both devices are on the same Wi-Fi.");
        return;
      }
    }

    updateStatus(browserCastInstructions());
  }

  function allowRemotePlayback() {
    player.disableRemotePlayback = false;
    if (hasMethod(player, "removeAttribute")) {
      player.removeAttribute("disableremoteplayback");
      player.removeAttribute("x-webkit-wirelessvideoplaybackdisabled");
    }
    if (hasMethod(player, "setAttribute")) {
      player.setAttribute("x-webkit-airplay", "allow");
      player.setAttribute("webkit-playsinline", "");
    }
    updateCastButton();
    updateTvGuide();
  }

  async function openFullscreenPlayer() {
    const fullscreenTarget = playerFrame || player;
    if (fullscreenTarget && fullscreenTarget.requestFullscreen) {
      await fullscreenTarget.requestFullscreen().catch(() => {});
      return;
    }

    if (player.webkitEnterFullscreen) {
      player.webkitEnterFullscreen();
      return;
    }

    updateStatus("Fullscreen is not available in this browser.");
  }

  function updateLoginStatus(message) {
    loginStatus.textContent = message;
  }

  function updatePermissionStatus(message) {
    if (permissionStatus) {
      permissionStatus.textContent = message;
    }
  }

  function markPermissionPanelDone() {
    try {
      if (localStorageRef && hasMethod(localStorageRef, "setItem")) {
        localStorageRef.setItem(permissionStorageKey, "done");
      }
    } catch {
      // Browsers can disable localStorage. The panel can still be dismissed for this page view.
    }

    if (permissionPanel) {
      permissionPanel.hidden = true;
    }

    if (remoteTarget && (!remoteTarget.isConnected || remoteTarget.hidden || (remoteTarget.closest && remoteTarget.closest("[hidden]")))) {
      if (remoteTarget.classList) remoteTarget.classList.remove("remote-target-active");
      remoteTarget = null;
    }
    const firstRemoteTarget = visibleRemoteTargets()[0];
    if (firstRemoteTarget) {
      rememberRemoteTarget(firstRemoteTarget);
      if (hasMethod(firstRemoteTarget, "focus")) firstRemoteTarget.focus();
    }
  }

  function showPermissionPanelIfNeeded() {
    if (!permissionPanel) {
      return;
    }

    let alreadyHandled = false;
    try {
      alreadyHandled = Boolean(localStorageRef && hasMethod(localStorageRef, "getItem") && localStorageRef.getItem(permissionStorageKey) === "done");
    } catch {
      alreadyHandled = false;
    }

    permissionPanel.hidden = alreadyHandled;
    if (!alreadyHandled) {
      updatePermissionStatus("Tap allow to let the browser show the permissions it supports.");
    }
  }

  function requestLocationPermission() {
    return new Promise((resolve) => {
      if (!navigatorRef || !navigatorRef.geolocation || !hasMethod(navigatorRef.geolocation, "getCurrentPosition")) {
        resolve("Location is not available in this browser.");
        return;
      }

      navigatorRef.geolocation.getCurrentPosition(
        () => resolve("Location permission allowed."),
        () => resolve("Location permission was not allowed or is unavailable."),
        {
          enableHighAccuracy: false,
          maximumAge: 10 * 60 * 1000,
          timeout: 6000,
        },
      );
    });
  }

  async function requestFirstRunPermissions() {
    if (enablePermissionsButton) {
      enablePermissionsButton.disabled = true;
    }
    updatePermissionStatus("Opening browser permission prompts...");

    const results = [];
    results.push("Cookies are allowed for this site session.");
    results.push(await requestLocationPermission());
    if (navigatorRef && navigatorRef.wakeLock && hasMethod(navigatorRef.wakeLock, "request")) {
      const wakeLockStarted = await requestWakeLock();
      results.push(wakeLockStarted ? "Screen wake permission is ready." : "Screen wake permission was not started yet.");
    } else {
      results.push("Screen wake permission is not available in this browser.");
    }
    results.push("TV discovery uses the Wi-Fi picker shown by Google Cast or Safari AirPlay.");

    updatePermissionStatus(results.join(" "));
    markPermissionPanelDone();
    if (enablePermissionsButton) {
      enablePermissionsButton.disabled = false;
    }
  }

  function setPasswordErrorState(hasError) {
    if (typeof passwordInput.setAttribute !== "function" || typeof passwordInput.removeAttribute !== "function") {
      return;
    }

    if (hasError) {
      passwordInput.setAttribute("aria-invalid", "true");
      return;
    }

    passwordInput.removeAttribute("aria-invalid");
  }

  function setAuthenticated(isAuthenticated) {
    if (!isAuthenticated && activePreviewCancel) activePreviewCancel();
    authenticated = Boolean(isAuthenticated);
    authPanel.hidden = authenticated;
    libraryPanel.hidden = !authenticated;
    if (remoteControlBar) remoteControlBar.hidden = !authenticated;
    if (searchInput) {
      searchInput.disabled = !authenticated;
    }
    if (reloadButton) {
      reloadButton.disabled = !authenticated;
    }
    if (logoutButton) {
      logoutButton.disabled = !authenticated || publicAccess;
      logoutButton.hidden = publicAccess;
    }
    if (castButton) {
      updateCastButton();
    }
    if (keepAwakeButton) {
      keepAwakeButton.disabled = !authenticated || !navigatorRef || !navigatorRef.wakeLock || !hasMethod(navigatorRef.wakeLock, "request");
    }
    if (fullscreenButton) {
      fullscreenButton.disabled = !authenticated;
    }

    if (pairFireTvButton) {
      pairFireTvButton.disabled = !authenticated;
    }
    if (profileToggle) {
      profileToggle.disabled = !authenticated;
    }
  }

  function setAuthUnavailable(unavailable) {
    passwordInput.disabled = unavailable;
    if (submitButton) {
      submitButton.disabled = unavailable;
    }
  }

  function announceLoginError(message) {
    updateLoginStatus(message);
    setPasswordErrorState(true);
    if (typeof loginStatus.focus === "function") {
      loginStatus.focus();
    }
  }

  function movieLabel(movie) {
    if (!isMoviePlayable(movie)) {
      return `${movie.title} (still uploading)`;
    }

    const size = Number(movie.size) || 0;
    const sizeInGb = (size / (1024 ** 3)).toFixed(2);
    return `${movie.title} (${sizeInGb} GB)`;
  }

  function movieSizeLabel(size) {
    const numericSize = Number(size) || 0;
    if (numericSize <= 0) {
      return "still uploading";
    }

    if (numericSize >= 1024 ** 3) {
      return `${(numericSize / (1024 ** 3)).toFixed(2)} GB`;
    }

    if (numericSize >= 1024 ** 2) {
      return `${(numericSize / (1024 ** 2)).toFixed(0)} MB`;
    }

    return `${numericSize} bytes`;
  }

  function movieAvailabilityLabel(movie) {
    return isMoviePlayable(movie) ? movieSizeLabel(movie.size) : "still uploading";
  }

  function movieInitials(movie) {
    const title = movie.title || movie.fileName || "Movie";
    const words = title.split(/\s+/).filter(Boolean);
    return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "M";
  }

  function posterAltText(movie) {
    return `${movie.title || movie.fileName || "Movie"} cover`;
  }

  function remoteArtworkUrl(movie) {
    const params = new URLSearchParams();
    params.set("title", movie.title || movie.fileName || "Movie");
    if (movie.year) params.set("year", String(movie.year));
    return `/api/artwork?${params.toString()}`;
  }

  function ensureArtwork(movie) {
    const source = movie || {};
    const fallback = remoteArtworkUrl(source);
    return {
      ...source,
      // Existing Jellyfin/OneDrive/bundled art remains primary. Every item
      // still gets an authenticated title-based artwork lookup URL.
      posterUrl: source.posterUrl || fallback,
      posterFallbackUrl: source.posterFallbackUrl || fallback,
    };
  }

  function recentSearchesForProfile() {
    try {
      const parsed = JSON.parse(readLocalValue(`${profileSearchPrefix}${activeProfile}`) || "[]");
      return Array.isArray(parsed) ? parsed.filter(Boolean).slice(0, 8) : [];
    } catch {
      return [];
    }
  }

  function visibleRemoteTargets() {
    if (!documentRef || typeof documentRef.querySelectorAll !== "function") return [];
    return Array.from(documentRef.querySelectorAll("button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])"))
      .filter((element) => !(remoteControlBar && remoteControlBar.contains(element)))
      .filter((element) => {
        if (settingsDialog && hasMethod(settingsDialog, "contains") && settingsDialog.contains(element) && !settingsDialog.open) return false;
        if (element.hidden || (element.closest && element.closest("[hidden]"))) return false;
        const rect = hasMethod(element, "getBoundingClientRect") ? element.getBoundingClientRect() : null;
        return !rect || (rect.width > 0 && rect.height > 0);
      });
  }

  function remoteTargetLabel(target) {
    if (!target) return "Home";
    const ariaLabel = target && typeof target.getAttribute === "function" ? target.getAttribute("aria-label") : "";
    return String(ariaLabel || target.textContent || target.id || "Selected")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 44) || "Selected";
  }

  function rememberRemoteTarget(target) {
    if (!target || (remoteControlBar && remoteControlBar.contains(target))) return;
    if (remoteTarget && remoteTarget.classList) remoteTarget.classList.remove("remote-target-active");
    remoteTarget = target;
    if (remoteTarget.classList) remoteTarget.classList.add("remote-target-active");
    if (remoteFocusLabel) remoteFocusLabel.textContent = `Selected: ${remoteTargetLabel(remoteTarget)}`;
  }

  function moveRemoteFocus(direction) {
    const targets = visibleRemoteTargets();
    if (!targets.length) return false;
    const current = remoteTarget && targets.includes(remoteTarget)
      ? remoteTarget
      : (documentRef && targets.includes(documentRef.activeElement) ? documentRef.activeElement : targets[0]);
    if (!current || !hasMethod(current, "getBoundingClientRect")) {
      rememberRemoteTarget(targets[0]);
      targets[0].focus();
      return true;
    }
    const origin = current.getBoundingClientRect();
    const candidates = targets
      .filter((target) => target !== current && hasMethod(target, "getBoundingClientRect"))
      .map((target) => {
        const rect = target.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const originX = origin.left + origin.width / 2;
        const originY = origin.top + origin.height / 2;
        const primary = direction === "left" ? originX - centerX : direction === "right" ? centerX - originX : direction === "up" ? originY - centerY : centerY - originY;
        const cross = direction === "left" || direction === "right" ? Math.abs(centerY - originY) : Math.abs(centerX - originX);
        return { target, primary, score: (primary >= -8 ? 0 : 100000) + Math.max(0, primary) * 100 + cross };
      })
      .sort((left, right) => left.score - right.score);
    let next = candidates[0] && candidates[0].primary >= -8 ? candidates[0].target : null;
    if (!next) {
      const edgeCandidates = targets
        .filter((target) => target !== current && hasMethod(target, "getBoundingClientRect"))
        .map((target) => ({ target, rect: target.getBoundingClientRect() }))
        .sort((left, right) => {
          const leftRect = left.rect;
          const rightRect = right.rect;
          const currentCross = direction === "left" || direction === "right"
            ? origin.top + origin.height / 2
            : origin.left + origin.width / 2;
          const leftCross = direction === "left" || direction === "right"
            ? leftRect.top + leftRect.height / 2
            : leftRect.left + leftRect.width / 2;
          const rightCross = direction === "left" || direction === "right"
            ? rightRect.top + rightRect.height / 2
            : rightRect.left + rightRect.width / 2;
          const crossDifference = Math.abs(leftCross - currentCross) - Math.abs(rightCross - currentCross);
          if (Math.abs(crossDifference) > 8) return crossDifference;
          if (direction === "left") return rightRect.left - leftRect.left;
          if (direction === "right") return leftRect.left - rightRect.left;
          if (direction === "up") return rightRect.top - leftRect.top;
          return leftRect.top - rightRect.top;
        });
      next = edgeCandidates[0] ? edgeCandidates[0].target : null;
    }
    if (!next) return false;
    rememberRemoteTarget(next);
    next.focus();
    if (hasMethod(next, "scrollIntoView")) next.scrollIntoView({ behavior: "auto", block: "nearest", inline: "nearest" });
    return true;
  }

  function activateRemoteTarget() {
    if (remoteTarget && hasMethod(remoteTarget, "click")) {
      remoteTarget.click();
      return true;
    }
    return false;
  }

  function openSettings() {
    if (!settingsDialog) return false;
    try {
      if (hasMethod(settingsDialog, "showModal")) settingsDialog.showModal();
      else settingsDialog.hidden = false;
    } catch {
      settingsDialog.hidden = false;
    }
    if (settingsNetworkButton && hasMethod(settingsNetworkButton, "focus")) settingsNetworkButton.focus();
    if (settingsNetworkButton) rememberRemoteTarget(settingsNetworkButton);
    return true;
  }

  function closeSettings() {
    if (!settingsDialog) return false;
    if (hasMethod(settingsDialog, "close")) settingsDialog.close();
    else settingsDialog.hidden = true;
    const firstRemoteTarget = visibleRemoteTargets()[0];
    if (firstRemoteTarget) rememberRemoteTarget(firstRemoteTarget);
    return true;
  }

  function invokeAndroidSetting(methodName, browserMessage) {
    const bridge = windowRef && windowRef.MovieRoomAndroid;
    if (bridge && typeof bridge[methodName] === "function") {
      bridge[methodName]();
      return true;
    }
    updateStatus(browserMessage);
    return false;
  }

  function remoteBack() {
    if (searchOverlay && !searchOverlay.hidden) {
      setSearchOverlayVisible(false);
      return;
    }
    if (movieDetailsDialog && movieDetailsDialog.open) {
      if (hasMethod(movieDetailsDialog, "close")) movieDetailsDialog.close();
      return;
    }
    if (settingsDialog && settingsDialog.open) {
      closeSettings();
      return;
    }
    if (playerVisible && closePlayerPage) {
      closePlayerPage.click();
      return;
    }
    setActivePage("home");
    if (heroMovie && hasMethod(heroMovie, "scrollIntoView")) heroMovie.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function remotePlayPause() {
    if (!playerVisible || !player) return activateRemoteTarget();
    if (player.paused) {
      if (hasMethod(player, "play")) {
        const playPromise = player.play();
        if (playPromise && hasMethod(playPromise, "catch")) playPromise.catch(() => {});
      }
    } else if (hasMethod(player, "pause")) {
      player.pause();
    }
    return true;
  }

  function bindRemoteButton(button, action) {
    if (!button || !hasMethod(button, "addEventListener")) return;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      if (["up", "left", "right", "down"].includes(action)) moveRemoteFocus(action);
      else if (action === "select") activateRemoteTarget();
      else if (action === "back") remoteBack();
      else if (action === "home") { setActivePage("home"); if (heroMovie && hasMethod(heroMovie, "scrollIntoView")) heroMovie.scrollIntoView({ behavior: "smooth", block: "start" }); }
      else if (action === "play") remotePlayPause();
      else if (action === "settings") openSettings();
    });
  }

  function handleRemoteCommand(action) {
    const command = String(action || "").toLowerCase();
    if (["up", "left", "right", "down"].includes(command)) return moveRemoteFocus(command);
    if (command === "select" || command === "ok" || command === "center") return activateRemoteTarget();
    if (command === "back") { remoteBack(); return true; }
    if (command === "home") { setActivePage("home"); if (heroMovie && hasMethod(heroMovie, "scrollIntoView")) heroMovie.scrollIntoView({ behavior: "smooth", block: "start" }); return true; }
    if (command === "play" || command === "pause" || command === "playpause") return remotePlayPause();
    if (command === "settings") return openSettings();
    return false;
  }

  function rememberSearchForProfile(term) {
    const normalized = String(term || "").trim();
    if (!normalized) return;
    const next = [normalized, ...recentSearchesForProfile().filter((value) => value.toLowerCase() !== normalized.toLowerCase())].slice(0, 8);
    writeLocalValue(`${profileSearchPrefix}${activeProfile}`, JSON.stringify(next));
  }

  function generatedPosterUrl(movie) {
    const title = String(movie.title || movie.fileName || "Movie").trim().slice(0, 80);
    const initials = movieInitials(movie);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900" role="img" aria-label="${title.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#32769d"/><stop offset="1" stop-color="#102b4a"/></linearGradient></defs><rect width="600" height="900" fill="url(#g)"/><circle cx="480" cy="130" r="160" fill="#62e3db" opacity=".22"/><path d="M0 670 600 370v530H0z" fill="#061a31" opacity=".42"/><text x="48" y="75" fill="#a8fff0" font-family="Arial,sans-serif" font-size="25" font-weight="700" letter-spacing="4">TAYLORMADE MOVIES</text><text x="48" y="460" fill="white" font-family="Arial,sans-serif" font-size="176" font-weight="800">${initials}</text><foreignObject x="48" y="605" width="504" height="210"><div xmlns="http://www.w3.org/1999/xhtml" style="color:white;font:700 45px Arial,sans-serif;line-height:1.12;overflow:hidden">${title.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</div></foreignObject></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function appendPosterImage(poster, movie, alt = posterAltText(movie)) {
    const documentRef = poster && poster.ownerDocument;
    if (!documentRef || !hasMethod(documentRef, "createElement")) return;
    const image = documentRef.createElement("img");
    const fallbackUrl = generatedPosterUrl(movie);
    image.alt = alt;
    image.loading = "lazy";
    image.decoding = "async";
    image.src = fallbackUrl;
    if (movie.posterUrl) {
      attachArtworkImage(image, movie.posterUrl, () => { image.src = fallbackUrl; }, movie.posterFallbackUrl);
    }
    poster.prepend(image);
  }

  function attachArtworkImage(image, url, onFailure, fallbackUrl = "") {
    let attempts = 0;
    const load = () => {
      const separator = String(url).includes("?") ? "&" : "?";
      image.src = `${url}${separator}artworkRetry=${attempts}`;
    };
    image.addEventListener("error", () => {
      if (attempts < 2) {
        attempts += 1;
        setTimeoutImpl(load, attempts * 350);
        return;
      }
      if (fallbackUrl && fallbackUrl !== url) {
        url = fallbackUrl;
        fallbackUrl = "";
        attempts = 0;
        load();
        return;
      }
      if (typeof onFailure === "function") onFailure();
    }, { once: false });
    load();
  }

  function displayFolderLabel(folder) {
    const parts = String(folder || "").split(/[\\/]/).filter(Boolean);
    const leaf = parts.length ? parts[parts.length - 1] : "";
    if (!leaf) {
      return "Main Folder";
    }

    let cleaned = leaf
      .replace(/\[[^\]]*]/g, " ")
      .replace(/\([^)]*(?:19|20)\d{2}[^)]*\)/gi, " ")
      .replace(/[._-]+/g, " ")
      .replace(/\s*[[(]?\b(?:19|20)\d{2}\b.*$/i, " ")
      .replace(/\s+\b(?:480p|576p|720p|1080p|2160p|4k|web\s*dl|webrip|bluray|x264|x265|h264|h265|hevc|aac)\b.*$/i, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (/^home alone 1,?\s*2,?\s*3,?\s*4,?\s*5/i.test(cleaned)) {
      cleaned = "Home Alone Collection";
    }
    if (!cleaned) {
      return "Movie library";
    }
    return cleaned.length > 36 ? `${cleaned.slice(0, 33).trim()}…` : cleaned;
  }

  function movieFolderLabel(movie) {
    const folderLabel = displayFolderLabel(movie && movie.folder);
    const title = String((movie && (movie.title || movie.fileName)) || "").toLowerCase();
    return folderLabel.toLowerCase() === title ? "Movie Room" : folderLabel;
  }

  function updateNowPlaying(movie, playback = null) {
    if (!movie) {
      if (nowPlayingTitle) {
        nowPlayingTitle.textContent = "Choose a movie";
      }
      if (nowPlayingDetail) {
        nowPlayingDetail.textContent = "Select a thumbnail below to start streaming.";
      }
      return;
    }

    if (nowPlayingTitle) {
      nowPlayingTitle.textContent = movie.title || movie.fileName || "Untitled movie";
    }
    if (nowPlayingDetail) {
      const details = [movieFolderLabel(movie), movieAvailabilityLabel(movie)];
      if (playback && playback.contentType) {
        details.push(playback.contentType.replace(/^video\//, "").toUpperCase());
      }
      nowPlayingDetail.textContent = details.join(" • ");
    }
  }

  function normalizeLibraryPayload(payload) {
    if (Array.isArray(payload)) {
      return { movies: payload.map(ensureArtwork), folders: [] };
    }

    return {
      ...(payload || {}),
      movies: payload && Array.isArray(payload.movies) ? payload.movies.map(ensureArtwork) : [],
      folders: payload && Array.isArray(payload.folders) ? payload.folders : [],
    };
  }

  function buildFoldersFromMovies(movies, folders) {
    const folderMap = new Map();
    for (const folder of folders) {
      if (!folder || !folder.path) {
        continue;
      }
      folderMap.set(folder.path, {
        ...folder,
        name: folder.name || folder.path.split("/").pop(),
      });
    }

    for (const movie of movies) {
      if (!movie.folder) {
        continue;
      }

      const parts = movie.folder.split("/");
      for (let index = 0; index < parts.length; index += 1) {
        const folderPath = parts.slice(0, index + 1).join("/");
        if (!folderMap.has(folderPath)) {
          folderMap.set(folderPath, {
            id: folderPath,
            path: folderPath,
            name: parts[index],
            parent: parts.slice(0, index).join("/"),
            hidden: parts[index].startsWith("."),
          });
        }
      }
    }

    return Array.from(folderMap.values()).map((folder) => {
      const descendantMovies = movies.filter((movie) => (
        movie.folder === folder.path || movie.folder.startsWith(`${folder.path}/`)
      ));
      return {
        ...folder,
        movieCount: Number.isFinite(Number(folder.movieCount)) ? Number(folder.movieCount) : descendantMovies.length,
        playableCount: Number.isFinite(Number(folder.playableCount))
          ? Number(folder.playableCount)
          : descendantMovies.filter((movie) => (Number(movie.size) || 0) > 0).length,
        uploadingCount: Number.isFinite(Number(folder.uploadingCount))
          ? Number(folder.uploadingCount)
          : descendantMovies.filter((movie) => (Number(movie.size) || 0) <= 0).length,
      };
    }).sort((left, right) => left.path.localeCompare(right.path));
  }

  function movieMatchesFilter(movie) {
    const movieFolder = movie.folder || "";
    const folderMatches = activeFolder === "all"
      || (activeFolder === "" && !movieFolder)
      || movieFolder === activeFolder
      || movieFolder.startsWith(`${activeFolder}/`);
    const categoryMatches = activeCategory.startsWith("alpha-")
      ? movieAlphaCategory(movie) === activeCategory
      : movieInAudience(movie, activeCategory);
    const searchable = `${movie.title || ""} ${movie.fileName || ""} ${movie.folder || ""}`.toLowerCase();
    return folderMatches && categoryMatches && searchable.includes(searchTerm);
  }

  function setSearchOverlayVisible(visible) {
    if (!searchOverlay) return;
    searchOverlay.hidden = !visible;
    searchOverlay.setAttribute("aria-hidden", visible ? "false" : "true");
    if (visible) {
      searchOverlayPreviousFocus = documentRef && documentRef.activeElement;
      renderSearchOverlay();
      if (searchOverlayClose && hasMethod(searchOverlayClose, "focus")) searchOverlayClose.focus();
    } else if (searchOverlayPreviousFocus && hasMethod(searchOverlayPreviousFocus, "focus")) {
      searchOverlayPreviousFocus.focus();
      searchOverlayPreviousFocus = null;
    }
  }

  function moveToMovie(movie, { openDetails = false } = {}) {
    if (!movie || !isMoviePlayable(movie)) return false;
    activePage = "library";
    setActivePage("library");
    movieSelect.value = movie.id;
    rememberMovieForProfile(movie.id);
    updateNowPlaying(movie);
    setSearchOverlayVisible(false);
    if (openDetails) {
      openMovieDetails(movie);
      return true;
    }
    playSelectedMovie({ scrollToPlayer: true }).catch((error) => updateStatus(error.message));
    return true;
  }

  function renderSearchOverlay() {
    if (!searchOverlay || !searchOverlayResults || !searchOverlayGenres) return;
    const ownerDocument = searchOverlay.ownerDocument || documentRef;
    if (!ownerDocument) return;
    let results = searchMovies(allMovies, { term: searchTerm, genre: searchOverlayGenre });
    const savedOptions = [
      { id: "favorites", label: "Favorites", count: allMovies.filter((movie) => { const record = viewerRecord(movie.id); return Boolean(record && record.favorite); }).length },
      { id: "watch-later", label: "Watch Later", count: allMovies.filter((movie) => { const record = viewerRecord(movie.id); return Boolean(record && record.watchLater); }).length },
    ];
    if (searchOverlayGenre === "favorites") results = results.filter((movie) => { const record = viewerRecord(movie.id); return Boolean(record && record.favorite); });
    if (searchOverlayGenre === "watch-later") results = results.filter((movie) => { const record = viewerRecord(movie.id); return Boolean(record && record.watchLater); });
    const genreOptions = [...savedOptions, ...browseGenreOptions(allMovies)];
    searchOverlayGenres.replaceChildren(...genreOptions.map((option) => {
      const button = ownerDocument.createElement("button");
      button.type = "button";
      button.className = "search-genre-chip";
      button.textContent = `${option.label} ${option.count}`;
      button.setAttribute("aria-pressed", searchOverlayGenre === option.id ? "true" : "false");
      if (searchOverlayGenre === option.id) button.classList.add("active");
      button.addEventListener("click", () => {
        searchOverlayGenre = option.id;
        renderSearchOverlay();
      });
      return button;
    }));
    if (searchOverlaySummary) {
      searchOverlaySummary.textContent = searchTerm
        ? `${results.length} result${results.length === 1 ? "" : "s"} for “${searchTerm}”`
        : `${results.length} movie${results.length === 1 ? "" : "s"} in ${(viewerProfiles[activeProfile] && viewerProfiles[activeProfile].label) || "your"} library`;
    }
    if (!results.length) {
      const empty = ownerDocument.createElement("p");
      empty.className = "search-empty-state";
      empty.textContent = searchTerm ? "No movies match that search and genre." : "No movies are ready to browse yet.";
      searchOverlayResults.replaceChildren(empty);
      return;
    }
    searchOverlayResults.replaceChildren(...results.map((movie) => {
      const button = ownerDocument.createElement("button");
      const ready = isMoviePlayable(movie);
      button.type = "button";
      button.className = ready ? "search-result" : "search-result unavailable";
      button.disabled = !ready;
      const poster = ownerDocument.createElement("span");
      poster.className = "search-result-poster";
      appendPosterImage(poster, movie);
      const info = ownerDocument.createElement("span");
      info.className = "search-result-info";
      const title = ownerDocument.createElement("strong");
      title.textContent = movie.title || movie.fileName || "Untitled movie";
      const meta = ownerDocument.createElement("span");
      meta.textContent = [movie.year, ...genresForMovie(movie).slice(0, 2), movieAvailabilityLabel(movie)].filter(Boolean).join(" • ");
      const action = ownerDocument.createElement("span");
      action.className = "search-result-action";
      action.textContent = ready ? "Open details" : "Still uploading";
      info.append(title, meta, action);
      button.append(poster, info);
      button.addEventListener("click", () => {
        setSearchOverlayVisible(false);
        moveToMovie(movie, { openDetails: true });
      });
      return button;
    }));
  }

  function updateLibrarySummary(movies) {
    if (!librarySummary) {
      return;
    }

    const foundCount = movies.length;
    const playableCount = movies.filter(isMoviePlayable).length;
    const parts = [`${foundCount} titles`, `${playableCount} ready to play`];
    if (foundCount > playableCount) parts.push(`${foundCount - playableCount} unavailable`);

    librarySummary.textContent = parts.join(" / ");
  }

  function renderFolderShelf() {
    if (!folderShelf || typeof folderShelf.replaceChildren !== "function") {
      return;
    }

    const documentRef = folderShelf.ownerDocument;
    const folders = filterMovieFolders(buildFoldersFromMovies(allMovies, allFolders));
    const buttons = [];

    function createFolderButton(label, folderPath, count, extraText = "") {
      const button = documentRef.createElement("button");
      button.type = "button";
      button.className = "folder-chip";
      if (activeFolder === folderPath) {
        button.classList.add("active");
      }
      const icon = documentRef.createElementNS("http://www.w3.org/2000/svg", "svg");
      icon.classList.add("folder-icon");
      icon.setAttribute("viewBox", "0 0 24 20");
      icon.setAttribute("aria-hidden", "true");
      const iconPath = documentRef.createElementNS("http://www.w3.org/2000/svg", "path");
      iconPath.setAttribute("d", "M2 3.5A2.5 2.5 0 0 1 4.5 1h5.2l2 2H19.5A2.5 2.5 0 0 1 22 5.5v10A2.5 2.5 0 0 1 19.5 18h-15A2.5 2.5 0 0 1 2 15.5v-12ZM4 6h16v-.5a.5.5 0 0 0-.5-.5h-8.6l-2-2H4.5a.5.5 0 0 0-.5.5V6Z");
      icon.append(iconPath);
      const text = documentRef.createElement("span");
      text.className = "folder-label";
      text.textContent = extraText ? `${label} ${extraText}` : label;
      const countLabel = documentRef.createElement("span");
      countLabel.className = "folder-count";
      countLabel.textContent = String(count);
      button.append(icon, text, countLabel);
      button.addEventListener("click", () => {
        activeLibraryView = "movies";
        activeFolder = folderPath;
        renderLibrary();
      });
      return button;
    }

    buttons.push(createFolderButton("All", "all", allMovies.length));
    buttons.push(createFolderButton("Main Folder", "", allMovies.filter((movie) => !movie.folder).length));

    for (const folder of folders) {
      buttons.push(createFolderButton(
        displayFolderLabel(folder.name),
        folder.path,
        folder.movieCount || 0,
      ));
    }

    folderShelf.replaceChildren(...buttons);
  }

  function renderCategoryShelf() {
    if (!categoryShelf || typeof categoryShelf.replaceChildren !== "function") {
      return;
    }

    const documentRef = categoryShelf.ownerDocument;
    const collectionFolders = filterMovieFolders(buildFoldersFromMovies(allMovies, allFolders))
      .filter((folder) => isCollectionFolder(folder.path));
    const seriesCount = new Set(allMovies
      .filter((movie) => movie.contentType === "episode" || movie.seriesName)
      .map((movie) => movie.seriesPath || movie.seriesName)
      .filter(Boolean)).size;
    const viewGroups = [
      ["movies", "Movies", allMovies.filter((movie) => !isSampleMovie(movie) && movie.contentType !== "episode" && !movie.seriesName).length],
      ["collections", "Collections", collectionFolders.length + seriesCount],
      ["genres", "Genres", new Set(allMovies.flatMap((movie) => genresForMovie(movie))).size],
    ];
    const categoryGroups = [
      ["all", "Entire Library"],
      ["adults", "Adults"],
      ["kids", "Kids"],
      ["family", "Family"],
      ["horror", "Horror"],
      ["action", "Action"],
      ["comedy", "Comedy"],
      ["drama", "Drama"],
    ];
    const buttons = viewGroups.map(([view, label, count]) => {
      const button = documentRef.createElement("button");
      button.type = "button";
      button.className = "category-chip library-view-chip";
      button.textContent = `${label}${count ? ` ${count}` : ""}`;
      button.setAttribute("aria-pressed", activeLibraryView === view ? "true" : "false");
      if (activeLibraryView === view) {
        button.classList.add("active");
      }
      button.addEventListener("click", () => {
        activeLibraryView = view;
        activeFolder = "all";
        renderLibrary();
      });
      return button;
    });
    buttons.push(...categoryGroups.map(([category, label]) => {
      const button = documentRef.createElement("button");
      button.type = "button";
      button.className = "category-chip";
      const count = allMovies.filter((movie) => (
        category.startsWith("alpha-")
          ? movieAlphaCategory(movie) === category
          : movieInAudience(movie, category)
      )).length;
      button.textContent = `${label}${count ? ` ${count}` : ""}`;
      button.setAttribute("aria-pressed", activeCategory === category ? "true" : "false");
      if (activeCategory === category) {
        button.classList.add("active");
      }
      button.addEventListener("click", () => {
        activeCategory = category;
        renderLibrary();
      });
      return button;
    }));
    categoryShelf.replaceChildren(...buttons);
      const folderPanel = folderShelf && folderShelf.parentElement;
    if (folderPanel) {
      folderPanel.hidden = activeLibraryView !== "collections";
    }
  }

  function installHoverPreview(card, poster, movie, ready) {
    if (!ready || !card || !poster || !hasMethod(card, "addEventListener") || !hasMethod(poster, "append")) return;
    const documentRef = poster.ownerDocument || card.ownerDocument;
    if (!documentRef || !hasMethod(documentRef, "createElement")) return;
    const previewStartSeconds = 180;
    const previewDurationMs = 40000;
    let hoverTimer = null;
    let stopTimer = null;
    let preview = null;
    let hoverRun = 0;

    function clearPreview() {
      if (stopTimer !== null) clearTimeoutImpl(stopTimer);
      stopTimer = null;
      const video = preview;
      preview = null;
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
        video.remove();
      }
      card.classList.remove("previewing", "preview-loading", "preview-paused");
      if (activePreviewCancel === cancelPreview) activePreviewCancel = null;
    }

    function cancelPreview() {
      hoverRun += 1;
      if (hoverTimer !== null) clearTimeoutImpl(hoverTimer);
      hoverTimer = null;
      clearPreview();
    }

    async function startPreview(runId) {
      card.classList.add("preview-loading");
      // Keep the cover visible throughout fetching, buffering, and unsupported formats.
      stopTimer = setTimeoutImpl(cancelPreview, 12000);
      try {
        const playback = await requestPlaybackLink(movie.id, "Unable to preview this movie.");
        if (runId !== hoverRun || card.isConnected === false) return;
        if (!playback || !playback.url) { cancelPreview(); return; }
        preview = documentRef.createElement("video");
        const video = preview;
        preview.className = "poster-preview-video";
        preview.muted = true;
        preview.defaultMuted = true;
        preview.playsInline = true;
        // Skip the opening credits when the source is long enough, then keep
        // the focused title's 40-second preview alive until hover/focus ends.
        preview.preload = "auto";
        preview.setAttribute("aria-hidden", "true");
        preview.setAttribute("playsinline", "");
        let started = false;
        video.addEventListener("loadedmetadata", () => {
          if (preview !== video) return;
          const duration = Number(video.duration) || 0;
          if (duration > previewStartSeconds + (previewDurationMs / 1000)) {
            try { video.currentTime = previewStartSeconds; } catch { /* start at the nearest available frame */ }
          } else {
            try { video.currentTime = Math.max(0, duration - (previewDurationMs / 1000)); } catch { /* keep the browser's current frame */ }
          }
        }, { once: true });
        video.addEventListener("playing", () => {
          if (preview !== video || started) return;
          started = true;
          card.classList.remove("preview-loading");
          card.classList.add("previewing");
          if (stopTimer !== null) clearTimeoutImpl(stopTimer);
          stopTimer = setTimeoutImpl(() => {
            if (preview !== video) return;
            video.pause();
            stopTimer = null;
            // Keep the paused video in the poster so the selected preview frame
            // remains visible instead of snapping back to the cover art.
            card.classList.add("previewing", "preview-paused");
          }, previewDurationMs);
        });
        video.addEventListener("error", () => { if (preview === video) cancelPreview(); });
        video.addEventListener("ended", () => { if (preview === video) cancelPreview(); });
        video.src = new URL(playback.url, locationOrigin).toString();
        poster.append(video);
        await video.play();
      } catch {
        if (runId === hoverRun) cancelPreview();
      }
    }

    function schedulePreview() {
      if ((windowRef && hasMethod(windowRef, "matchMedia") && windowRef.matchMedia("(prefers-reduced-motion: reduce)").matches)
        || (navigatorRef && navigatorRef.connection && navigatorRef.connection.saveData)) return;
      if (activePreviewCancel) activePreviewCancel();
      activePreviewCancel = cancelPreview;
      const runId = ++hoverRun;
      hoverTimer = setTimeoutImpl(() => {
        hoverTimer = null;
        void startPreview(runId);
      }, 650);
    }

    card.addEventListener("mouseenter", schedulePreview);
    card.addEventListener("mouseleave", cancelPreview);
    card.addEventListener("focus", schedulePreview);
    card.addEventListener("blur", cancelPreview);
    card.addEventListener("click", cancelPreview);
  }

  function renderMovieGrid() {
    if (!movieGrid || typeof movieGrid.replaceChildren !== "function") {
      return;
    }

    const documentRef = movieGrid.ownerDocument;
    const filteredMovies = allMovies.filter((movie) => !isSampleMovie(movie)).filter(movieMatchesFilter);

    if (!filteredMovies.length) {
      const emptyState = documentRef.createElement("p");
      emptyState.className = "empty-state";
      emptyState.textContent = "No matching files here yet.";
      movieGrid.replaceChildren(emptyState);
      return;
    }

    function createMovieCard(movie) {
      const button = documentRef.createElement("button");
      const ready = isMoviePlayable(movie);
      button.type = "button";
      button.className = ready ? "movie-card" : "movie-card unavailable";
      button.disabled = !ready;
      button.dataset.movieId = movie.id;
      bindFeaturedSelection(button, movie);
      button.addEventListener("focus", () => {
        if (hasMethod(button, "scrollIntoView")) {
          button.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
        }
      });

      const poster = documentRef.createElement("span");
      poster.className = "poster";
      const fallback = documentRef.createElement("span");
      fallback.className = "poster-fallback";
      const initials = documentRef.createElement("strong");
      initials.textContent = movieInitials(movie);
      const fallbackTitle = documentRef.createElement("span");
      fallbackTitle.textContent = movie.title || movie.fileName || "Movie";
      fallback.append(initials, fallbackTitle);
      poster.append(fallback);
      appendPosterImage(poster, movie);
      installHoverPreview(button, poster, movie, ready);

      const title = documentRef.createElement("span");
      title.className = "movie-title";
      title.textContent = movie.title || movie.fileName || "Untitled movie";

      const meta = documentRef.createElement("span");
      meta.className = "movie-meta";
      meta.textContent = [movie.year, movie.runtime, Array.isArray(movie.genres) ? movie.genres.slice(0, 2).join(", ") : "", metadataSourceLabel(movie), movieAvailabilityLabel(movie)].filter(Boolean).join(" • ");

      const badge = documentRef.createElement("span");
      badge.className = ready ? "ready-badge" : "upload-badge";
      badge.textContent = ready ? "Ready" : "Still uploading";

      const info = documentRef.createElement("span");
      info.className = "movie-info";
      info.append(title, meta, badge);

      button.append(poster, info);
      button.addEventListener("click", () => {
        if (!ready) {
          return;
        }

        moveToMovie(movie);
      });

      return button;
    }

    function seriesGroupForMovies(movies) {
      const groups = new Map();
      for (const movie of movies) {
        if (movie.contentType !== "episode" && !movie.seriesName) continue;
        const seriesPath = movie.seriesPath || String(movie.folder || "").replace(/\/+(?:Season\s*\d+|S\d+)$/i, "");
        const seriesName = movie.seriesName || seriesPath.split("/").filter(Boolean).pop() || "TV series";
        if (!seriesPath) continue;
        const moviePosterUrl = String(movie.posterUrl || "");
        const titlePosterUrl = remoteArtworkUrl({ title: seriesName });
        const seriesPosterUrl = moviePosterUrl && !moviePosterUrl.startsWith("/api/artwork")
          ? moviePosterUrl
          : titlePosterUrl;
        const key = seriesPath.toLowerCase();
        if (!groups.has(key)) {
          groups.set(key, {
            title: seriesName,
            seriesPath,
            posterUrl: seriesPosterUrl,
            posterFallbackUrl: titlePosterUrl,
            episodes: [],
            seasons: new Set(),
          });
        }
        const group = groups.get(key);
        if (!group.posterUrl && seriesPosterUrl) group.posterUrl = seriesPosterUrl;
        group.episodes.push(movie);
        group.seasons.add(Number(movie.seasonNumber) || movie.seasonName || "Season");
      }
      return [...groups.values()].sort((left, right) => left.title.localeCompare(right.title));
    }

    function addCollectionPreview(container, members) {
      const previewMovies = (Array.isArray(members) ? members : []).filter((movie) => movie && movie.posterUrl).slice(0, 4);
      if (!previewMovies.length) return;
      const strip = documentRef.createElement("span");
      strip.className = "collection-preview-strip";
      for (const movie of previewMovies) {
        const image = documentRef.createElement("img");
        image.alt = "";
        image.loading = "lazy";
        image.decoding = "async";
        attachArtworkImage(image, movie.posterUrl, () => image.remove(), movie.posterFallbackUrl);
        strip.append(image);
      }
      container.append(strip);
    }

    function createSeriesCard(series) {
      const button = documentRef.createElement("button");
      button.type = "button";
      button.className = "movie-card series-card";
      button.dataset.seriesPath = series.seriesPath;
      const poster = documentRef.createElement("span");
      poster.className = "poster";
      const fallback = documentRef.createElement("span");
      fallback.className = "poster-fallback";
      const initials = documentRef.createElement("strong");
      initials.textContent = movieInitials({ title: series.title });
      const fallbackTitle = documentRef.createElement("span");
      fallbackTitle.textContent = series.title;
      fallback.append(initials, fallbackTitle);
      poster.append(fallback);
      appendPosterImage(poster, { ...series, fileName: series.title }, `${series.title} series cover`);
      addCollectionPreview(poster, series.episodes);
      const info = documentRef.createElement("span");
      info.className = "movie-info";
      const title = documentRef.createElement("span");
      title.className = "movie-title";
      title.textContent = series.title;
      const meta = documentRef.createElement("span");
      meta.className = "movie-meta";
      meta.textContent = `${series.seasons.size} season${series.seasons.size === 1 ? "" : "s"} • ${series.episodes.length} episode${series.episodes.length === 1 ? "" : "s"}`;
      const badge = documentRef.createElement("span");
      badge.className = "ready-badge";
      badge.textContent = "Open series";
      info.append(title, meta, badge);
      button.append(poster, info);
      const openSeries = () => {
        activeLibraryView = "movies";
        activeFolder = series.seriesPath;
        renderLibrary();
        if (movieGrid && typeof movieGrid.scrollIntoView === "function") {
          movieGrid.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      };
      button.addEventListener("click", openSeries);
      bindFeaturedSelection(button, series, series.episodes.find(isMoviePlayable), {
        playAction: openSeries,
        detailsAction: openSeries,
      });
      return button;
    }

    function collectionGroupsForMovies(movies) {
      if (activeFolder !== "all") {
        return [];
      }

      const collectionFolders = filterMovieFolders(buildFoldersFromMovies(allMovies, allFolders))
        .filter((folder) => isCollectionFolder(folder.path));
      return collectionFolders.map((folder) => {
        const members = movies.filter((movie) => (
          movie.folder === folder.path || movie.folder.startsWith(`${folder.path}/`)
        ));
        if (!members.length) return null;
        const title = folder.name || folder.path.split("/").pop() || "Collection";
        const memberWithRealPoster = members.find((movie) => (
          movie.posterUrl && !String(movie.posterUrl).startsWith("/api/artwork")
        ));
        const titlePosterUrl = remoteArtworkUrl({ title });
        return {
          title,
          collectionPath: folder.path,
          posterUrl: (memberWithRealPoster ? memberWithRealPoster.posterUrl : "") || titlePosterUrl,
          posterFallbackUrl: titlePosterUrl,
          movies: members,
        };
      }).filter(Boolean);
    }

    function createCollectionCard(collection) {
      const button = documentRef.createElement("button");
      button.type = "button";
      button.className = "movie-card collection-card";
      button.dataset.collectionPath = collection.collectionPath;
      const poster = documentRef.createElement("span");
      poster.className = "poster";
      const fallback = documentRef.createElement("span");
      fallback.className = "poster-fallback";
      const initials = documentRef.createElement("strong");
      initials.textContent = movieInitials({ title: collection.title });
      const fallbackTitle = documentRef.createElement("span");
      fallbackTitle.textContent = collection.title;
      fallback.append(initials, fallbackTitle);
      poster.append(fallback);
      appendPosterImage(poster, { ...collection, fileName: collection.title }, `${collection.title} collection cover`);
      addCollectionPreview(poster, collection.movies);
      const info = documentRef.createElement("span");
      info.className = "movie-info";
      const title = documentRef.createElement("span");
      title.className = "movie-title";
      title.textContent = collection.title;
      const meta = documentRef.createElement("span");
      meta.className = "movie-meta";
      meta.textContent = `${collection.movies.length} movie${collection.movies.length === 1 ? "" : "s"}`;
      const badge = documentRef.createElement("span");
      badge.className = "ready-badge";
      badge.textContent = "Open collection";
      info.append(title, meta, badge);
      button.append(poster, info);
      const openCollection = () => {
        activeLibraryView = "movies";
        activeFolder = collection.collectionPath;
        renderLibrary();
        if (movieGrid && typeof movieGrid.scrollIntoView === "function") {
          movieGrid.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      };
      button.addEventListener("click", openCollection);
      bindFeaturedSelection(button, collection, collection.movies.find(isMoviePlayable), {
        playAction: openCollection,
        detailsAction: openCollection,
      });
      return button;
    }

    if (activeLibraryView === "genres") {
      const groups = new Map();
      for (const movie of filteredMovies) {
        const genres = genresForMovie(movie);
        for (const genre of genres) {
          const label = String(genre || "Uncategorized").trim() || "Uncategorized";
          if (!groups.has(label)) groups.set(label, []);
          groups.get(label).push(movie);
        }
      }
      const sections = [...groups.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([genre, movies]) => {
          const section = documentRef.createElement("section");
          section.className = "genre-group";
          const heading = documentRef.createElement("h3");
          heading.textContent = genre;
          const grid = documentRef.createElement("div");
          grid.className = "genre-group-grid";
          grid.append(...movies.sort((left, right) => String(left.title || "").localeCompare(String(right.title || ""))).map(createMovieCard));
          section.append(heading, grid);
          return section;
        });
      movieGrid.replaceChildren(...sections);
      return;
    }

    const seriesGroups = seriesGroupForMovies(filteredMovies);
    const episodeIds = new Set(seriesGroups.flatMap((series) => series.episodes.map((movie) => movie.id)));
    const collectionGroups = collectionGroupsForMovies(filteredMovies);
    const collectionMovieIds = new Set(collectionGroups.flatMap((collection) => collection.movies.map((movie) => movie.id)));
    const seriesDetail = activeFolder !== "all" && seriesGroups.some((series) => series.seriesPath === activeFolder);
    const standaloneMovies = seriesDetail
      ? filteredMovies
      : filteredMovies.filter((movie) => (
      !episodeIds.has(movie.id) && !collectionMovieIds.has(movie.id)
    ));
    const cards = activeLibraryView === "collections"
      ? [
        ...seriesGroups.map(createSeriesCard),
        ...collectionGroups.map(createCollectionCard),
      ]
      : activeLibraryView === "movies" && activeFolder === "all"
        ? [
          ...seriesGroups.map(createSeriesCard),
          ...collectionGroups.map(createCollectionCard),
          ...standaloneMovies.map(createMovieCard),
        ]
      : standaloneMovies.map(createMovieCard);

    if (!cards.length) {
      const emptyState = documentRef.createElement("p");
      emptyState.className = "empty-state";
      emptyState.textContent = activeLibraryView === "collections"
        ? "No collections or series have been organized yet."
        : "No matching movies here yet.";
      movieGrid.replaceChildren(emptyState);
      return;
    }
    movieGrid.replaceChildren(...cards);
  }

  function viewerRecord(movieId) {
    return viewerState && viewerState.movies && viewerState.movies[movieId]
      ? viewerState.movies[movieId]
      : null;
  }

  function progressPercent(record) {
    if (!record || !Number.isFinite(record.durationSeconds) || record.durationSeconds <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(100, (Number(record.positionSeconds) || 0) / record.durationSeconds * 100));
  }

  function remainingLabel(record) {
    if (!record || !Number.isFinite(record.durationSeconds) || record.durationSeconds <= 0) {
      return "Resume movie";
    }
    const remaining = Math.max(0, Math.round(record.durationSeconds - (Number(record.positionSeconds) || 0)));
    const hours = Math.floor(remaining / 3600);
    const minutes = Math.floor((remaining % 3600) / 60);
    return hours ? `${hours}h ${minutes}m remaining` : `${minutes} min remaining`;
  }

  function openMovieDetails(movie) {
    if (!movie) {
      return;
    }
    detailsMovie = movie;
    if (detailsPoster) {
      detailsPoster.src = movie.posterUrl || "/movie-room-hero.png";
      detailsPoster.alt = posterAltText(movie);
    }
    if (detailsTitle) {
      detailsTitle.textContent = movie.title || movie.fileName || "Movie details";
    }
    if (detailsMeta) {
      detailsMeta.textContent = [movie.year, movie.rating, movie.runtime].filter(Boolean).join(" • ") || movieFolderLabel(movie);
    }
    if (detailsDescription) {
      detailsDescription.textContent = movie.description || `Watch ${movie.title || movie.fileName || "this movie"} in your private Movie Room.`;
    }
    if (detailsStatus) {
      detailsStatus.textContent = "";
    }
    if (detailsFavorite) {
      const record = viewerRecord(movie.id);
      detailsFavorite.textContent = record && record.favorite ? "★ Remove Favorite" : "☆ Add Favorite";
    }
    if (movieDetailsDialog && typeof movieDetailsDialog.showModal === "function") {
      movieDetailsDialog.showModal();
    } else if (movieDetailsDialog) {
      movieDetailsDialog.setAttribute("open", "");
    }
  }

  function createShelfCard(movie, shelf, shelfType = "recent") {
    const documentRef = shelf.ownerDocument;
    const card = documentRef.createElement("button");
    const ready = isMoviePlayable(movie);
    card.type = "button";
    card.className = ready ? "movie-card" : "movie-card unavailable";
    card.disabled = !ready;
    card.dataset.movieId = movie.id;
    bindFeaturedSelection(card, movie);
    const poster = documentRef.createElement("span");
    poster.className = "poster";
    const fallback = documentRef.createElement("span");
    fallback.className = "poster-fallback";
    const initials = documentRef.createElement("strong");
    initials.textContent = movieInitials(movie);
    const fallbackTitle = documentRef.createElement("span");
    fallbackTitle.textContent = movie.title || movie.fileName || "Movie";
    fallback.append(initials, fallbackTitle);
    poster.append(fallback);
    appendPosterImage(poster, movie);
    installHoverPreview(card, poster, movie, ready);
    const info = documentRef.createElement("span");
    info.className = "movie-info";
    const title = documentRef.createElement("span");
    title.className = "movie-title";
    title.textContent = movie.title || movie.fileName || "Untitled movie";
    const meta = documentRef.createElement("span");
    meta.className = "movie-meta";
    meta.textContent = shelfType === "continue"
      ? remainingLabel(viewerRecord(movie.id))
      : [movie.year, movie.runtime, metadataSourceLabel(movie)].filter(Boolean).join(" • ");
    info.append(title, meta);
    const record = viewerRecord(movie.id);
    if (shelfType === "continue" && record) {
      const track = documentRef.createElement("span");
      track.className = "progress-track";
      const fill = documentRef.createElement("span");
      fill.style.width = `${progressPercent(record)}%`;
      track.append(fill);
      info.append(track);
    }
    card.append(poster, info);
    card.addEventListener("click", () => {
      movieSelect.value = movie.id;
      moveToMovie(movie);
    });
    return card;
  }

  function renderShelf(shelf, movies, emptyText) {
    if (!shelf || typeof shelf.replaceChildren !== "function") {
      return;
    }
    if (!movies.length) {
      const empty = shelf.ownerDocument.createElement("p");
      empty.className = "empty-state";
      empty.textContent = emptyText;
      shelf.replaceChildren(empty);
      return;
    }
    const shelfType = shelf === continueWatchingShelf ? "continue" : "recent";
    shelf.replaceChildren(...movies.map((movie) => createShelfCard(movie, shelf, shelfType)));
  }

  function stopHeroPreview() {
    heroPreviewVersion += 1;
    for (const previewVideo of [heroPreviewVideo, libraryBackgroundPreview]) {
      if (!previewVideo) continue;
      previewVideo.pause();
      previewVideo.removeAttribute("src");
      previewVideo.load();
      previewVideo.hidden = true;
    }
    if (heroMovie && heroMovie.classList) heroMovie.classList.remove("hero-video-active");
    if (libraryPanel && libraryPanel.classList) libraryPanel.classList.remove("hero-focus-mode");
  }

  function setFeaturedMovie(movie, previewMovie = movie, { playAction = null, detailsAction = null } = {}) {
    if (!movie) return false;
    stopHeroPreview();
    if (heroMovie) {
      heroMovie.hidden = false;
      if (heroMovie.classList) heroMovie.classList.add("hero-preview-active");
    }
    if (libraryPanel && libraryPanel.classList) libraryPanel.classList.add("hero-focus-mode");
    const backdropSource = movie.backdropUrl || movie.posterUrl || previewMovie && (previewMovie.backdropUrl || previewMovie.posterUrl) || "/movie-room-hero.png";
    if (heroBackdrop) {
      heroBackdrop.src = backdropSource;
      heroBackdrop.alt = `${movie.title || movie.fileName || "Featured movie"} backdrop`;
    }
    if (heroTitle) heroTitle.textContent = movie.title || movie.fileName || "Featured movie";
    if (heroMeta) heroMeta.textContent = [movie.year, movie.rating, movie.runtime, metadataSourceLabel(movie)].filter(Boolean).join(" • ");
    if (heroDescription) heroDescription.textContent = movie.description || `Watch ${movie.title || movie.fileName || "this title"} in your Taylor-Made movie room.`;
    if (heroPlay) heroPlay.onclick = playAction || (() => moveToMovie(movie));
    if (heroDetails) heroDetails.onclick = detailsAction || (() => openMovieDetails(movie));
    if (documentRef && documentRef.body && backdropSource) {
      const safeBackdropUrl = String(backdropSource).replaceAll('"', "%22");
      documentRef.body.style.setProperty("--page-backdrop", `url("${safeBackdropUrl}")`);
    }
    if (previewMovie && isMoviePlayable(previewMovie)) {
      void startHeroPreview(previewMovie);
    }
    return true;
  }

  function bindFeaturedSelection(card, movie, previewMovie = movie, actions = {}) {
    if (!card || !hasMethod(card, "addEventListener")) return;
    const updateFeaturedMovie = () => setFeaturedMovie(movie, previewMovie, actions);
    card.addEventListener("focus", updateFeaturedMovie);
    card.addEventListener("mouseenter", updateFeaturedMovie);
  }

  async function startHeroPreview(movie) {
    const previewVideo = libraryBackgroundPreview || heroPreviewVideo;
    if (!previewVideo || !movie || !isMoviePlayable(movie)) return;
    if ((windowRef && hasMethod(windowRef, "matchMedia") && windowRef.matchMedia("(prefers-reduced-motion: reduce)").matches)
      || (navigatorRef && navigatorRef.connection && navigatorRef.connection.saveData)) return;
    const version = heroPreviewVersion;
    try {
      const playback = await requestPlaybackLink(movie.id, "Unable to load the featured preview.");
      if (version !== heroPreviewVersion || !playback || !playback.url) return;
      previewVideo.muted = true;
      previewVideo.defaultMuted = true;
      previewVideo.playsInline = true;
      previewVideo.loop = true;
      previewVideo.preload = "metadata";
      previewVideo.setAttribute("aria-hidden", "true");
      previewVideo.setAttribute("playsinline", "");
      previewVideo.src = new URL(playback.url, locationOrigin).toString();
      previewVideo.hidden = false;
      if (heroMovie && heroMovie.classList) heroMovie.classList.add("hero-video-active");
      const playPromise = previewVideo.play();
      if (playPromise && hasMethod(playPromise, "catch")) await playPromise.catch(() => {});
    } catch {
      if (version === heroPreviewVersion) stopHeroPreview();
    }
  }

  function renderDiscovery() {
    stopHeroPreview();
    const playable = allMovies.filter(isMoviePlayable);
    const continueMovies = playable
      .filter((movie) => {
        const record = viewerRecord(movie.id);
        return record && record.positionSeconds > 0 && !record.completedAt;
      })
      .sort((left, right) => (viewerRecord(right.id).lastWatchedAt || 0) - (viewerRecord(left.id).lastWatchedAt || 0));
    const browseable = playable.filter((movie) => movie.contentType !== "episode" && !movie.seriesName);
    const recentMovies = [...browseable].sort((left, right) => movieAddedTimestamp(right) - movieAddedTimestamp(left));
    const profile = viewerProfiles[activeProfile] || viewerProfiles.home;
    const profilePicks = browseable.filter(profile.pick);
    const picks = [...profilePicks, ...browseable.filter((movie) => !profilePicks.includes(movie))].slice(0, 12);
    renderShelf(continueWatchingShelf, continueMovies, "Start a movie and your progress will appear here.");
    renderShelf(recentlyAddedShelf, recentMovies, "Newly uploaded movies will appear here.");
    renderShelf(picksShelf, picks, "Your library is ready for its first pick.");
    if (continueSummary) {
      continueSummary.textContent = continueMovies.length ? `${continueMovies.length} in progress` : "Nothing started yet";
    }

    // The hero is a "recently added" shelf, not a theatrical-status shelf.
    // Jellyfin's DateCreated is carried through as dateAdded by the provider;
    // premiere/year are only fallbacks when a library item has no created date.
    heroMovies = recentMovies.slice(0, 5);
    if (heroMovies.length && !heroSelectionInitialized) {
      heroIndex = Math.floor(Math.random() * heroMovies.length);
      heroSelectionInitialized = true;
    }
    heroIndex = Math.min(heroIndex, Math.max(0, heroMovies.length - 1));
    const featured = heroMovies[heroIndex] || browseable[0] || playable[0];
    if (featured) {
      setFeaturedMovie(featured);
      if (heroIndicator) heroIndicator.textContent = `${heroIndex + 1} / ${Math.max(1, heroMovies.length)}`;
    }
    if (upNextPanel) {
      const next = (viewerState.queue || []).map((id) => playable.find((movie) => movie.id === id)).find(Boolean);
      upNextPanel.hidden = !next;
      if (next && upNextTitle) upNextTitle.textContent = next.title || next.fileName || "Next movie";
      if (next && upNextPlay) upNextPlay.onclick = () => moveToMovie(next);
    }
  }

  function focusInitialTitle() {
    const titleRails = [continueWatchingShelf, recentlyAddedShelf, picksShelf, movieGrid];
    let firstTitle = null;
    for (const rail of titleRails) {
      if (!rail || rail.hidden || !hasMethod(rail, "querySelector")) continue;
      firstTitle = rail.querySelector("button.movie-card:not([disabled])");
      if (firstTitle) break;
    }
    if (!firstTitle) return false;
    if (windowRef && hasMethod(windowRef, "scrollTo")) windowRef.scrollTo(0, 0);
    rememberRemoteTarget(firstTitle);
    if (hasMethod(firstTitle, "focus")) firstTitle.focus();
    rememberRemoteTarget(firstTitle);
    if (hasMethod(firstTitle, "scrollIntoView")) {
      firstTitle.scrollIntoView({ behavior: "auto", block: "start", inline: "start" });
    }
    return true;
  }

  function renderLibrary() {
    if (activePreviewCancel) activePreviewCancel();
    updateLibrarySummary(allMovies);
    renderCategoryShelf();
    renderFolderShelf();
    renderMovieGrid();
    renderDiscovery();
    setActivePage(activePage);
  }

  function setPlayerMode(mode) {
    const allowed = new Set(["normal", "theater", "miniplayer"]);
    playerMode = allowed.has(mode) ? mode : "normal";
    if (libraryPanel && libraryPanel.classList) {
      libraryPanel.classList.toggle("theater-mode", playerMode === "theater");
      libraryPanel.classList.toggle("miniplayer-mode", playerMode === "miniplayer");
    }
    if (theaterModeButton) theaterModeButton.textContent = playerMode === "theater" ? "Exit theater" : "Theater";
    if (miniplayerModeButton) miniplayerModeButton.textContent = playerMode === "miniplayer" ? "Return to player" : "Miniplayer";
    return playerMode;
  }

  function scheduleProgressSave() {
    if (progressTimer !== null) return;
    progressTimer = setTimeoutImpl(() => {
      progressTimer = null;
      savePlaybackProgress("interval").catch(() => {});
    }, 15000);
  }

  async function savePlaybackProgress(reason = "checkpoint") {
    if (!viewerStateClient || !authenticated || !movieSelect.value || !Number.isFinite(player.currentTime)) return null;
    const movieId = movieSelect.value;
    const durationSeconds = Number.isFinite(player.duration) ? Math.max(0, player.duration) : 0;
    if (durationSeconds <= 0) return null;
    const completed = reason === "ended" || player.ended || player.currentTime >= durationSeconds * 0.9;
    const operations = [{ type: "progress", movieId, positionSeconds: player.currentTime, durationSeconds, playbackStatus: completed ? "completed" : player.paused ? "paused" : "playing" }];
    if (completed) operations.push({ type: "setCompleted", movieId, value: true });
    if (progressWriteInFlight) await progressWriteInFlight;
    progressWriteInFlight = viewerStateClient.apply(activeProfile, operations)
      .then((state) => { viewerState = state; renderDiscovery(); return state; })
      .finally(() => { progressWriteInFlight = null; });
    return progressWriteInFlight;
  }

  function restorePlaybackProgress(movieId) {
    if (restoredMovieId === movieId) return;
    const record = viewerRecord(movieId);
    if (!record || !Number.isFinite(record.positionSeconds) || record.positionSeconds <= 0 || !Number.isFinite(player.duration)) return;
    restoredMovieId = movieId;
    try { player.currentTime = Math.min(record.positionSeconds, Math.max(player.duration - 0.1, 0)); } catch { /* browser may reject a seek before metadata */ }
  }

  function playNextFromQueue() {
    const currentId = movieSelect.value;
    const queue = Array.isArray(viewerState.queue) ? viewerState.queue : [];
    const nextId = queue.find((movieId) => movieId !== currentId && allMovies.some((movie) => movie.id === movieId && isMoviePlayable(movie)));
    const next = allMovies.find((movie) => movie.id === nextId) || allMovies.find((movie) => movie.id !== currentId && isMoviePlayable(movie));
    if (!next) return false;
    movieSelect.value = next.id;
    playSelectedMovie({ scrollToPlayer: true }).catch((error) => updateStatus(error.message));
    return true;
  }

  async function handleApiResponse(response, fallbackMessage) {
    if (response.status === 401) {
      clearStallRecovery();
      playbackRequestVersion += 1;
      resumeAfterRefresh = null;
      movieSelect.value = "";
      setAuthenticated(false);
      setPlayerVisibility(false);
      player.removeAttribute("src");
      player.load();
      const sessionError = new Error("Your session expired. Sign in again to keep watching.");
      sessionError.code = "SESSION_EXPIRED";
      throw sessionError;
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

    return response;
  }

  async function requestPlaybackLink(movieId, fallbackMessage = "Unable to start playback.") {
    const response = await handleApiResponse(
      await fetchImpl("/api/playback", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ movieId }),
      }),
      fallbackMessage,
    );
    return response.json();
  }

  async function loadLibrary(selectedMovieId = movieSelect.value, options = {}) {
    const forceRefresh = options.forceRefresh === true;
    const quiet = options.quiet === true;
    if (!quiet) {
      updateStatus("Loading library…");
      movieSelect.disabled = true;
    }

    if (viewerStateClient && continueWatchingShelf) {
      try {
        viewerState = await viewerStateClient.load(activeProfile);
      } catch {
        viewerState = { movies: {}, queue: [], settings: {} };
      }
    }

    let library;
    let usingCachedLibrary = false;
    try {
      const response = await handleApiResponse(
        await fetchImpl(forceRefresh ? "/api/library?refresh=1" : "/api/library", { credentials: "same-origin" }),
        "Unable to load movie library.",
      );
      library = normalizeLibraryPayload(await response.json());
      writeLocalValue(libraryStorageKey, JSON.stringify(library));
    } catch (error) {
      if (error.code === "SESSION_EXPIRED") throw error;
      library = readCachedLibrary();
      if (!library) throw error;
      usingCachedLibrary = true;
    }
    const providerCacheStale = library.cacheStatus === "stale";
    if (providerCacheStale && !forceRefresh) {
      setTimeoutImpl(() => {
        loadLibrary(selectedMovieId, { forceRefresh: true, quiet: true }).catch(() => {});
      }, 0);
    }
    const movies = library.movies;
    allMovies = movies;
    allFolders = library.folders;
    movieSelect.innerHTML = "";
    renderLibrary();

    if (!movies.length) {
      movieSelect.disabled = true;
      setPlayerVisibility(false);
      player.removeAttribute("src");
      player.load();
      updateNowPlaying(null);
      if (!quiet) updateStatus("No movie files found yet. When the files finish showing up in the Downloads folder, they will appear here.");
      return [];
    }

    const playableMovies = movies.filter(isMoviePlayable);

    for (const movie of movies) {
      const option = createOption();
      option.value = movie.id;
      option.textContent = movieLabel(movie);
      option.disabled = !isMoviePlayable(movie);
      movieSelect.appendChild(option);
    }

    if (!playableMovies.length) {
      clearStallRecovery();
      playbackRequestVersion += 1;
      movieSelect.value = "";
      movieSelect.disabled = true;
      setPlayerVisibility(false);
      player.removeAttribute("src");
      player.load();
      updateNowPlaying(null);
      if (!quiet) updateStatus("Movie files are listed, but they are still uploading to OneDrive.");
      return [];
    }

    const playableIds = new Set(playableMovies.map((movie) => movie.id));
    const preferredMovieId = selectedMovieId || storedMovieForProfile();
    movieSelect.value = preferredMovieId && playableIds.has(preferredMovieId)
      ? preferredMovieId
      : playableMovies[0].id;

    movieSelect.disabled = false;
    if (!playerVisible) {
      updateNowPlaying(null);
      if (!quiet) {
        updateStatus(usingCachedLibrary || providerCacheStale
          ? "Showing your saved library while OneDrive checks for new movies."
          : "Library ready. Choose a movie to start streaming.");
      } else if (!providerCacheStale) {
        updateStatus("Library updated. Choose a movie to start streaming.");
      }
    } else {
      updateNowPlaying(selectedMovie());
      if (!quiet) {
        updateStatus(usingCachedLibrary || providerCacheStale
          ? "Showing the saved library while OneDrive checks for new movies."
          : "Library ready.");
      } else if (!providerCacheStale) {
        updateStatus("Library updated.");
      }
    }
    renderLibrary();
    if (!playerVisible && !quiet && activePage === "home") focusInitialTitle();
    return playableMovies;
  }

  async function playSelectedMovie({ isRefresh = false, expectedMovieId = null, resumeState = null, scrollToPlayer = false } = {}) {
    if (activePreviewCancel) activePreviewCancel();
    const movieId = expectedMovieId || movieSelect.value;
    if (!isRefresh) {
      if (movieSelect.value && movieSelect.value !== movieId) {
        await savePlaybackProgress("movie-switch").catch(() => {});
      }
      clearStallRecovery();
      playbackRefreshAttempts = 0;
      resumeAfterRefresh = null;
      stableRefreshPosition = null;
      restoredMovieId = "";
    }

    if (!movieId || (expectedMovieId && movieSelect.value !== expectedMovieId)) {
      updateStatus("Select a movie to start streaming.");
      return false;
    }

    setPlayerVisibility(true, { scroll: scrollToPlayer });

    const requestVersion = ++playbackRequestVersion;
    updateStatus("Requesting a secure playback link…");
    let playback;
    try {
      playback = await requestPlaybackLink(movieId, "Unable to start playback.");
    } catch (error) {
      const superseded = requestVersion !== playbackRequestVersion || movieSelect.value !== movieId;
      if (superseded && (!error || error.code !== "SESSION_EXPIRED")) {
        return false;
      }
      throw error;
    }

    if (requestVersion !== playbackRequestVersion || movieSelect.value !== movieId) {
      return false;
    }

    if (resumeState && resumeState.movieId === movieId) {
      resumeAfterRefresh = resumeState;
      stableRefreshPosition = resumeState.position;
    }
    player.preload = "auto";
    player.autoplay = true;
    player.src = /^https?:\/\//i.test(playback.url)
      ? playback.url
      : new URL(playback.url, locationOrigin).toString();
    player.load();
    rememberMovieForProfile(movieId);
    updateNowPlaying(selectedMovie(), playback);
    updateMediaSession(selectedMovie());
    updateBufferStatus();
    updateStatus("Loading video ahead for smooth playback…");
    return true;
  }

  async function refreshPlaybackLink(finalMessage) {
    clearStallRecovery();
    const movieId = movieSelect.value;

    if (!movieId || playbackRefreshInProgress) {
      return false;
    }

    if (playbackRefreshAttempts >= maxPlaybackRefreshes) {
      resumeAfterRefresh = null;
      updateStatus(finalMessage);
      return false;
    }

    playbackRefreshAttempts += 1;
    playbackRefreshInProgress = true;
    const resumeState = {
      movieId,
      position: Number.isFinite(player.currentTime) ? player.currentTime : 0,
      shouldPlay: !player.paused && !player.ended,
    };
    updateStatus("Refreshing the secure stream and keeping your place…");

    try {
      const refreshed = await playSelectedMovie({
        isRefresh: true,
        expectedMovieId: movieId,
        resumeState,
      });
      if (!refreshed && resumeAfterRefresh && resumeAfterRefresh.movieId === movieId) {
        resumeAfterRefresh = null;
      }
      return refreshed;
    } catch (error) {
      resumeAfterRefresh = null;
      updateStatus(error.message);
      return false;
    } finally {
      playbackRefreshInProgress = false;
    }
  }

  function scheduleStallRecovery(message) {
    updateStatus(statusWithBuffer(message));

    if (
      isSeeking
      || stallRecoveryTimer !== null
      || playbackRefreshInProgress
      || !movieSelect.value
      || player.paused
      || player.ended
    ) {
      return;
    }

    const movieId = movieSelect.value;
    const position = Number.isFinite(player.currentTime) ? player.currentTime : 0;
    const sourceVersion = playbackRequestVersion;
    stallPosition = position;
    stallRecoveryTimer = setTimeoutImpl(() => {
      stallRecoveryTimer = null;
      stallPosition = null;

      if (
        playbackRequestVersion !== sourceVersion
        || movieSelect.value !== movieId
        || player.paused
        || player.ended
        || (Number.isFinite(player.currentTime) && player.currentTime > position + 0.5)
        || bufferedSecondsAhead() >= 2
      ) {
        return;
      }

      void refreshPlaybackLink("The stream could not keep a stable connection. Reload the movie to try again.");
    }, stallRecoveryMs);
  }

  async function loadSession() {
    const requestVersion = authTransitionVersion;
    const response = await fetchImpl("/api/session", { credentials: "same-origin" });
    if (requestVersion !== authTransitionVersion) {
      return authenticated;
    }
    if (response.status === 401) {
      setAuthUnavailable(false);
      setAuthenticated(false);
      updateStatus("Sign in to browse the movie library.");
      return false;
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const message = (payload && payload.error) || "Unable to verify the current session.";
      if (response.status === 503) {
        setAuthUnavailable(true);
        updateLoginStatus(message);
      }
      setAuthenticated(false);
      updateStatus(message);
      return false;
    }

    const session = await response.json();
    if (requestVersion !== authTransitionVersion) {
      return authenticated;
    }
    publicAccess = Boolean(session.publicAccess);
    if (publicAccess) {
      setAuthenticated(true);
      return true;
    }
    setAuthUnavailable(false);
    if (session.authConfigured === false) {
      setAuthenticated(false);
      updateLoginStatus("Authentication is not configured yet.");
      updateStatus("Authentication is not configured yet.");
      setAuthUnavailable(true);
      return false;
    }
    setAuthenticated(session.authenticated);
    if (!session.authenticated) {
      updateStatus("Sign in to browse the movie library.");
      return false;
    }

    return true;
  }

  async function handleLogin(event) {
    event.preventDefault();
    authTransitionVersion += 1;
    updateLoginStatus("Signing in…");

    const response = await fetchImpl("/api/login", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: passwordInput.value }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      if (response.status === 503) {
        setAuthUnavailable(true);
      }
      announceLoginError((payload && payload.error) || "Unable to sign in.");
      setAuthenticated(false);
      passwordInput.select();
      return;
    }

    passwordInput.value = "";
    updateLoginStatus("");
    setPasswordErrorState(false);
    setAuthUnavailable(false);
    setAuthenticated(true);
    let movies;
    try {
      movies = await loadLibrary();
    } catch (error) {
      if (authPanel.hidden) {
        setAuthenticated(false);
      }
      throw error;
    }
    await approvePendingFireTvPairing().catch((error) => updateFireTvPairingStatus(error.message));
    if (!movies.length) {
      return;
    }

  }

  async function handleLogout() {
    authTransitionVersion += 1;
    const response = await fetchImpl("/api/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
      },
      body: "{}",
    });

    await handleApiResponse(response, "Unable to sign out.");

    clearStallRecovery();
    playbackRequestVersion += 1;
    resumeAfterRefresh = null;
    setAuthenticated(false);
    setPlayerVisibility(false);
    movieSelect.innerHTML = "";
    movieSelect.value = "";
    movieSelect.disabled = true;
    allMovies = [];
    allFolders = [];
    activeFolder = "all";
    activeCategory = "all";
    searchTerm = "";
    searchOverlayGenre = "all";
    setSearchOverlayVisible(false);
    if (searchInput) {
      searchInput.value = "";
    }
    renderLibrary();
    await releaseWakeLock();
    updatePlaybackState("none");
    player.removeAttribute("src");
    player.load();
    updateNowPlaying(null);
    updateStatus("Signed out.");
  }

  function updateFireTvPairingStatus(message) {
    if (fireTvPairingStatus) {
      fireTvPairingStatus.textContent = message;
    }
  }

  function normalizeFireTvCode(value) {
    return String(value || "").replace(/[^a-z0-9]/gi, "").toUpperCase();
  }

  function readFireTvCodeFromUrl() {
    if (!windowRef || !windowRef.location || !windowRef.location.href) {
      return "";
    }
    try {
      return normalizeFireTvCode(new URL(windowRef.location.href).searchParams.get("firetv_code"));
    } catch {
      return "";
    }
  }

  function clearFireTvCodeFromUrl() {
    if (!windowRef || !windowRef.location || !windowRef.history || !hasMethod(windowRef.history, "replaceState")) {
      return;
    }
    try {
      const cleanUrl = new URL(windowRef.location.href);
      cleanUrl.searchParams.delete("firetv_code");
      windowRef.history.replaceState({}, "", cleanUrl.toString());
    } catch {
      return;
    }
  }

  async function approveFireTvPairing(event) {
    event.preventDefault();
    const code = normalizeFireTvCode(fireTvCodeInput ? fireTvCodeInput.value : "");
    if (!code) {
      updateFireTvPairingStatus("Enter the code shown on your Fire TV.");
      return false;
    }

    updateFireTvPairingStatus("Approving Fire TV...");
    const response = await handleApiResponse(
      await fetchImpl("/api/tv/pairings/approve", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code }),
      }),
      "Unable to approve this Fire TV.",
    );
    const approved = await response.json();
    const label = approved.deviceLabel || "Fire TV";
    updateFireTvPairingStatus(`${label} is approved. Open the Fire TV app to continue.`);
    if (fireTvCodeInput) {
      fireTvCodeInput.value = "";
    }
    return true;
  }

  async function approvePendingFireTvPairing() {
    if (!pendingFireTvCode || !fireTvCodeInput || !fireTvPairingForm) {
      return false;
    }

    fireTvPairingForm.hidden = false;
    fireTvCodeInput.value = pendingFireTvCode;
    const approved = await approveFireTvPairing({ preventDefault() {} });
    if (approved) {
      pendingFireTvCode = "";
      clearFireTvCodeFromUrl();
    }
    return approved;
  }

  function initialize() {
    if (navigatorRef && navigatorRef.serviceWorker && typeof navigatorRef.serviceWorker.register === "function") {
      const protocol = windowRef && windowRef.location ? windowRef.location.protocol : "";
      if (protocol === "https:" || protocol === "http:") {
        navigatorRef.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
      }
    }
    if (documentRef && typeof documentRef.querySelectorAll === "function") {
      for (const button of documentRef.querySelectorAll("[data-page]")) {
        button.addEventListener("click", () => {
          const page = button.dataset ? button.dataset.page : "home";
          setActivePage(page);
        });
      }
    }
    if (closePlayerPage) {
      closePlayerPage.addEventListener("click", () => {
        savePlaybackProgress("pause").catch(() => {});
        if (hasMethod(player, "pause")) player.pause();
        setPlayerVisibility(false);
        setActivePage(activePage === "user" ? "home" : activePage);
      });
    }
    if (detailsClose && movieDetailsDialog) {
      detailsClose.addEventListener("click", () => {
        if (typeof movieDetailsDialog.close === "function") movieDetailsDialog.close();
        else movieDetailsDialog.removeAttribute("open");
      });
    }
    if (detailsPlay) {
      detailsPlay.addEventListener("click", () => {
        if (!detailsMovie) return;
        if (movieDetailsDialog && typeof movieDetailsDialog.close === "function") movieDetailsDialog.close();
        moveToMovie(detailsMovie);
      });
    }
    if (detailsWatchLater) {
      detailsWatchLater.addEventListener("click", async () => {
        if (!detailsMovie || !viewerStateClient) return;
        try {
          viewerState = await viewerStateClient.apply(activeProfile, [{ type: "setFlag", movieId: detailsMovie.id, flag: "watchLater", value: true }]);
          detailsStatus.textContent = "Added to Watch Later.";
          renderDiscovery();
        } catch (error) { detailsStatus.textContent = error.message; }
      });
    }
    if (detailsQueue) {
      detailsQueue.addEventListener("click", async () => {
        if (!detailsMovie || !viewerStateClient) return;
        try {
          viewerState = await viewerStateClient.apply(activeProfile, [{ type: "queueAdd", movieId: detailsMovie.id }]);
          detailsStatus.textContent = "Added to your queue.";
        } catch (error) { detailsStatus.textContent = error.message; }
      });
    }
    if (movieDetailsDialog) {
      movieDetailsDialog.addEventListener("click", (event) => {
        if (event.target === movieDetailsDialog) {
          if (typeof movieDetailsDialog.close === "function") movieDetailsDialog.close();
          else movieDetailsDialog.removeAttribute("open");
        }
      });
    }
    if (documentRef && typeof documentRef.querySelectorAll === "function") {
      for (const button of documentRef.querySelectorAll("[data-mobile-action]")) {
        button.addEventListener("click", () => {
          const action = button.dataset.mobileAction;
          if (action === "search" && searchInput) searchInput.focus();
          if (action === "home" && heroMovie) heroMovie.scrollIntoView({ behavior: "smooth", block: "start" });
          if (action === "library") {
            activeLibraryView = "movies";
            activeFolder = "all";
            activeCategory = "all";
            setActivePage("library");
            renderLibrary();
            if (movieGrid) movieGrid.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        });
      }
    }


    initializeViewerProfile();
    setActivePage(activePage);
    pendingFireTvCode = readFireTvCodeFromUrl();

    bindRemoteButton(remoteUpButton, "up");
    bindRemoteButton(remoteLeftButton, "left");
    bindRemoteButton(remoteSelectButton, "select");
    bindRemoteButton(remoteRightButton, "right");
    bindRemoteButton(remoteDownButton, "down");
    bindRemoteButton(remoteBackButton, "back");
    bindRemoteButton(remoteHomeButton, "home");
    bindRemoteButton(remotePlayButton, "play");
    bindRemoteButton(remoteSettingsButton, "settings");
    if (windowRef) {
      windowRef.MovieRoomRemote = handleRemoteCommand;
    }
    if (settingsCloseButton) {
      settingsCloseButton.addEventListener("click", closeSettings);
    }
    if (settingsDialog) {
      settingsDialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        closeSettings();
      });
    }
    if (settingsNetworkButton) {
      settingsNetworkButton.addEventListener("click", () => invokeAndroidSetting("openNetworkSettings", "Open Fire TV Settings, then Network to choose Wi-Fi."));
    }
    if (settingsDisplayButton) {
      settingsDisplayButton.addEventListener("click", () => invokeAndroidSetting("openDisplaySettings", "Open Fire TV Settings, then Display to adjust the screen."));
    }
    if (settingsBluetoothButton) {
      settingsBluetoothButton.addEventListener("click", () => invokeAndroidSetting("openBluetoothSettings", "Open Fire TV Settings, then Controllers & Bluetooth Devices."));
    }
    if (settingsSystemButton) {
      settingsSystemButton.addEventListener("click", () => invokeAndroidSetting("openSettings", "Open the Fire TV Settings app to manage Movie Room and device options."));
    }
    if (settingsReloadButton) {
      settingsReloadButton.addEventListener("click", () => {
        closeSettings();
        reloadButton.click();
      });
    }
    if (playerSettingsButton) {
      playerSettingsButton.addEventListener("click", openSettings);
    }
    if (playerNetworkSettingsButton) {
      playerNetworkSettingsButton.addEventListener("click", () => invokeAndroidSetting("openNetworkSettings", "Open Fire TV Settings, then Network to choose Wi-Fi."));
    }
    if (documentRef && hasMethod(documentRef, "addEventListener")) {
      documentRef.addEventListener("focusin", (event) => {
        if (!(remoteControlBar && remoteControlBar.contains(event.target))) rememberRemoteTarget(event.target);
      });
    }

    movieSelect.addEventListener("change", () => {
      rememberMovieForProfile(movieSelect.value);
      updateNowPlaying(selectedMovie());
      playSelectedMovie().catch((error) => {
        updateStatus(error.message);
      });
    });

    reloadButton.addEventListener("click", async () => {
      try {
        const previousSelection = movieSelect.value;
        const movies = await loadLibrary(previousSelection, { forceRefresh: true });

        if (movies.length && !playerVisible) {
          updateStatus("Library ready. Choose a movie to start streaming.");
        }
      } catch (error) {
        updateStatus(error.message);
      }
    });

    logoutButton.addEventListener("click", () => {
      handleLogout().catch((error) => {
        updateStatus(error.message);
      });
    });

    passwordForm.addEventListener("submit", (event) => {
      handleLogin(event).catch((error) => {
        announceLoginError(error.message);
      });
    });

    if (searchInput) {
      searchInput.addEventListener("focus", () => {
        if (authenticated) setSearchOverlayVisible(true);
      });
      searchInput.addEventListener("input", () => {
        searchTerm = searchInput.value.trim().toLowerCase();
        rememberSearchForProfile(searchInput.value);
        renderMovieGrid();
        if (authenticated) setSearchOverlayVisible(true);
      });
    }
    if (detailsFavorite) {
      detailsFavorite.addEventListener("click", async () => {
        if (!detailsMovie || !viewerStateClient) return;
        try {
          const record = viewerRecord(detailsMovie.id);
          const nextValue = !(record && record.favorite);
          viewerState = await viewerStateClient.apply(activeProfile, [{ type: "setFlag", movieId: detailsMovie.id, flag: "favorite", value: nextValue }]);
          detailsFavorite.textContent = nextValue ? "★ Remove Favorite" : "☆ Add Favorite";
          detailsStatus.textContent = nextValue ? "Saved to your Favorites." : "Removed from your Favorites.";
          renderDiscovery();
          if (searchOverlay && !searchOverlay.hidden) renderSearchOverlay();
        } catch (error) { detailsStatus.textContent = error.message; }
      });
    }
    if (searchOverlayClose) {
      searchOverlayClose.addEventListener("click", () => setSearchOverlayVisible(false));
    }
    if (searchOverlay) {
      searchOverlay.addEventListener("click", (event) => {
        if (event.target === searchOverlay) setSearchOverlayVisible(false);
      });
    }

    if (heroPrev) heroPrev.addEventListener("click", () => {
      if (!heroMovies.length) return;
      heroIndex = (heroIndex - 1 + heroMovies.length) % heroMovies.length;
      renderDiscovery();
    });
    if (heroNext) heroNext.addEventListener("click", () => {
      if (!heroMovies.length) return;
      heroIndex = (heroIndex + 1) % heroMovies.length;
      renderDiscovery();
    });

    if (theaterModeButton) theaterModeButton.addEventListener("click", () => setPlayerMode(playerMode === "theater" ? "normal" : "theater"));
    if (miniplayerModeButton) miniplayerModeButton.addEventListener("click", () => setPlayerMode(playerMode === "miniplayer" ? "normal" : "miniplayer"));
    if (upNextPlay) upNextPlay.addEventListener("click", () => playNextFromQueue());

    if (documentRef && typeof documentRef.addEventListener === "function") {
      documentRef.addEventListener("keydown", (event) => {
        const target = event.target;
        const tag = target && target.tagName ? String(target.tagName).toLowerCase() : "";
        const key = String(event.key || "").toLowerCase();
        if (key === "escape" && searchOverlay && !searchOverlay.hidden) {
          event.preventDefault();
          setSearchOverlayVisible(false);
          return;
        }
        if (tag === "input" || tag === "textarea" || (target && target.isContentEditable)) return;
        if (["arrowup", "arrowleft", "arrowright", "arrowdown"].includes(key)) {
          event.preventDefault();
          moveRemoteFocus(key.replace("arrow", ""));
        } else if (key === "enter") {
          event.preventDefault();
          activateRemoteTarget();
        } else if (key === "backspace") {
          event.preventDefault();
          remoteBack();
        } else if (key === "contextmenu") {
          event.preventDefault();
          openSettings();
        } else if (key === " " || key === "k") { event.preventDefault(); remotePlayPause(); }
        else if (key === "j") seekPlayerBy(-10);
        else if (key === "l") seekPlayerBy(30);
        else if (key === "f") openFullscreenPlayer();
        else if (key === "t") setPlayerMode(playerMode === "theater" ? "normal" : "theater");
        else if (key === "i") setPlayerMode(playerMode === "miniplayer" ? "normal" : "miniplayer");
        else if (key === "m") player.muted = !player.muted;
        else if (key === "escape" && playerMode !== "normal") setPlayerMode("normal");
        else if (key === "/" && searchInput) { event.preventDefault(); searchInput.focus(); }
      });
      documentRef.addEventListener("pagehide", () => { savePlaybackProgress("pagehide").catch(() => {}); });
    }

    if (profileToggle && profileMenu) {
      profileToggle.addEventListener("click", () => {
        profileMenu.hidden = !profileMenu.hidden;
        if (typeof profileToggle.setAttribute === "function") {
          profileToggle.setAttribute("aria-expanded", profileMenu.hidden ? "false" : "true");
        }
      });
    }

    for (const button of profileButtons) {
      button.addEventListener("click", () => {
        const profileId = button.dataset ? button.dataset.viewerProfile : "home";
        setViewerProfile(profileId);
        if (!allMovies.length) {
          return;
        }
        const rememberedMovieId = storedMovieForProfile();
        const rememberedMovie = allMovies.find((movie) => movie.id === rememberedMovieId && (Number(movie.size) || 0) > 0);
        const fallbackMovie = allMovies.find((movie) => (Number(movie.size) || 0) > 0);
        const nextMovie = rememberedMovie || fallbackMovie;
        if (nextMovie) {
          movieSelect.value = nextMovie.id;
          updateNowPlaying(null);
          updateStatus("Choose a movie to start streaming.");
        }
        loadLibrary(movieSelect.value).catch(() => {});
      });
    }

    if (enablePermissionsButton) {
      enablePermissionsButton.addEventListener("click", () => {
        requestFirstRunPermissions().catch((error) => {
          updatePermissionStatus(error.message);
          enablePermissionsButton.disabled = false;
        });
      });
    }

    if (skipPermissionsButton) {
      skipPermissionsButton.addEventListener("click", () => {
        markPermissionPanelDone();
      });
    }

    if (castButton) {
      castButton.addEventListener("click", () => {
        promptRemotePlayback().catch((error) => {
          updateStatus(error.message);
        });
      });
    }

    if (pairFireTvButton && fireTvPairingForm) {
      pairFireTvButton.addEventListener("click", () => {
        fireTvPairingForm.hidden = !fireTvPairingForm.hidden;
        if (!fireTvPairingForm.hidden) {
          updateFireTvPairingStatus("Enter the code shown on your Fire TV.");
        }
      });
    }

    if (pendingFireTvCode && fireTvPairingForm) {
      fireTvPairingForm.hidden = false;
      updateFireTvPairingStatus("QR pairing loaded. Sign in to approve this Fire TV automatically.");
    }

    if (fireTvPairingForm) {
      fireTvPairingForm.addEventListener("submit", (event) => {
        return approveFireTvPairing(event).catch((error) => {
          updateFireTvPairingStatus(error.message);
          return false;
        });
      });
    }

    if (keepAwakeButton) {
      keepAwakeButton.addEventListener("click", () => {
        keepAwakeWanted = !wakeLock;
        if (wakeLock) {
          releaseWakeLock().catch(() => {});
          updateStatus("Keep awake is off.");
          return;
        }

        requestWakeLock().catch(() => {});
      });
    }

    if (fullscreenButton) {
      fullscreenButton.addEventListener("click", () => {
        openFullscreenPlayer().catch((error) => {
          updateStatus(error.message);
        });
      });
    }

    if (seekBackwardButton) {
      seekBackwardButton.addEventListener("click", () => seekPlayerBy(-10));
    }

    if (seekForwardButton) {
      seekForwardButton.addEventListener("click", () => seekPlayerBy(30));
    }

    if (timeline && hasMethod(timeline, "addEventListener")) {
      timeline.addEventListener("input", (event) => {
        const duration = Number.isFinite(player.duration) ? Math.max(0, Number(player.duration)) : 0;
        const requested = Number(event && event.target && event.target.value);
        if (duration <= 0 || !Number.isFinite(requested)) {
          updateTimeline();
          return;
        }
        clearStallRecovery();
        isSeeking = true;
        player.currentTime = Math.max(0, Math.min(requested, duration));
        updateTimeline();
      });
    }

    player.addEventListener("webkitplaybacktargetavailabilitychanged", (event) => {
      safariAirPlayAvailable = event.availability === "available";
      updateCastButton();
      updateTvGuide();
    });

    if (documentRef && hasMethod(documentRef, "addEventListener")) {
      documentRef.addEventListener("visibilitychange", () => {
        if (documentRef.visibilityState === "hidden" && activePreviewCancel) activePreviewCancel();
        if (documentRef.visibilityState === "visible" && keepAwakeWanted && !wakeLock && !player.paused) {
          requestWakeLock().catch(() => {});
        }
      });
    }

    allowRemotePlayback();
    updateKeepAwakeButton();
    updateCastButton();
    updateTvGuide();
    updateBufferStatus();
    showPermissionPanelIfNeeded();
    initializeGoogleCast().catch(() => {
      googleCastReady = false;
      updateCastButton();
      updateTvGuide();
    });

    player.addEventListener("waiting", () => {
      scheduleStallRecovery("Loading more video while keeping your place…");
    });

    player.addEventListener("seeking", () => {
      isSeeking = true;
      clearStallRecovery();
      updateTimeline();
      updateBufferStatus();
    });

    player.addEventListener("seeked", () => {
      isSeeking = false;
      updateTimeline();
      updateStatus(statusWithBuffer("Seek complete."));
    });

    player.addEventListener("canplay", () => {
      if (bufferedSecondsAhead() >= 2) {
        clearStallRecovery();
      }
      updateStatus(statusWithBuffer("Ready to play."));
      updateTimeline();
    });

    player.addEventListener("canplaythrough", () => {
      clearStallRecovery();
      updateStatus(statusWithBuffer("Ready for smooth playback."));
      updateTimeline();
    });

    player.addEventListener("playing", () => {
      clearStallRecovery();
      updatePlaybackState("playing");
      if (keepAwakeWanted) {
        requestWakeLock().catch(() => {});
      }
      updateStatus(statusWithBuffer("Streaming now."));
    });

    player.addEventListener("progress", () => {
      const secondsAhead = bufferedSecondsAhead();
      if (secondsAhead >= 2) {
        clearStallRecovery();
        updateStatus(statusWithBuffer(player.paused ? "Ready to play." : "Streaming now."));
      } else {
        updateBufferStatus();
      }
    });

    player.addEventListener("timeupdate", () => {
      if (
        stallRecoveryTimer !== null
        && stallPosition !== null
        && Number.isFinite(player.currentTime)
        && player.currentTime > stallPosition + 0.5
      ) {
        clearStallRecovery();
      }

      if (
        stableRefreshPosition !== null
        && Number.isFinite(player.currentTime)
        && player.currentTime >= stableRefreshPosition + 30
      ) {
          playbackRefreshAttempts = 0;
          stableRefreshPosition = null;
      }

      updateBufferStatus();
      updateTimeline();
      scheduleProgressSave();
    });

    player.addEventListener("pause", () => {
      clearStallRecovery();
      updatePlaybackState("paused");
      savePlaybackProgress("pause").catch(() => {});
    });
    player.addEventListener("ended", () => {
      isSeeking = false;
      clearStallRecovery();
      updatePlaybackState("none");
      releaseWakeLock().catch(() => {});
      savePlaybackProgress("ended").catch(() => {});
      if (viewerState.settings && viewerState.settings.autoplayNext) playNextFromQueue();
    });

    player.addEventListener("loadedmetadata", () => {
      updateTimeline();
      restorePlaybackProgress(movieSelect.value);
      if (!resumeAfterRefresh) {
        return;
      }

      const { movieId, position, shouldPlay } = resumeAfterRefresh;
      resumeAfterRefresh = null;

      if (movieSelect.value !== movieId) {
        return;
      }

      if (position > 0 && Number.isFinite(player.duration)) {
        player.currentTime = Math.min(position, Math.max(player.duration - 0.1, 0));
      }

      if (shouldPlay && typeof player.play === "function") {
        const playPromise = player.play();
        if (playPromise && typeof playPromise.catch === "function") {
          playPromise.catch(() => {});
        }
      }
    });

    player.addEventListener("stalled", () => {
      scheduleStallRecovery("Connection slowed down. Loading more video while keeping your place…");
    });

    player.addEventListener("error", () => {
      isSeeking = false;
      clearStallRecovery();
      const mediaErrorCode = player.error ? player.error.code : undefined;
      if (mediaErrorCode === 1) {
        return;
      }
      if (mediaErrorCode === 3 || mediaErrorCode === 4) {
        resumeAfterRefresh = null;
        updateStatus("This video format is not supported smoothly by this browser. MP4 with H.264 video and AAC audio works best.");
        return;
      }

      if (mediaErrorCode !== 2) {
        resumeAfterRefresh = null;
        updateStatus("This movie could not be played in the browser.");
        return;
      }

      void refreshPlaybackLink("This movie could not keep a stable streaming connection.");
    });

    loadSession()
      .then(async (authenticated) => {
        if (!authenticated) {
          return;
        }

        await loadLibrary();
        await approvePendingFireTvPairing();
      })
      .catch((error) => {
        updateStatus(error.message);
      });
  }

  return {
    handleLogin,
    handleLogout,
    initialize,
    loadLibrary,
    loadSession,
    movieLabel,
    playSelectedMovie,
    playNextFromQueue,
    restorePlaybackProgress,
    savePlaybackProgress,
    setPlayerMode,
    setAuthenticated,
    updateStatus,
  };
}

if (typeof document !== "undefined") {
  createApp({
    movieSelect: document.getElementById("movie-select"),
    reloadButton: document.getElementById("reload"),
    logoutButton: document.getElementById("logout"),
    searchInput: document.getElementById("library-search"),
    searchOverlay: document.getElementById("search-overlay"),
    searchOverlayClose: document.getElementById("search-overlay-close"),
    searchOverlayResults: document.getElementById("search-overlay-results"),
    searchOverlayGenres: document.getElementById("search-overlay-genres"),
    searchOverlaySummary: document.getElementById("search-overlay-summary"),
    passwordForm: document.getElementById("password-form"),
    passwordInput: document.getElementById("password"),
    submitButton: document.getElementById("login-submit"),
    player: document.getElementById("player"),
    timeline: document.getElementById("timeline"),
    timelineCurrent: document.getElementById("timeline-current"),
    timelineDuration: document.getElementById("timeline-duration"),
    playerFrame: document.querySelector(".player-frame"),
    status: document.getElementById("status"),
    bufferStatus: document.getElementById("buffer-status"),
    nowPlayingTitle: document.getElementById("now-playing-title"),
    nowPlayingDetail: document.getElementById("now-playing-detail"),
    loginStatus: document.getElementById("login-status"),
    librarySummary: document.getElementById("library-summary"),
    catalogStatus: document.getElementById("catalog-status"),
    folderShelf: document.getElementById("folder-shelf"),
    categoryShelf: document.getElementById("category-shelf"),
    movieGrid: document.getElementById("movie-grid"),
    watchPlaceholder: document.getElementById("watch-placeholder"),
    watchStage: document.querySelector(".watch-stage"),
    permissionPanel: document.getElementById("permission-panel"),
    enablePermissionsButton: document.getElementById("enable-permissions"),
    skipPermissionsButton: document.getElementById("skip-permissions"),
    permissionStatus: document.getElementById("permission-status"),
    castButton: document.getElementById("cast-tv"),
    tvGuideTitle: document.getElementById("tv-guide-title"),
    tvGuideSteps: document.getElementById("tv-guide-steps"),
    tvGuideStatus: document.getElementById("tv-guide-status"),
    keepAwakeButton: document.getElementById("keep-awake"),
    fullscreenButton: document.getElementById("fullscreen-player"),
    seekBackwardButton: document.getElementById("seek-backward"),
    seekForwardButton: document.getElementById("seek-forward"),
    authPanel: document.getElementById("auth-panel"),
    libraryPanel: document.getElementById("library-panel"),
    pairFireTvButton: document.getElementById("pair-fire-tv"),
    fireTvPairingForm: document.getElementById("fire-tv-pairing-form"),
    fireTvCodeInput: document.getElementById("fire-tv-code"),
    fireTvPairingStatus: document.getElementById("fire-tv-pairing-status"),
    profileToggle: document.getElementById("profile-toggle"),
    profileMenu: document.getElementById("profile-menu"),
    profileLabel: document.getElementById("profile-label"),
    profileAvatar: document.getElementById("profile-avatar"),
    profileButtons: Array.from(document.querySelectorAll("[data-viewer-profile]")),
    heroMovie: document.getElementById("hero-movie"),
    heroBackdrop: document.getElementById("hero-backdrop"),
    heroPreviewVideo: document.getElementById("hero-preview-video"),
    libraryBackgroundPreview: document.getElementById("library-background-preview"),
    heroTitle: document.getElementById("hero-title"),
    heroMeta: document.getElementById("hero-meta"),
    heroDescription: document.getElementById("hero-description"),
    heroPlay: document.getElementById("hero-play"),
    heroDetails: document.getElementById("hero-details"),
    heroPrev: document.getElementById("hero-prev"),
    heroNext: document.getElementById("hero-next"),
    heroIndicator: document.getElementById("hero-indicator"),
    continueWatchingShelf: document.getElementById("continue-watching-shelf"),
    continueSummary: document.getElementById("continue-summary"),
    recentlyAddedShelf: document.getElementById("recently-added-shelf"),
    picksShelf: document.getElementById("picks-shelf"),
    movieDetailsDialog: document.getElementById("movie-details-dialog"),
    detailsClose: document.getElementById("details-close"),
    detailsPoster: document.getElementById("details-poster"),
    detailsTitle: document.getElementById("details-title"),
    detailsMeta: document.getElementById("details-meta"),
    detailsDescription: document.getElementById("details-description"),
    detailsPlay: document.getElementById("details-play"),
    detailsWatchLater: document.getElementById("details-watch-later"),
    detailsQueue: document.getElementById("details-queue"),
    detailsFavorite: document.getElementById("details-favorite"),
    detailsStatus: document.getElementById("details-status"),
    theaterModeButton: document.getElementById("theater-mode"),
    miniplayerModeButton: document.getElementById("miniplayer-mode"),
    upNextPanel: document.getElementById("up-next-panel"),
    upNextTitle: document.getElementById("up-next-title"),
    upNextPlay: document.getElementById("up-next-play"),
    closePlayerPage: document.getElementById("close-player-page"),
    remoteControlBar: document.getElementById("remote-control-bar"),
    remoteFocusLabel: document.getElementById("remote-focus-label"),
    remoteUpButton: document.getElementById("remote-up"),
    remoteLeftButton: document.getElementById("remote-left"),
    remoteSelectButton: document.getElementById("remote-select"),
    remoteRightButton: document.getElementById("remote-right"),
    remoteDownButton: document.getElementById("remote-down"),
    remoteBackButton: document.getElementById("remote-back"),
    remoteHomeButton: document.getElementById("remote-home"),
    remotePlayButton: document.getElementById("remote-play"),
    remoteSettingsButton: document.getElementById("remote-settings"),
    settingsDialog: document.getElementById("settings-dialog"),
    settingsNetworkButton: document.getElementById("settings-network"),
    settingsDisplayButton: document.getElementById("settings-display"),
    settingsBluetoothButton: document.getElementById("settings-bluetooth"),
    settingsSystemButton: document.getElementById("settings-system"),
    settingsReloadButton: document.getElementById("settings-reload"),
    settingsCloseButton: document.getElementById("settings-close"),
    playerSettingsButton: document.getElementById("player-settings"),
    playerNetworkSettingsButton: document.getElementById("player-network-settings"),
    fetchImpl: fetch,
    locationOrigin: window.location.origin,
    createOption: () => document.createElement("option"),
  }).initialize();
}

if (typeof module !== "undefined") {
  module.exports = { browseGenreOptions, classifyMovie, createApp, filterMovieFolders, searchMovies };
}

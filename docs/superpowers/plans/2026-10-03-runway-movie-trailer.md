# Runway Movie Trailer Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a secure, authenticated Movie Room flow that starts a five-second Runway `gen4.5` trailer task for a recently added movie, polls its status, and previews the temporary output in the browser.

**Architecture:** Keep Runway behind a server-only provider boundary. The Node HTTP server validates the selected catalog movie, builds a bounded prompt, creates the asynchronous task, and returns a signed opaque task token; the browser polls a protected status route and never receives the Runway secret. The UI adds a trailer action and preview state to the existing recently-added/details flow without persisting generated media.

**Tech Stack:** Node.js 22 native HTTP server, `@runwayml/sdk`, existing Movie Room session/profile access, existing in-memory/durable store abstractions, browser JavaScript, and Node's built-in test runner.

**Spec:** `docs/superpowers/specs/2026-10-03-runway-movie-trailer-design.md`

## Global Constraints

- Use Runway model `gen4.5`, duration `5`, and ratio `1280:720` for the first implementation.
- Use the official `@runwayml/sdk`; create tasks asynchronously and retrieve them with `client.tasks.retrieve(id)`.
- Keep `RUNWAYML_API_SECRET` server-only; never place it in tracked files, browser code, APKs, logs, responses, tests, or chat.
- Do not make a live or billable Runway generation during automated verification.
- Treat Runway output URLs as temporary and do not write them to the catalog, local storage, service-worker cache, Git, or APKs.
- Preserve all unrelated existing working-tree changes and stage only files belonging to this feature.

## Review Focus

- A public or unauthenticated request must not create or retrieve a Runway task; pin this in the server route tests.
- A selected movie with no usable recent-added timestamp must not be accepted as a recently added trailer target; pin this in the prompt/service tests.
- `THROTTLED`, `FAILED`, `CANCELLED`, and `SUCCEEDED` task states must normalize distinctly and stop client polling appropriately; pin this in provider and route tests.
- Creative direction and catalog descriptions are data, not server instructions, and must be length-bounded before prompt construction; pin this in prompt tests.
- Repeated trailer creation must be rate-limited and must not create an automatic duplicate retry; pin this in the request tests.

---

### Task 1: Add the Runway provider and prompt boundary

**Files:**
- Create: `lib/runway.js`
- Create: `lib/runway-trailer.js`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.env.example`
- Test: `test/runway.test.js`

**Interfaces:**
- `createRunwayClient({ apiSecret, sdkFactory }) -> { isConfigured(), createTrailerTask({ prompt }), retrieveTask(taskId) }`.
- `buildTrailerPrompt(movie, creativeDirection) -> string`.
- `createRunwayTrailerService({ provider, runwayClient, sessionSecret, now }) -> { create({ movieId, creativeDirection, sessionId }), getStatus({ token, sessionId }) }`.
- `create()` returns `{ token, status }`; `getStatus()` returns normalized `{ status, outputUrl? }` without raw SDK data.

- [ ] **Step 1: Write failing provider and prompt tests**

  Add tests for missing configuration, exact `gen4.5`/`5`/`1280:720` request fields, `client.tasks.retrieve`, title/year/genre/description prompt inclusion, missing metadata, creative-direction truncation, and absence of secret values from normalized results.

- [ ] **Step 2: Run the focused test file and verify it fails**

  Run `node --test test/runway.test.js`.
  Expected: FAIL because the provider and service modules do not exist yet.

- [ ] **Step 3: Add the official SDK dependency and environment placeholder**

  Add `@runwayml/sdk` to `package.json`, refresh `package-lock.json`, and add only `RUNWAYML_API_SECRET=replace-with-runway-api-secret` to `.env.example` with a server-only comment.

- [ ] **Step 4: Implement `lib/runway.js`**

  Construct `new RunwayML({ apiKey: apiSecret })` only when a secret exists. Call `client.textToVideo.create({ model: "gen4.5", promptText: prompt, ratio: "1280:720", duration: 5 })` for creation and `client.tasks.retrieve(taskId)` for status. Normalize status and output fields without retaining or returning the SDK client.

- [ ] **Step 5: Implement `lib/runway-trailer.js`**

  Resolve the movie from `provider.listMovies()`, require a usable `dateAdded`, `premiered`, or `createdDateTime`, bound all prompt inputs, build an original cinematic-preview prompt, and sign an expiring opaque token containing the Runway task ID and session ID with the existing session secret. Verify the token and session match before status retrieval.

- [ ] **Step 6: Run the focused tests and verify they pass**

  Run `node --test test/runway.test.js`.
  Expected: PASS with no API call to Runway and no secret in test output.

- [ ] **Step 7: Commit the provider boundary**

  ```powershell
  git add lib/runway.js lib/runway-trailer.js package.json package-lock.json .env.example test/runway.test.js
  git commit -m "feat: add secure Runway trailer provider"
  ```

### Task 2: Add authenticated trailer and task-status routes

**Files:**
- Modify: `server.js`
- Modify: `test/runway.test.js`

**Interfaces:**
- `createAppContext(options)` accepts an injectable `runwayClient` and exposes a `runwayTrailerService`.
- `POST /api/runway/trailer` accepts `{ movieId, creativeDirection? }` and returns `{ taskToken, status }` with `Cache-Control: no-store`.
- `GET /api/runway/tasks/:taskToken` returns `{ status, outputUrl? }` with `Cache-Control: no-store`.

- [ ] **Step 1: Write failing request tests**

  Start the existing test server with a mocked Runway client and assert unauthenticated create/status requests return `401`, unknown movie IDs return `404`, invalid bodies return `400`, valid create returns only a task token and initial status, status retrieval is session-bound, and provider failures map to safe errors.

- [ ] **Step 2: Run the route tests and verify they fail**

  Run `node --test test/runway.test.js`.
  Expected: FAIL because the routes are not registered.

- [ ] **Step 3: Add the Runway service and endpoint-specific limiter to `createAppContext`**

  Read `RUNWAYML_API_SECRET` from the existing env/options boundary, inject a test client when supplied, and add a `runway-trailer:` limiter with conservative defaults of 3 create attempts per hour per session. Do not reuse the login-failure limiter for generation attempts.

- [ ] **Step 4: Register `POST /api/runway/trailer`**

  Require the existing Movie Room session and enabled profile session when applicable, enforce same-origin for the state-changing request, parse the bounded JSON body, call the service, and return only the opaque task token and status.

- [ ] **Step 5: Register `GET /api/runway/tasks/:taskToken`**

  Require the same session boundary, verify the signed token, retrieve the task, map `PENDING`, `THROTTLED`, `RUNNING`, `SUCCEEDED`, `FAILED`, and `CANCELLED`, and return the output URL only for `SUCCEEDED`.

- [ ] **Step 6: Run the route tests and the existing server tests**

  Run `node --test test/runway.test.js test/server.test.js`.
  Expected: PASS with no live Runway request.

- [ ] **Step 7: Commit the server routes**

  ```powershell
  git add server.js test/runway.test.js
  git commit -m "feat: add authenticated Runway trailer routes"
  ```

### Task 3: Add the Movie Room trailer preview UI

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Test: `test/runway.test.js`

**Interfaces:**
- Client helper `requestRunwayTrailer(movie, creativeDirection) -> Promise<{ taskToken, status }>`.
- Client helper `pollRunwayTrailer(taskToken, { signal }) -> Promise<{ status, outputUrl? }>`.
- Existing movie-detail state owns the current trailer request and aborts it when the details view closes or changes title.

- [ ] **Step 1: Write failing UI contract tests**

  Assert that the details page contains a `Generate Trailer` action and a hidden trailer preview video, that the client calls the create/status endpoints with the selected movie ID, and that success/failure copy does not expose provider internals.

- [ ] **Step 2: Run the focused UI tests and verify they fail**

  Run `node --test test/runway.test.js`.
  Expected: FAIL because the trailer controls and client helpers are not present.

- [ ] **Step 3: Add the details-page controls in `public/index.html`**

  Add a `details-trailer` button, a bounded creative-direction input or empty default direction, a status region, and a trailer video element. Keep the video muted, `playsinline`, uncached, and hidden until a successful output URL is received.

- [ ] **Step 4: Implement request and polling helpers in `public/app.js`**

  POST the current movie ID and optional direction, then poll the status route with at least five-second backoff and bounded timeout. Stop on terminal status, abort on title change/close, and render safe user-facing messages for missing configuration, throttling, failure, or expired output.

- [ ] **Step 5: Bind the action to the recently added/details flow**

  Make the action available when a movie opened from the recently added shelf has a usable recent-added timestamp. Preserve existing focus order and narrow/mobile/TV behavior. Do not write task tokens or output URLs to local storage or the service worker cache.

- [ ] **Step 6: Run the UI and existing frontend tests**

  Run `node --test test/runway.test.js test/pwa.test.js test/ui-styling.test.js test/movie-room-web-app.test.js`.
  Expected: PASS with the new action present and no service-worker cache changes.

- [ ] **Step 7: Commit the UI**

  ```powershell
  git add public/index.html public/app.js test/runway.test.js
  git commit -m "feat: add Movie Room trailer preview controls"
  ```

### Task 4: Full verification and Cloud Run readiness check

**Files:**
- Modify: `README.md` only if the implementation adds a required local/deployment variable or run command.
- Test: existing full test suite and a non-billable Cloud Run/API readiness probe outside the repository.

**Interfaces:**
- No new application interface. This task verifies the completed interfaces from Tasks 1–3 and records the hosting recommendation without deploying.

- [ ] **Step 1: Run the complete local test suite**

  Run `npm test`.
  Expected: PASS with the existing unrelated working-tree changes preserved.

- [ ] **Step 2: Verify secret hygiene**

  Search tracked files and test output for `RUNWAYML_API_SECRET`, `key_`, and known secret-shaped values. Expected: only the placeholder/configuration name appears; no actual key appears.

- [ ] **Step 3: Run the short Google Cloud API/CLI readiness test**

  First run `gcloud --version` and `gcloud auth list --filter=status:ACTIVE --format='value(account)'` if the Google Cloud CLI is installed. If it is not installed, run a read-only Cloud Run API discovery request and report that deployment authentication is still required. Do not enable APIs, create projects, deploy services, or upgrade billing.

- [ ] **Step 4: Review Cloud Run fit**

  Confirm the Node server listens on the Cloud Run `PORT`, that Cloud Run can host the API and static server, and that `RUNWAYML_API_SECRET` should be supplied through Secret Manager rather than source or plain environment configuration. Document that Cloud Run does not provide persistent media storage by itself and that Runway output URLs remain temporary.

- [ ] **Step 5: Commit only documentation changes, if any**

  Stage only a README/deployment note if needed; do not stage APKs, test artifacts, temporary files, or unrelated existing changes.

## Cloud Run decision boundary

Cloud Run is a viable later host for this Node API and static server, especially if the app should move off Vercel or needs Google-managed secrets and service scaling. It is not required for the first local Runway integration, and it does not replace durable object storage. Deployment is intentionally outside this implementation plan until the local integration and a billing/project choice are verified.

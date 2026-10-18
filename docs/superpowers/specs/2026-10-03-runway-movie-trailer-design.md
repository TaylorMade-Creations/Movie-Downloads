# Runway Movie Trailer Generation Design

## Status

Approved conversational design; awaiting written-spec review before implementation planning.

## Goal

Add a secure Movie Room feature that lets an authenticated user generate a short cinematic preview for a recently added movie using Runway Dev. The first version is a preview workflow only: it starts an asynchronous Runway task, reports progress, and plays the temporary output URL when the task succeeds. It does not persist generated video files in Git, the web bundle, the phone app, or the Fire TV shell.

## Scope and non-goals

In scope:

- A server-only Runway client wrapper using the official `@runwayml/sdk` package.
- `POST /api/runway/trailer` to validate a movie selection and create a Runway task.
- A task-status endpoint that proxies the minimum safe status needed by the browser.
- A Movie Room action on the recently added movie surface.
- Progress, success, failure, and temporary-video playback states.
- Unit and request-level tests with a mocked Runway client.

Out of scope for the first version:

- Runway Characters, Recipes, Model Routers, or live conversational experiences.
- Durable trailer storage or a media-library write-back workflow.
- A billable live generation during automated verification.
- Exposing the Runway API key to any browser, mobile client, TV client, log, response, or repository file.
- Changing the existing movie catalog provider or recent-item ordering rules.

## Product behavior

The recently added shelf remains the entry point. Each eligible movie card can expose a `Generate Trailer` action. The client sends the selected Movie Room movie ID and an optional short creative direction to the server.

The server resolves the movie from the same catalog data already used by the app. It uses the movie title, year, genres, description, artwork context, and existing recent-added metadata to construct a cinematic prompt. The prompt must treat catalog metadata as descriptive input, not as instructions that can alter server behavior.

The first generation target is Runway model `gen4.5` with a five-second, 16:9 `1280:720` output. These values are the initial product defaults and must be represented in one server-side configuration boundary so they can be changed after evaluation without changing browser contracts.

The browser receives a task identifier and begins polling the Movie Room status endpoint with bounded backoff. The UI reports queued, running, succeeded, failed, and unavailable states. On success it receives only the temporary output URL needed for preview playback. The UI must label the preview as temporary and must not assume that the URL is a durable library asset.

## Server architecture

### Runway client boundary

Create a small module under `lib/` responsible for:

- Constructing the official Runway SDK client from `RUNWAYML_API_SECRET`.
- Creating a text-to-video task with the approved model, ratio, duration, and prompt.
- Reading task status and normalizing SDK errors into application-safe errors.
- Returning no secret or raw authorization detail to callers.

The module must fail closed when `RUNWAYML_API_SECRET` is missing. Configuration errors should be distinguishable from task failures without revealing environment values.

### HTTP routes

Add `POST /api/runway/trailer` to the existing Node HTTP server. The route must:

1. Require the same authenticated Movie Room session used by protected catalog actions.
2. Parse a bounded JSON body containing `movieId` and an optional bounded `creativeDirection` string.
3. Resolve the movie from the active catalog and reject unknown or inaccessible movie IDs.
4. Reject requests that do not identify an eligible recently added movie, unless the existing catalog contract explicitly marks the selected title as recently added.
5. Build the prompt server-side from sanitized metadata.
6. Create the Runway task and return a non-cacheable JSON response containing the opaque task ID and initial status.

Add a task-status route, following the server's existing path conventions, that:

- Requires the same session authentication.
- Accepts only a task ID returned by the create route.
- Returns normalized status values and, only on success, the temporary output URL.
- Never returns raw SDK objects, request headers, failure traces, or credentials.

The status route must distinguish a normal queued/throttled task from a failed task. Runway task output URLs are temporary and must not be cached by the browser or service worker.

### Authentication and abuse controls

Reuse the existing session/profile access boundary. Do not create a second password or client-side token for Runway. Apply an endpoint-specific request limit consistent with the server's existing protected-action rate limiting so a user cannot accidentally enqueue unlimited generations. Do not add an automatic retry that could create duplicate billable tasks.

## Client behavior

Use the existing recently added shelf and movie-card action patterns. The new action should:

- Be hidden or disabled when the movie lacks the metadata required for a useful prompt.
- Disable itself while a task is being created.
- Show a non-blocking progress state while polling.
- Show a clear failure message without exposing Runway failure details that contain internal data.
- On success, render an inline or details-page video preview using the temporary URL, with normal play/pause controls.
- Allow the user to dismiss the preview and start a new request intentionally.
- Avoid putting the task ID or output URL into durable catalog metadata, local storage, or the service worker cache.

The action must remain usable on the existing narrow mobile layout and the TV-oriented layout. TV remote focus behavior should not be changed beyond adding the new action to the existing focus order.

## Prompt construction

Prompt construction belongs on the server. It should use a stable template with bounded values, for example:

- title and year;
- genres, when available;
- a short catalog description, when available;
- an optional user creative direction, length-limited and treated as plain text;
- a direction to create an original cinematic preview without reproducing copyrighted footage or naming real performers as if they were participating.

The implementation must not invent missing plot facts or claim that the generated clip is an official trailer. It should label the result as an AI-generated Movie Room preview.

## Error handling

Expected errors include missing configuration, unauthenticated access, invalid input, unknown/inaccessible movie, Runway HTTP error, task throttling, task failure, cancellation, and temporary output expiration. Map these to stable application error codes and user-safe messages. Log only non-sensitive diagnostics such as route, task state, and sanitized error code; never log prompts that contain private catalog data unless the existing logging policy explicitly permits it.

The browser must stop polling on `SUCCEEDED`, `FAILED`, `CANCELLED`, or an application timeout. A `THROTTLED` Runway task is not treated as an immediate failure; it remains pollable with backoff.

## Testing and verification

Add mocked tests covering:

- missing `RUNWAYML_API_SECRET` fails without making a provider call;
- unauthenticated create and status requests are rejected;
- unknown or inaccessible movie IDs are rejected;
- a recently added movie produces the expected bounded prompt and `gen4.5` request shape;
- creative direction is length-limited and treated as data;
- task creation returns only the opaque task ID and initial status;
- queued, running, throttled, succeeded, failed, and cancelled status responses normalize correctly;
- success returns the temporary output URL without persisting it;
- provider errors do not leak secrets or raw SDK internals;
- the client transitions through create, polling, success, and failure states;
- existing library, authentication, service-worker, and TV-shell tests remain passing.

Verification must stop short of a live generation call unless the user separately requests a billable test. A local mocked end-to-end request is sufficient for the first implementation check.

## Configuration and secret handling

Document `RUNWAYML_API_SECRET` in `.env.example` as a server-only variable with a placeholder only. The actual value belongs in the ignored local environment file or an approved deployment secret store. The value copied by the user must not be written into tracked files, output, screenshots, test fixtures, client JavaScript, APKs, or chat.

## Future extension point

If the preview is useful, a later design can add durable storage through an approved media provider and a catalog association. That future work should be separate because Runway output URLs expire and storing generated videos changes storage, cleanup, and deployment requirements.

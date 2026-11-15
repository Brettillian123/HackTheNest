# Grader service

A small HTTP server around the grader, so the web app on Vercel (where a headless browser cannot run) can score sites and 3D scenes. It holds two headless Chromiums (one for sites, one for the 3D grader, started on the first 3D request) and grades one request at a time.

## Run it locally

From the `grader` folder:

```sh
GRADER_API_KEY=some-long-random-test-key npm start
```

PowerShell: `$env:GRADER_API_KEY='some-long-random-test-key'; npm start`. (`npm start` runs `tsx service/server.ts`.) Tests: `npx vitest run test/service`.

## Routes

Every `/v1/` route needs `Authorization: Bearer <GRADER_API_KEY>`. Bodies are JSON. Errors come back as `{ "error": "plain message" }`, never with a stack trace.

### `GET /health` (no key)

```json
{ "ok": true, "version": "0.6.0", "browserReady": true, "sceneBrowserReady": false, "busy": false, "waiting": 0, "cachedGoals": 3, "cachedScenes": 0 }
```

`browserReady` means a page has rendered since the server started (it renders a tiny page at start). `sceneBrowserReady` means the 3D grader's browser has built a scene; it is `false` until the first 3D request, because that browser only starts then. Health never starts a grade.

### `POST /v1/grade/site`

```json
{ "goal": { "index.html": "<!doctype html>..." }, "candidate": { "index.html": "<!doctype html>..." }, "screenshots": false }
```

```json
{ "result": { "version": "0.6.0", "total": 87.5, "pillars": { "works": 90, "engineering": 80, "looks": 88 }, "bonus": 0, "exactMatch": false,
  "engineering": { "efficiency": 95, "accessibility": 80, "cleanCode": 100, "decidedBy": "accessibility" },
  "feedback": [{ "message": "On the home page: an image has no text description ...", "points": 6.3 }],
  "efficiency": {}, "pages": [], "links": {} } }
```

(`result` is the grader's full result, shortened here; the top-level README explains every field.) `feedback` is the list to show the player: what cost points, in plain words, most costly first. With `"screenshots": true` the reply also has `"screenshots": { "index.html": "<base64 PNG>", ... }`, one per submitted page; leave it off to keep replies small. A submission that cannot be graded is still a 200, with `total: 0` and the reason in `result.error`. A goal that is not a valid site is a 400 with the reason.

Prepared goals are cached in memory (keyed by a hash of the goal files), so grading many submissions against one goal renders the goal once.

### `POST /v1/render/site`

```json
{ "site": { "index.html": "<!doctype html>...", "about.html": "..." } }
```

```json
{ "version": "0.4.0", "pages": [{ "path": "index.html", "width": 1280, "height": 800, "png": "<base64 PNG>" }] }
```

This is how the app gets the goal pictures to show players. An invalid site is a 400 with the reason. The rendered site goes into the goal cache, so a later grade against it is fast.

### `POST /v1/grade/scene`

```json
{ "goal": "function buildScene(THREE) { ... }", "candidate": "function buildScene(THREE) { ... }", "views": false }
```

```json
{ "result": { "version": "0.6.0", "total": 74.2, "pillars": { "works": 80, "engineering": 60, "looks": 85 }, "bonus": 0, "exactMatch": false, "details": {}, "feedback": ["There is extra material ... that the goal does not have."] } }
```

`goal` and `candidate` are JavaScript that defines `buildScene(THREE)` and returns a Three.js object. With `"views": true` the reply also has `"views": [{ "name": "three-quarter-front", "width": 384, "height": 288, "png": "<base64 PNG>" }, ...]`: the submission's four views, lined up with the goal (empty if it could not be built). A submission that will not build is still a 200, with `total: 0` and the reason in `result.error` and `result.feedback`. A goal that will not build is a 400 with the reason. 3D feedback lines are plain strings, not `{ message, points }`.

Prepared 3D goals have their own cache (keyed by a hash of the goal code), with the same limits as the site cache.

### `POST /v1/render/scene`

```json
{ "code": "function buildScene(THREE) { ... }" }
```

```json
{ "version": "0.6.0", "views": [{ "name": "three-quarter-front", "width": 384, "height": 288, "png": "<base64 PNG>" }] }
```

Four views. This is how the app gets the goal pictures for a 3D challenge. Code that will not build is a 400 with the reason. The scene goes into the 3D goal cache.

### Status codes

| Code | When |
|---|---|
| 400 | Body is not JSON, a field is missing or the wrong type, the goal/site is not a valid site, or the goal scene will not build |
| 401 | Missing or wrong key |
| 404 / 405 | Unknown route / wrong method |
| 413 | Body over `GRADER_MAX_BODY_MB` (answered before the rest is read) |
| 503 | Queue full (`Retry-After: 5`), or shutting down |
| 504 | Not finished within `GRADER_REQUEST_TIMEOUT_MS` (queue wait included) |

## Environment variables

| Name | Default | Meaning |
|---|---|---|
| `GRADER_API_KEY` | (required) | Shared secret, at least 16 characters. The server refuses to start without it. |
| `PORT` | `8080` | Port to listen on |
| `HOST` | `0.0.0.0` | Address to listen on |
| `GRADER_MAX_QUEUE` | `8` | Requests that may wait behind the one being graded; more get 503 |
| `GRADER_REQUEST_TIMEOUT_MS` | `55000` | Per-request deadline, queue wait included. A grade already running is not stopped (the grader caps rendering at 45 s); its answer is dropped |
| `GRADER_MAX_BODY_MB` | `8` | Largest request body |
| `GRADER_GOAL_CACHE` | `16` | Most prepared goals kept in memory (sites and 3D scenes each) |
| `GRADER_GOAL_CACHE_MB` | `256` | Most memory those goals may use (they hold screenshots), for each of the two caches |
| `GRADER_CHROMIUM_SANDBOX` | on | `0` turns off Chromium's own sandbox. See "Docker" below before doing this |

The grader also enforces its own limits: 40 files, 1.5 MB per site, 300 KB per file, 45 s of rendering per submission.

## Docker

The image (Dockerfile in the `grader` folder) is Node 24 on Debian 12, the Chromium headless shell that matches the locked Playwright version, the fonts, and a non-root user (`node`). It has a health check on `/health`.

Fonts: `fonts-liberation` (Liberation Sans and Mono, metric-compatible with Arial and Courier New) and `ttf-mscorefonts-installer` (the real Arial, Georgia and Courier New; Liberation has no Georgia match). The second one downloads the fonts during the build; if that fails, build with `--build-arg CORE_FONTS=0`.

On a fresh Ubuntu server with Docker installed, from the `grader` folder:

```sh
docker build -t grader .
curl -fsSLo seccomp_profile.json https://raw.githubusercontent.com/microsoft/playwright/v1.65.1/utils/docker/seccomp_profile.json
export GRADER_API_KEY=$(openssl rand -hex 32)   # keep this; the app needs the same value
docker run -d --name grader --restart unless-stopped --init \
  -p 8080:8080 -e GRADER_API_KEY \
  --user node --security-opt seccomp=seccomp_profile.json \
  --security-opt no-new-privileges --cap-drop ALL \
  --read-only --tmpfs /tmp --shm-size 1g \
  --memory 2g --pids-limit 512 --stop-timeout 60 \
  grader
docker logs grader          # "Grader service listening on port 8080"
curl http://localhost:8080/health
```

### Sandbox: what this arrangement is and why

Submissions are untrusted HTML, so two layers stay on:

1. **Chromium's own sandbox** (the default). It needs a non-root user, which the image uses, and permission to create user namespaces, which Docker's default seccomp profile forbids. Playwright's Docker docs recommend exactly this for untrusted pages: a non-root user plus their `seccomp_profile.json` (Docker's default profile plus user-namespace cloning). No `--privileged`, no `SYS_ADMIN`.
2. **The container**: no capabilities, `no-new-privileges`, read-only filesystem, memory and process limits.

`--shm-size 1g` is used instead of the `--ipc=host` the Playwright docs suggest, so the container does not share the host's IPC namespace; without one of them Chromium can crash on large pages. `--init` reaps stray browser processes. `--stop-timeout 60` gives a running grade time to finish on `docker stop`.

**If the browser will not start** (the first grade gives a 500 and `docker logs grader` mentions "No usable sandbox" or namespaces; Ubuntu 24.04's AppArmor limits on user namespaces may cause this), try in this order:

1. Add `--security-opt apparmor=unconfined`. Chromium's sandbox and the seccomp filter stay on.
2. Last resort: `-e GRADER_CHROMIUM_SANDBOX=0`, dropping the seccomp line. Chromium's sandbox is then off and the container (non-root, no capabilities, read-only, limits) is the only wall between a hostile page and the server. Do not run anything else valuable on that server in this mode.

## Calling it from the app (Vercel function)

Set `GRADER_URL` (for example `http://<server-ip>:8080`) and `GRADER_API_KEY` in the Vercel project's environment variables. Server-side only: never send the key to the browser.

```ts
export async function gradeSite(goal: Record<string, string>, candidate: Record<string, string>) {
  const res = await fetch(`${process.env.GRADER_URL}/v1/grade/site`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GRADER_API_KEY}` },
    body: JSON.stringify({ goal, candidate }),
    signal: AbortSignal.timeout(58_000),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Grader ${res.status}: ${body.error}`); // 503: retry after Retry-After seconds
  return body.result; // result.total is the score; result.error says why a submission scored 0
}
```

Render goal pictures once per challenge and store them, rather than calling `/v1/render/site` or `/v1/render/scene` on every page view. A 3D grade is the same call with `/v1/grade/scene` and `{ goal, candidate }` as code strings.

## What is and is not protected

Protected:
- Every `/v1/` route needs the key, compared in constant time. Bad keys and unknown routes are refused before the body is read.
- Body size, queue length and per-request time are capped; the grader caps files, site size and rendering time.
- Logs have one line per request (route, status, milliseconds, score), never the body or the key.

Not protected:
- **No TLS.** Over plain `http://` the key and submissions cross the internet readable. Before real use, put HTTPS in front (for example Caddy as a reverse proxy with a domain), or at least limit the port to the app's traffic.
- **No per-caller rate limit.** Anyone with the key can fill the queue. Keep the key on the server side of the app only.
- **One shared key.** Rotating it means changing it in both places and restarting.
- The grader renders pages offline with JavaScript off and refuses outside requests; this service adds no network rules of its own. A firewall on the server (only 22 and the grader's port open) is still a good idea.

## Adding a route

Routes are a table in `service/app.ts` (`routes`). A new entry with `auth: true` gets the key check, body limit and queue like the others. Wrap any browser work in `queued(...)` so it waits its turn.

# 08. What exists today (read 2026-11-14)

Read from `origin/main` (head adaa2d4) and the `grader` branch. Nothing was run. "Inferred" marks anything not read directly.

## Stack as it really is
Plain static HTML, CSS and vanilla JS (no Next.js, no Tailwind, no build step). A hand-written Node router in `backend/` runs as Vercel functions in `api/`. MongoDB Atlas holds users. Sessions are in server memory. The grader is a separate Docker HTTP service. Nothing connects the web app to the grader yet.

## Branches
`origin/main`, `rudy-stuff` (YellowCardinal's login work, already merged), `vercel-setup`, `grader-base`, `grader-0.3.0`, `grader-0.6.0`, `claude/focused-cray-bi8s7y` (docs only). The working folder is on `grader`, which has no `frontend/`, `backend/` or `api/`.

## Files, owners, recent changes
Owner counts from `git log origin/main`. Everything below changed within the last 24 hours (all commits are 4 to 12 hours old), so treat all of it as live.
- `frontend/` (pages, scripts, styles): YellowCardinal (2 commits). Last 4 h ago.
- `backend/` (config, controller, model, route, services): YellowCardinal (2). Last 4 h ago.
- `dev-server.mjs`: YellowCardinal. 6 h ago.
- `api/`, `lib/vercel-handler.js`, `vercel.json`: brettillian123 (Brett). 4 h ago.
- `grader/` (src, service, calibration, tests): brettillian123, 17 commits on the grader branch. `DEVPOST.md`, `STATUS.md` are only on this branch.
- `HANDOFF.md`, `IDEAS.md`, `RESEARCH.md`: Claude commits on Brett's account. 11 to 12 h ago.
- `docs/` (README, vercel.md): YellowCardinal and Brett.
- Untracked locally: `design/` (this work).

To avoid collisions: a new frontend should live in a new folder and not edit `frontend/`, `backend/`, `api/`, `vercel.json` or `dev-server.mjs` without agreement.

## HTTP endpoints in the web app (5 found)
All defined in `backend/route/api.js` (router), with controllers in `backend/controller/`. Each has a thin file in `api/` that calls the same router (`lib/vercel-handler.js`). Unknown `/api/*` returns 404 `{ "error": "API route not found." }`. All bodies JSON, request body limit 10,000 characters.

| Method and path | Request body | Response | Auth |
|---|---|---|---|
| POST `/api/auth/signup` | `{ username, email, password }` | 201 `{ user: { id, username, email } }` plus Set-Cookie. 400 validation text, 409 duplicate, 502/503 DB error | none |
| POST `/api/auth/login` | `{ email, password }` | 200 `{ user }` plus Set-Cookie. 401 wrong details | none |
| GET `/api/auth/me` | none | 200 `{ user }` or 401 `{ error: "Not logged in." }` | cookie |
| POST `/api/auth/logout` | none | 200 `{ ok: true }`, clears cookie | cookie (optional) |
| POST `/api/test-objects` | none | 201 `{ testObject: { id, randomString } }` (inferred shape; the service file was not read). 503/502 DB errors | none |

Validation: username 3 to 24 of letters, digits, underscore. Email must look valid. Password 8 to 128 characters.

## Auth today
- Email and password, not GitHub. Passwords are scrypt hashes (`passwordService.js`, not read in detail).
- Login makes a random 32-byte token held in a server-memory `Map` (`sessionService.js`), 24 hour life.
- Cookie `promptdyno_session`: HttpOnly, SameSite=Lax, Path=/, Secure when HTTPS, Max-Age 86400.
- Risk (inferred): on Vercel each function instance has its own memory, so a session can vanish on a cold start or land on another instance. `me` may then return 401 for a logged-in user.
- The `user` object has only `id`, `username`, `email`. No avatar, score, rank or role.
- Client: `auth-state.js` calls `/api/auth/me` on load and fills the profile menu; `auth.js` posts the login and signup forms, then goes to `/home`.

## Current pages
Routing (`vercel.json`): output folder `frontend`; `/` redirects 302 to `/home`; `/home` and `/challenge` both serve `pages/home.html`; `/login` and `/signup` serve their pages; any other `/name` serves `pages/name.html`; `/api/*` goes to `api/index`. `dev-server.mjs` does the same locally (`npm run dev`, port 3000, needs a `.env`).
- `home.html`: top bar, one hard-coded challenge ("The daily pour", a coffee shop landing page, reference built in HTML), prompt box (500 characters), "Build my page" button, result frame, score, fake leaderboard (Maya, Jordan, Alex), a MongoDB test-object card, profile menu, logout dialog. Loads `app.js`, `test-object.js`, `auth-state.js`, `styles.css`, Google Fonts (DM Sans, DM Mono, Manrope).
- `login.html`, `signup.html`: form plus `auth.js`, `styles.css`, `auth.css`.
- `app.js`: the "score" is a fake keyword counter in the browser (four 25-point buckets plus a length bonus). The "built page" is a canned mock that only changes colour by keyword. No model call, no grader call, no save.
- Streak, attempt count and rank are local variables and reset on reload.
- `styles.css` and `auth.css` are tiny line counts but very long lines (inferred: minified or packed).

## Grader service (branch `grader`, `grader/service/`, version 0.6.0)
Plain HTTP server, one grade at a time, queue of 8. Every `/v1/` route needs `Authorization: Bearer <GRADER_API_KEY>` (server-side only). Errors are `{ error }`. Details in `grader/service/README.md`.

| Route | Request | Response |
|---|---|---|
| GET `/health` | none | `{ ok, version, browserReady, sceneBrowserReady, busy, waiting, cachedGoals, cachedScenes }` |
| POST `/v1/grade/site` | `{ goal: {file: html}, candidate: {file: html}, screenshots?: bool }` | `{ result, screenshots? }` (PNG base64 per page) |
| POST `/v1/render/site` | `{ site: {file: html} }` | `{ version, pages: [{ path, width, height, png }] }` (1280 x 800) |
| POST `/v1/grade/scene` | `{ goal: js, candidate: js, views?: bool }` | `{ result, views? }` |
| POST `/v1/render/scene` | `{ code: js }` | `{ version, views: [{ name, width, height, png }] }` (4 views, 384 x 288) |

Codes: 400 bad input or broken goal, 401 key, 413 body over 8 MB, 503 queue full (Retry-After 5), 504 over 55 s.

Score result:
- Site: `total` (0 to 100, bonus up to 120 total), `pillars { works, engineering, looks }` (0 to 100), `engineering { efficiency, accessibility, cleanCode, decidedBy }`, `bonus`, `exactMatch`, `feedback[]`, plus `efficiency`, `pages`, `links` (shapes not read).
- Page grader (library only, not on an HTTP route): `breakdown { content, layout, style, visual }`, `details`, `feedback[]`.
- Feedback: site and page lines are `{ message, points }`, at most 6 to 8, most costly first. `points` is roughly what the total gains if fixed. 3D lines are plain strings with no points.
- Does it return page regions or bounding boxes for lost points? No. Feedback is plain-language text with point costs only. 3D "details" has offsets and placement numbers (shape not read). The page grader's `details` has "missing and extra text, offsets" (shape not read). No heatmap, overlay or diff image is exposed.
- Timings: renders capped at 45 s per submission; request deadline 55 s including queue wait. No typical time is stated (unconfirmed).
- Limits: 40 files, 1.5 MB per site, 300 KB per file. JavaScript off, network blocked in the grader.
- The grader does not call any language model. The step "prompt becomes HTML" has no code anywhere yet.

## Data that exists
- MongoDB `users`: `{ _id, username, email, password (hash) }`, unique indexes on email and username (created on signup). Database name comes from the connection string.
- MongoDB `testObjects`: `{ _id, randomString }`. Throwaway.
- Challenges: none stored. One is hard-coded in `home.html`. Grader goals live in `grader/calibration/` (`sets/landing`, `sets/profile`, `sites/bikes`, `scenes/chair`) as test fixtures, not as a challenge list.
- Attempts, scores, leaderboards, models, credits: no schema, no collection, no code.

## Gaps for a workspace, challenge list, leaderboard and profile
1. No generation endpoint: nothing takes a prompt, calls a model and returns HTML. Needs model keys, a model list and a prompt limit.
2. No submit-and-score endpoint in the web app: nothing calls the grader (`GRADER_URL`, `GRADER_API_KEY` not wired), stores the attempt, or returns the result. Needs a wait of up to about 55 s (polling or a long request).
3. No challenge endpoints: list, detail (title, level, brief, goal pictures, criteria), and a store for goal files and cached goal pictures.
4. No attempts storage or history endpoint (per user, per challenge, with grader `version`).
5. No leaderboard endpoint (per challenge, overall, today) and no best-score or rank logic.
6. No profile endpoint: public profile, stats, streak, solved list. `user` has no extra fields.
7. No region data from the grader, so "where did I lose points" can only be a list of text lines with point costs, not marks on the picture.
8. Sessions are in memory (see above); needs a decision before real users.
9. No rate limit on any route, including the unauthenticated `test-objects` route that writes to the database.
10. Page grader has no HTTP route (only sites and scenes); single-page challenges must go as a one-file site.

## Unconfirmed
- Whether in-memory sessions actually fail on the deployed Vercel site.
- Exact shape of `result.pages`, `result.links`, `details` fields (README names them, shapes not read).
- Whether the grader is deployed anywhere yet; `GRADER_URL` is unknown.
- `docs/vercel.md` and `passwordService.js` were not read.
- Whether YellowCardinal plans more pages or backend work in the next hours.
- Typical grading time (only caps are stated).
- Whether the team keeps the plain static approach or moves to Next.js as `HANDOFF.md` planned. `HANDOFF.md` and the real code disagree.

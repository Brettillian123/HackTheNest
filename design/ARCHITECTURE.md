# promptdyno frontend architecture

_Written 2026-11-14 evening for the build to noon Sunday 2026-11-15. Sources: `research/08-current-site.md` (08), `SPEC.md`, `RULES.md`, `research/03-speed.md`, `research/02-icp-engagement.md`, `HANDOFF.md`. "Guess" marks my own reasoning. Brett's calls are listed in section i._

## a. Stack for the deadline

**Recommend: plain static HTML, CSS and ES modules, no framework and no build step, in a new top-level folder `web/`.** Server code we add lives in `web/api/` as plain Vercel Node functions.

Why: the passing template `workspace-v3.html` is already plain HTML and CSS, so agents copy it instead of porting it, and it matches the teammate's `frontend/` style so the two can merge later. No install, config or hydration; each page and component is its own file, so parallel agents never share one, and tiny static pages meet LCP and INP with little work.

**Assumption:** the team accepts a second folder and a second Vercel project for the demo. **Alternative:** Next.js App Router in `web/` as `HANDOFF.md` planned (better prefetch and caching, about 1 to 2 hours of setup and a new toolchain).

**Folder rule.** Everything new is under `web/`. Nothing in `frontend/`, `backend/`, `api/`, `lib/`, `vercel.json`, `dev-server.mjs` or `grader/` is edited.

**Deploy beside the existing site.** A second Vercel project with Root Directory `web`, its own `web/vercel.json`:
- Clean URLs rewrite to pages (`/c/:slug` to `/workspace.html`, `/u/:name` to `/profile.html`, `/leaderboard/:slug` to `/leaderboard.html`).
- `/api/auth/*` rewrites to the existing site's `/api/auth/*`, so the login cookie stays same-origin. (Guess: Vercel external rewrites pass `Set-Cookie` through. Unconfirmed.)
- Other `/api/*` are served by `web/api/`. Local run: `npx vercel dev` in `web/` (guess; or `npx serve web` for pages with mock data).

## b. Site map

| Screen | URL | States | Primary action | Sign-in | When |
|---|---|---|---|---|---|
| Landing | `/` | default | "Try the first challenge" | no | deadline |
| Challenge list | `/challenges` | loading, list, error | Open a challenge | no | deadline |
| Workspace | `/c/:slug` | idle, generating, grading, scored, error, cancelled (section f) | "Run prompt" / "Run again" | no | deadline |
| Leaderboard | `/leaderboard`, `/leaderboard/:slug?b=1` | loading, rows, empty bracket, error | Switch bracket tab | no | deadline |
| Profile | `/u/:name` | loading, filled, empty, not found | "Open next challenge" | no to view | deadline (minimal: best scores, solved list) |
| Log in | `/login` | form, submitting, error | "Log in" | no | deadline |
| Sign up | `/signup` | form, submitting, error, claimed | "Create account" | no | deadline |
| Not found | any unknown path | one | "Go to challenges" | no | deadline |
| Plans (paid depth) | `/plans` | default | "Choose a plan" | yes | later (designed now) |
| Shared result | `/r/:runId` | default, not found | "Try this challenge" | no | later |
| Account settings | `/settings` | form | "Save changes" | yes | later |

Deadline: 8 screens. Later: 3. The landing first screen shows a real goal page in a specimen frame and a real rail (SPEC d). No popups anywhere; sign-up is a page, not a modal. No team or classroom view.

## c. User flows

**First visit to first score, no account.** `/` > "Try the first challenge" > `/c/starter` (goal shown, prompt box focused, draft restored if any) > type > Ctrl+Enter > page streams into the frame > grading stages > score, rail and costs. On first load `identity.js` makes a random `anonId` and keeps it in localStorage; every run sends it. Target: under 60 s from landing to score (guess).

**Sign up after a score keeps the score.** Scored state shows a quiet line "Sign up to save this score and join the leaderboard" (text link, not a popup) > `/signup?next=/c/starter` > POST `/api/auth/signup` (exists) > POST `/api/attempts/claim { anonId }` moves anonymous attempts to the new user > back to `next`, scored state restored from the attempt. Anonymous scores do not appear on leaderboards until claimed.

**Returning player.** `/` or `/challenges` > top bar shows the username (from GET `/api/auth/me`) > list marks best score per challenge > open one > workspace restores the local draft and the last attempt's score > "Run again" continues the same attempt (prompt count goes up) or "Start over" begins a new attempt.

**Prompt count (assumption, see i).** An attempt is a chain of runs on one challenge. Run n sends its prompt plus the HTML from run n-1. The attempt's prompt count is its number of runs; its leaderboard score is its best run.

## d. Shared pieces

All paths under `web/`. One file per piece.

| Piece | Files | Used by |
|---|---|---|
| Theme tokens (colours, fonts, sizes, spacing, radius). Colourway lives only here | `css/tokens.css` | all |
| Base: reset, type roles, hairlines, 40 px padding, focus ring | `css/base.css` | all |
| Button, text input, textarea, model picker | `css/controls.css` | workspace, auth, leaderboard |
| Table row (header, cost row, leaderboard row) | `css/table.css` | workspace, leaderboard, list, profile |
| Fonts (IBM Plex Sans 400/600, Plex Mono 400/600, self-hosted woff2) | `fonts/*` | all |
| Layout shell: top bar markup pattern, brand mark from rail ticks, auth fill | `components/shell.css`, `components/shell.js` | all |
| Rail (100 ticks, brackets, dim on hover) | `components/rail.js`, `components/rail.css` | workspace, landing, profile |
| Score display (48 px number bound to the rail, 300 ms count-up) | `components/score.js` | workspace, landing |
| Cost list (3 rows plus "N of M checks passed" link) | `components/costs.js` | workspace |
| Specimen frame (sandboxed iframe, 60 percent scale, Yours/Goal tabs, throttled streaming) | `components/specimen.js`, `components/specimen.css` | workspace, landing |
| Stage list (named grading stages, Cancel) | `components/stages.js` | workspace |
| Bracket tabs (1, 2, 3 to 5, 6 to 10, 11+) | `components/brackets.js` | leaderboard, profile |
| Skeleton rows (same height as real rows) | `components/skeleton.css` | list, leaderboard, profile |
| API client with mock switch | `js/api.js`, `js/config.js` | all |
| Anonymous id | `js/identity.js` | workspace, auth |
| Draft store (localStorage per challenge) | `js/draft.js` | workspace |
| Hover prefetch for internal links | `js/prefetch.js` | all |

The top bar HTML is written into each page (no client render) so nothing shifts; `shell.js` only fills the user name.

## e. Data and API contract

Owner of every "needed" endpoint: unknown. All JSON unless stated. Errors are `{ error }` with plain text.

| Method and path | Request | Response | Status |
|---|---|---|---|
| POST `/api/auth/signup` | `{ username, email, password }` | 201 `{ user: { id, username, email } }` + cookie; 400, 409, 502/503 | exists |
| POST `/api/auth/login` | `{ email, password }` | 200 `{ user }` + cookie; 401 | exists |
| GET `/api/auth/me` | cookie | 200 `{ user }` or 401 | exists |
| POST `/api/auth/logout` | none | 200 `{ ok: true }` | exists |
| POST `/api/generate` | `{ challenge, prompt, model, attemptId?, anonId }` | 200 `text/html` stream of the page; headers `X-Attempt-Id`, `X-Run-Id`, `X-Prompt-Count`. 429 when the free run cap is hit | needed |
| POST `/api/runs/:runId/score` | none | 202 `{ jobId }` | needed |
| GET `/api/jobs/:jobId` | none | `{ status: queued, grading, done, error, cancelled, result? }`; `result` = `{ total, pillars, feedback: [{ message, points }] }` from the grader | needed |
| DELETE `/api/jobs/:jobId` | none | 200 `{ ok: true }` (best effort) | needed |
| GET `/api/attempts?challenge=slug` | cookie or `anonId` | `{ attempts: [{ id, promptCount, best, runs: [{ id, prompt, total, at }] }] }` | needed |
| POST `/api/attempts/claim` | `{ anonId }` + cookie | `{ moved: n }` | needed |
| GET `/api/leaderboards/:slug?b=1` | `b` in 1, 2, 3-5, 6-10, 11+ | `{ rows: [{ rank, username, promptCount, score }], me?: { rank, score } }` | needed |
| GET `/api/users/:username` | none | `{ username, solved: [{ slug, best, promptCount }], totals }` | needed |
| GET `/api/challenges` | none | `{ challenges: [{ slug, title, level, brief }] }` | later; static `data/challenges.json` for the deadline |

Needed for the deadline: 8 endpoints. Later: 1. The test-objects route (exists) is not used.

Notes:
- Challenges ship as static files: `web/data/challenges.json` plus `web/data/goals/:slug.html`, copied (read only) from `grader/calibration/`. The score function reads the goal from the same deploy. Fast, and no endpoint to build.
- Grading uses a job id and 1 s polling, not a stream (03 finding 19: proxies buffer streams; polling survives a refresh). The score function calls the grader's POST `/v1/grade/site` with the server-side key and saves the result in a Mongo `jobs` collection. (Guess: Vercel `waitUntil` lets the grade finish after the 202. Unconfirmed.)
- The grader reports no stages, so stage names are estimated on the client by elapsed time and labelled "estimated" (03 finding 3).
- **Mock mode.** `js/config.js` holds `API_MODE = "mock" | "live"`, overridable by `?mock=1`. In mock mode `api.js` reads `web/mock/*.json`, fakes the stream by sending the goal HTML in chunks over 4 s, and fakes a job that walks the stages over 6 s and returns a fixed result. Any "needed" endpoint answering 404 in live mode falls back to mock with a console warning. Every screen can be built and screenshotted now.

## f. Workspace run pipeline

Prompt box and model picker stay editable in every state. The prompt is never cleared. Ctrl+Enter runs; Esc cancels.

| State | Enter on | Rail | Frame | Button area |
|---|---|---|---|---|
| idle | load, or new attempt | all red, or last score dimmed to 30 percent | Goal page, caption "Goal" | primary "Run prompt", hint "Ctrl+Enter" |
| generating | Run (button reacts in under 100 ms) | as before, 30 percent | Yours tab; page grows from the stream, `srcdoc` updated every 200 ms; caption "Writing your page" | primary disabled "Running"; secondary "Cancel" |
| grading | stream ends | as before | finished page, still | stage list in the cost area: Rendering, Checking layout, Comparing to goal, Scoring. Over 10 s: "Usually under 45 s". Secondary "Cancel" |
| scored | job `done` | earned ticks turn light in 300 ms, brackets drawn per cost row | Yours/Goal tabs active | primary "Run again", 3 cost rows, sign-up line if anonymous |
| error | stream or job fails, 429, 503 | unchanged | keeps what streamed | one line: what happened and what to do ("The grader is busy. Run again in 5 s."); primary "Run again" |
| cancelled | Cancel or Esc | unchanged | keeps what streamed | caption "Run cancelled"; primary "Run prompt" |

Transitions: idle > generating > grading > scored. generating or grading > cancelled (aborts the fetch, DELETE the job). Any > error. error, cancelled, scored > generating on Run. One run at a time; Run while running is ignored.

## g. Speed plan

| Target | All screens | Differs per screen |
|---|---|---|
| Click under 100 ms, INP 200 ms or less | No framework; handlers do DOM changes only; stream updates throttled to 200 ms; plain textarea; no long tasks over 50 ms | Workspace: draft save debounced 300 ms |
| LCP 2.5 s or less | Static HTML, inline critical CSS from tokens and base, 2 preloaded woff2 files with `font-display: swap`, no third-party scripts | Landing: goal page in the frame is static HTML, not fetched. List: rendered from static JSON in the first paint |
| CLS 0.1 or less | Top bar in HTML; fixed-size specimen (768 x 480) and rail band (128); skeleton rows 40 px; costs area keeps its height in every state | Leaderboard: tab switch keeps row count height |
| Waits over 10 s | Named stages, "usually" time, Cancel | Workspace only |
| Navigation | `prefetch.js` adds `<link rel="prefetch">` on hover or focus of internal links | Leaderboard and profile API responses sent with `Cache-Control: s-maxage=30, stale-while-revalidate=300` |
| Never lose text | `draft.js` saves per challenge; restored on load | Workspace only |

## h. Build plan

No two pieces share a file. Waves respect five agents at most and one heavy job (browser screenshots) at a time.

| # | Piece | Files (all under `web/`) | Depends on | Proof | When |
|---|---|---|---|---|---|
| 1 | Foundation | `css/tokens.css`, `css/base.css`, `css/controls.css`, `css/table.css`, `components/skeleton.css`, `fonts/*`, `vercel.json`, `dev/kitchen.html` | none | screenshot of kitchen page: type roles, buttons, inputs, table rows match SPEC c | deadline |
| 2 | Shell and helpers | `components/shell.css`, `components/shell.js`, `js/prefetch.js`, `js/identity.js` | 1 | screenshot of `dev/shell.html` at 1280 and 375 wide, logged in and out (mock) | deadline |
| 3 | API client and mocks | `js/api.js`, `js/config.js`, `mock/*`, `data/challenges.json`, `data/goals/*`, `tests/api.test.mjs` | none | `node --test web/tests` passes | deadline |
| 4 | Rail, score, costs | `components/rail.js`, `components/rail.css`, `components/score.js`, `components/costs.js`, `tests/rail.test.mjs`, `dev/rail.html` | 1 | test checks tick x positions and bracket spans (SPEC e1, e9); one screenshot | deadline |
| 5 | Specimen and stages | `components/specimen.js`, `components/specimen.css`, `components/stages.js`, `dev/specimen.html` | 1, 3 | screenshot mid-stream and after, mock mode | deadline |
| 6 | Workspace page | `workspace.html`, `js/workspace.js`, `js/draft.js` | 2, 3, 4, 5 | 6 screenshots, one per state, passing SPEC e at 1280 x 800 | deadline |
| 7 | Landing | `index.html`, `css/landing.css` | 2, 4, 5 | screenshot; 12 text elements or fewer | deadline |
| 8 | Challenge list | `challenges.html`, `js/challenges.js` | 2, 3 | screenshot with data and skeleton | deadline |
| 9 | Leaderboard | `leaderboard.html`, `js/leaderboard.js`, `components/brackets.js` | 2, 3 | screenshot of two brackets and an empty bracket | deadline |
| 10 | Auth pages and claim | `login.html`, `signup.html`, `js/auth-pages.js` | 2, 3 | real sign-up against the existing API, then claim call in mock | deadline |
| 11 | Profile and 404 | `profile.html`, `js/profile.js`, `404.html` | 2, 3, 9 | screenshot filled and empty | deadline |
| 12 | Generate function | `api/generate.js`, `api/_lib/model.js` | 3 (contract) | one real streamed run on `vercel dev` | deadline, needs team OK on owner and model key |
| 13 | Score and jobs functions | `api/runs/[runId]/score.js`, `api/jobs/[jobId].js`, `api/_lib/grader.js`, `api/_lib/db.js` | 12 | one real grade from the grader service returns a job result | deadline, needs `GRADER_URL` |
| 14 | Attempts, leaderboard, profile functions | `api/attempts/index.js`, `api/attempts/claim.js`, `api/leaderboards/[slug].js`, `api/users/[username].js` | 13 | `node --test` against a test database | deadline if time, else mock stays |
| 15 | Plans, shared result, settings | `plans.html`, `r.html`, `settings.html`, their `js/*` | 6 | screenshots | later |

Order: wave 1 = pieces 1 and 3 (no shared files, no browser). Wave 2 = 2, 4, 5, 12. Wave 3 = 6, 7, 8, 9, 13. Wave 4 = 10, 11, 14. Screenshots run one at a time.

## i. Open decisions for Brett

1. **Stack and folder.** Recommend static HTML in `web/` (section a). Alternative: Next.js in `web/`.
2. **Deploy.** Recommend a second Vercel project rooted at `web/`, proxying `/api/auth/*` to the existing site. Alternative: ask the teammate to add `web/` routes to the root `vercel.json`.
3. **Prompt count meaning.** Recommend: runs chain, each refines the last page; count = runs in the attempt. Alternative: each run is fresh and count = runs until the best score.
4. **Who builds pieces 12 to 14** (server functions). Recommend: us, inside `web/api/`, after telling the team. Alternative: the teammate adds them to `backend/`.
5. **Sessions.** In-memory sessions may drop on Vercel (08). Recommend asking the teammate to move them to Mongo. Alternative: accept the risk for the demo.
6. **Colourway.** Tokens use SPEC's dark values until one is picked; changing it touches only `css/tokens.css`.
7. **Free run cap number** (02 element 12). Recommend 10 a day per `anonId` or user for the demo. Alternative: no cap until after judging.

## Unconfirmed

- Real generation and grading times; whether the grader is deployed and its URL.
- Whether Vercel external rewrites keep `Set-Cookie` for the auth proxy.
- Whether `waitUntil` keeps the grade running after the 202 on the team's Vercel plan.
- Which model and key generation uses; whether event credits exist.
- Whether `srcdoc` updates every 200 ms flicker (03 finding 2, untested).
- Whether shown costs sum to at most 100 minus the score (SPEC c bracket rule).
- Whether the teammate plans more work on `frontend/` that would overlap these screens.

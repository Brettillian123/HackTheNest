# promptdyno backend

Node ES modules on Vercel. `api/index.js` (and the thin files in `api/auth/`) call `handleApiRequest` in `route/api.js`; game routes are in `route/game.js` → `controller/gameController.js`. Errors are always `{ "error": "plain message" }`.

**Player**: a signed-in user (session cookie `promptdyno_session`, a signed token any function instance can verify) or an anonymous player sent as header `X-Anon-Id` (16–64 of `A-Z a-z 0-9 _ -`). "Player" below means either.

## Endpoints

| Method | Path | Request | Response | Auth |
|---|---|---|---|---|
| POST | `/api/auth/signup` | `{ username, email, password }` | 201 `{ user }` + cookie | none |
| POST | `/api/auth/login` | `{ email, password }` | `{ user }` + cookie | none |
| GET | `/api/auth/me` | | `{ user }` or 401 | cookie |
| POST | `/api/auth/logout` | | `{ ok: true }`, cookie cleared | none |
| GET | `/api/health` | | `{ ok, db, models: [ids], grader: "service"\|"standin", challenges, problems: [] }` | none |
| GET | `/api/challenges` | | `{ challenges: [{ slug, title, level, levelLabel, brief, solvedCount, topScore, yourBest, yourBestPrompts }], statsAvailable }` | optional player |
| GET | `/api/challenges/:slug` | | `{ challenge: { ...summary, goalUrl, viewport, spec, models: [{ id, label, available }], simulated }, statsAvailable }` | optional player |
| POST | `/api/runs` | `{ slug, prompt (1–2000 chars), model? }` | streamed cleaned `text/html`; headers `X-Run-Id`, `X-Attempt-Id`, `X-Prompt-Count` (the count this run gets if it completes), sandboxing `Content-Security-Policy`. 400 for page code in the prompt; 503 `{ error, code: "no_model" }` with no model key; 429 + `Retry-After` over a daily cap | player |
| POST | `/api/runs/:runId/score` | | `{ attempt, run }`, `run.result` = `{ total, delta, checks: [{ label, passed }], passedCount, totalChecks, costs: [{ points, message }], rank: { before, after }\|null, provisional, notice? }`. 502 when the grader answers but cannot grade (nothing stored; score again) | player (owner) |
| GET | `/api/attempts/current?slug=` | | `{ attempt: { id, slug, promptCount, best, bestPromptCount, open, startedAt, runs: [{ id, n, prompt, model, status, html, result, at }] } \| null }` | player |
| POST | `/api/attempts/start-over` | `{ slug }` | `{ ok: true, closed }` | player |
| POST | `/api/attempts/claim` | header `X-Anon-Id` (or body `{ anonId }`) | `{ moved }` (idempotent) | cookie |
| GET | `/api/leaderboards?slug=&bracket=all\|1\|2\|3-5\|6-10\|11+&period=week\|all` | | `{ rows: [{ rank, username, promptCount, score, isYou }], you: { rank, score, promptCount }\|null, counts: { bracket: n }, kind: "score"\|"points", provisional }` | optional player |
| GET | `/api/users/:username` | | `{ username, joined, totals: { solved, best, averagePrompts, points, level }, solved: [{ slug, title, best, promptCount, when }] }`, 404 unknown | none |
| GET | `/api/players/me` | | `{ user\|null, points, level, bests: { slug: score } }` | optional player |

Notes: a run's `n` is its prompt number in the attempt. A board entry is a player's best scored run (higher score, then fewer prompts, then earlier); a bracket only counts runs with that prompt number. No `slug` gives the overall board (points = sum of best scores, prompts = average). Only signed-in users appear in `rows`; anonymous players still get `you`. `run.status` is `generating`, `done`, `failed` or `cancelled`; only `done` runs can be scored. A run adds to the prompt count only once its page is fully generated and saved; a run that fails or is cancelled mid-stream is discarded (the daily cap still counts it). **The client should call score for any run whose `result` is `null` or `provisional: true`**: an unscored run can be scored at any later time, and a provisional score is graded again (and replaced) once the grader service is configured; a final score is returned as saved. Boards, profiles and totals use provisional scores only while no grader service is configured (`provisional: true` on the board then). Challenge stats (`solvedCount`, `topScore`) are cached for 30 s per function instance. Prompts are refused (400, "Describe the page in your own words. Prompts cannot contain page code.") when they share over 120 characters with the goal's source (ignoring whitespace) or contain more than 5 HTML tags or 5 CSS rule blocks (`PROMPT_RULES` in `services/gameService.js`).

Known limit: sessions are stateless signed tokens, so logout clears the cookie but cannot revoke a copied token; it expires 24 hours after sign-in.

## Environment variables

| Name | Meaning |
|---|---|
| `MONGODB_URI` | MongoDB connection string (collections `users`, `attempts`, `runs`, `usage`; indexes made on first use) |
| `AUTH_SECRET` | Signs session tokens. If empty, a key derived from `MONGODB_URI` is used |
| `OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY` | Each enables one model (`openai-mini`, `gemini-flash`, `claude-haiku`) |
| `OPENAI_MODEL`, `GEMINI_MODEL`, `ANTHROPIC_MODEL` | Optional provider model ids (defaults `gpt-6-luna`, `gemini-3.8-flash`, `claude-haiku-5-5`) |
| `GRADER_URL`, `GRADER_API_KEY` | The real grader service (below) |
| `GRADER_TIMEOUT_MS` | Optional grade time budget, default 45000 (fits the 60 s function limit) |
| `RUNS_PER_DAY` | Runs per player per UTC day, default 30 |
| `RUNS_PER_IP_PER_DAY` | Runs per IP per UTC day for every player, signed in or not; default 10 x `RUNS_PER_DAY` (300), for a shared venue network |
| `RUNS_PER_DAY_TOTAL` | Runs across all players per UTC day, default 1500 |

## How to plug in the real grader

Set `GRADER_URL` (for example `https://grader.example.com`) and `GRADER_API_KEY` in the Vercel project and redeploy. `/api/health` then shows `"grader": "service"` and results come back with `provisional: false`. Without them, the stand-in scorer (`services/grader/standin.js`, no browser) is used and results are `provisional: true`. If the service times out or stays busy after one retry, that run falls back to the stand-in and `result.notice` says why. Code: `services/grader/index.js`.

## How to add a challenge

1. Add the goal page as `web/data/goals/<slug>.html` (one HTML file, inline CSS, under 300 KB).
2. Add one entry to `web/data/challenges.json` → `challenges`: `{ slug, title, level, brief, spec }` (`viewport` optional; the top-level one is the default).

Slugs are lowercase letters, digits and dashes. A bad entry is skipped and listed in `/api/health` `problems`. The files ship with the function through `includeFiles` in `vercel.json`.

## Run and test

- `npm run dev:web` serves `web/` and the API on port 3000 with the `vercel.json` routing (reads `.env` if present).
- `npm test` (`node --test "backend/tests/*.test.mjs"`) drives the real router with fake requests, an in-memory store (`store/memoryStore.js`) and fake fetch. No database, model key or grader needed.
- The MongoDB store shares the store suite in `tests/store.test.mjs`; it runs only with `TEST_MONGODB_URI` set to a throwaway database.

# promptdyno backend

Node ES modules on Vercel. `api/index.js` (and the thin files in `api/auth/`) call `handleApiRequest` in `route/api.js`; game routes are in `route/game.js` → `controller/gameController.js`. Errors are always `{ "error": "plain message" }`.

**Player**: a signed-in user (session cookie `promptdyno_session`, a signed token any function instance can verify) or an anonymous player sent as header `X-Anon-Id` (16–64 of `A-Z a-z 0-9 _ -`).

## Endpoints

| Method | Path | Request | Response | Auth |
|---|---|---|---|---|
| POST | `/api/auth/signup`, `/api/auth/login` | `{ username, email, password }` / `{ email, password }` | `{ user }` + cookie | none |
| GET / POST | `/api/auth/me` / `/api/auth/logout` | | `{ user }` or 401 / `{ ok: true }` | cookie |
| GET | `/api/health` | | `{ ok, db, models, grader: "service"\|"standin", graderVersion?, challenges, problems }` | none |
| GET | `/api/challenges[?include=lessons]` | | `{ challenges: [{ slug, title, level, levelLabel, brief, kind, available, lesson?, solvedCount, topScore, yourBest, yourBestPrompts }], statsAvailable }` | optional player |
| GET | `/api/challenges/:slug` | | `{ challenge: { ...summary, goalUrl (page only, else null), viewport, spec, models: [{ id, label, available }], simulated, criteria?, unavailableReason? } }` | optional player |
| GET | `/api/lessons` | | `{ lessons: [{ slug, title, level, minutes, summary, file, bonusChallenge, grader, order }] }` (from `web/data/lessons/`, sorted by `order`; `[]` without the folder) | none |
| GET | `/api/lessons/:slug` | | `{ lesson: { ...entry, fields: {front matter}, markdown } }`, 404 unknown | none |
| POST | `/api/runs` | `{ slug, prompt (1–2000 chars), model? }` | streamed output (`text/html` for page, `text/markdown` for doc); headers `X-Run-Id`, `X-Attempt-Id`, `X-Prompt-Count`. 400 page code in the prompt; 501 kind not playable yet; 503 `code: "no_model"`; 429 + `Retry-After` | player |
| POST | `/api/runs/:runId/score` | | `{ attempt, run }` with `run.result` (below) and `run.graderResult`. 502 grader answered without a total; 503 `code: "no_grader"` (doc with no grader) or grader unreachable | player (owner) |
| GET | `/api/attempts/current?slug=` | | `{ attempt: { id, slug, promptCount, best, bestPromptCount, open, startedAt, runs: [{ id, n, kind, prompt, model, status, html \| markdown, result, at, graderResult (latest run only) }] } \| null }` | player |
| POST | `/api/attempts/start-over` / `/api/attempts/claim` | `{ slug }` / header `X-Anon-Id` | `{ ok, closed }` / `{ moved }` | player / cookie |
| GET | `/api/leaderboards?slug=&bracket=all\|1\|2\|3-5\|6-10\|11+&period=week\|all` | | `{ rows: [{ rank, username, promptCount, score, isYou }], you, counts, kind: "score"\|"points", provisional, graderVersions }` | optional player |
| GET | `/api/users/:username` / `/api/players/me` | | `{ username, joined, totals, solved }` / `{ user\|null, points, level, bests }` | none / optional player |

**`run.result`**: `{ total, delta, checks: [{ label, passed }], passedCount, totalChecks, costs: [{ points, message }], rank: { before, after } | null, provisional, notice?, graderVersion?, pillars?: [{ id: works|engineering|looks, label, value }], engineering?: { efficiency, accessibility, cleanCode, decidedBy }, bonus?, exactMatch?, criteria?: [{ id, name, group, value: 0..1 | null, notes }], rejectedReason? }`. Totals are 0–120 with one decimal (the stand-in gives 0–100); `costs` come from the grader's `criteriaFeedback` when present, else `feedback`. `rejectedReason` means the grader could not grade the submission (stored as 0; show the reason). `run.graderResult` is the grader's raw result without `measurements`, sent only on the score response and for the latest run in `attempts/current`.

Rules: a run adds to the prompt count only once its output is fully generated and saved; a failed or cancelled run is discarded (the daily cap still counts it). **The client should call score for any run whose `result` is `null` or `provisional`.** A saved result is graded again and replaced when it is provisional while the grader is configured, or when its `graderVersion` differs from the live grader's. Provisional scores never count on boards, profiles, points or solved counts; with no grader configured boards are empty with `provisional: true`. `graderVersions` lists the versions among a board's rows. Board entries: best scored run (higher score, fewer prompts, earlier); a bracket counts runs with that prompt number; no `slug` = overall (points = sum of best scores). Challenge stats are cached for 30 s per instance. Page prompts are refused when they share over 120 characters with the goal source or hold over 5 tags or CSS rule blocks (`PROMPT_RULES`).

Known limit: sessions are stateless signed tokens, so logout clears the cookie but cannot revoke a copied token; it expires 24 hours after sign-in.

## Challenge kinds (`services/kinds.js`, one row per kind)

| `kind` | Goal file | Model output | Grader route | State |
|---|---|---|---|---|
| `page` (default) | `web/data/goals/<slug>.html` | one HTML file, cleaned (allow-list, inline SVG and `data:` images kept) | `/v1/grade/site`, one file each | proven with fakes; grader live |
| `doc` | `web/data/rubrics/<slug>.json` (lesson challenges too) | Markdown (JSON for `mcp-tools`), stored as text in `markdown` (client must render it safely) | `/v1/grade/doc` `{ kind, rubric, candidate }`; `kind` is the grader's document kind (`instructions`, `readme`, `skill`, `mcp-tools`) from the challenge's `docKind`, a string `kind` in the rubric, or the table in `kinds.js` | live in grader 0.8.0; no stand-in |
| `workflow` | `web/data/rubrics/<slug>.json` | a plan as JSON, streamed as `text/plain`, stored as text in `markdown`; not JSON scores 0 with a plain reason and no grader call | `/v1/grade/workflow` `{ rubric, candidate }` | live in grader 0.8.0; no stand-in |
| `site`, `scene` | | | | listed with `available: false`; runs answer 501 |

An optional `marks` value on a challenge entry is sent next to `goal` in the grade request (reserved by the grader).

## Environment variables

`MONGODB_URI`; `AUTH_SECRET` (else derived from `MONGODB_URI`); `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` (each enables a model) and optional `OPENAI_MODEL`, `ANTHROPIC_MODEL` (defaults `gpt-6-luna`, `claude-haiku-5-5`); `GRADER_URL`, `GRADER_API_KEY`, `GRADER_TIMEOUT_MS` (default 45000); `RUNS_PER_DAY` (30), `RUNS_PER_IP_PER_DAY` (10 x `RUNS_PER_DAY`), `RUNS_PER_DAY_TOTAL` (1500). Names only in `.env.example`.

## How to plug in the real grader

Set `GRADER_URL` (plain `http` works, for example `http://<server-ip>:8080`) and `GRADER_API_KEY` in the Vercel project and redeploy. `/api/health` then shows `"grader": "service"` and the live `graderVersion`; results come back with `provisional: false`. Without them, page runs get the stand-in scorer (`services/grader/standin.js`) and are provisional. If the service times out or stays busy after one retry, a page run falls back to the stand-in with `result.notice`. Code: `services/grader/index.js`.

## How to add a challenge or lesson

1. Add the goal: `web/data/goals/<slug>.html` (page) or `web/data/rubrics/<slug>.json` (doc).
2. Add one entry to `web/data/challenges.json` → `challenges`: `{ slug, title, level, brief, spec, kind?, marks?, viewport? }`.
3. Lessons: `web/data/lessons/index.json`, `web/data/lessons/NN-slug.md`, and bonus challenges in `web/data/lessons/challenges.json` (same entry shape plus `kind` and `criteria`); `LESSONS_DIR` overrides the folder.

A bad entry is skipped (or listed as unavailable) and reported in `/api/health` `problems`. Files ship with the function through `includeFiles` in `vercel.json`.

## Run and test

- `npm run dev:web` serves `web/` and the API on port 3000 with the `vercel.json` routing (reads `.env` if present).
- `npm test` drives the real router with fake requests, an in-memory store and fake fetch (models and grader in the README's shapes). The MongoDB store runs the shared store suite only with `TEST_MONGODB_URI` set to a throwaway database.

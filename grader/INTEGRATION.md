# Grader: what the site and backend need to know

_Written 2026-11-15, about 08:00, updated 10:35 when grader 0.8.0 went live, by the grader session for the session building `web/` and `backend/`. It was checked against `origin/main` at commit `9ded75b` (`backend/services/grader/index.js`). Everything described here is live on the server as of 10:35 unless it says otherwise. Results from before then lack the newer fields, so read them defensively._

## 1. Live now

- **Server:** `GRADER_URL=http://64.177.10.74:8080` (plain `http`, no TLS). `GRADER_API_KEY` is on the server; Brett reads it himself. Keep the key on the server side of the app only.
- **Version live:** 0.9.2, the final copy for the presentation (0.9.0 from about 17:45 on 2026-11-15, 0.8.0 before that, 0.6.0 until 10:35; scores from different versions are not comparable, so drop cached grades). 0.9.2 weighs works 30, engineering 45, looks 25 and averages 1.1 points from the by-eye band on 34 real model runs; higher levels are harder to score high on (70 or more is solid at levels 2 and 3). Do NOT send the `intent` field: the brief-based scorer is not the scorer. `POST /v1/check/prompt` (copy check) is on the server. The goal cache holds 16 goals; the first grade against any other goal takes a few seconds longer. `GET /health` (no key) returns `{ ok, version, browserReady, busy, waiting, ... }`.
- **Routes** (all `POST`, JSON, `Authorization: Bearer <key>`): `/v1/grade/site`, `/v1/render/site`, `/v1/grade/scene`, `/v1/render/scene`, `/v1/grade/doc`, `/v1/grade/workflow`. Full shapes are in `grader/service/README.md`.
- **A single page is a one-file site.** There is no page route. What the backend sends today, `{ goal: { 'index.html': goalHtml }, candidate: { 'index.html': html } }`, is right.
- **Speed:** about 4 to 7 seconds per grade for sites and 3D; the first grade against a new goal 9 to 13 seconds; document and workflow grades take about a tenth of a second (the goal is rendered once, then cached). One grade runs at a time; up to 8 wait; beyond that the answer is 503 with `Retry-After: 5`. The backend's 45-second budget and single retry are fine.
- **Same input, same score, always.** A grade can safely be cached by a hash of goal plus submission.

## 2. Changes worth making in the backend

These are the things the adapter does today that will lose information.

1. **Do not clamp the total at 100.** `mapServiceResult` does `Math.min(100, Math.round(total))`. A submission that matches the goal exactly and is smaller and faster than the goal scores above 100, up to 120. That is a decision of Brett's ("they should be able to score above 100"). Boards, the points sum and any progress bar need to allow 120.
2. **Keep one decimal.** Totals come with one decimal place. Rounding to a whole number creates ties on the boards that the grader had separated.
3. **Store the grader's version with every run** (`result.version`). Scores from different versions are not comparable; the rules are changing this morning. A run whose stored version differs from the live one could be re-graded the way provisional runs are now (you store the submission, and grading is repeatable).
4. **Store the grader's whole result, not only the mapped one** (or at least `pillars`, `engineering`, `links`, `bonus`, `exactMatch`, `feedback`, and `criteria` when present). The report card in section 4 is built from it.
5. **The engineering pillar is not only "Clean code".** `PILLARS.engineering` is labelled `'Clean code'`. It is the weakest of three measures: size and speed, accessibility, clean code. `result.engineering` is `{ efficiency, accessibility, cleanCode, decidedBy }`, each 0 to 100; `decidedBy` names the one that set the mark. Suggested labels: works = "It works", engineering = "Well engineered", looks = "Looks like the goal".
6. **Feedback is the list to show the player.** For sites it is `{ message, points }[]`, most costly first. For 3D it is `string[]` (no points). The adapter already handles both.
7. **A submission that cannot be graded** comes back as HTTP 200 with `total: 0` and the reason in `result.error` (too many files, a file over 300 KB, no HTML). The adapter treats that as "rejected" and shows a generic line; show `result.error` to the player instead, since it tells them what to fix.

## 3. What the model must be told when it generates

The grader renders with page JavaScript off and the network off, at 1280 x 800. A page is graded down to 6000 px of height. So the generation prompt (system side) should require:

- one self-contained HTML file per page: CSS inline or in the site's own `.css` files, pictures as inline SVG or `data:` URIs;
- no web fonts, CDNs, remote images or scripts the page depends on. Such a reference fails to load and counts against clean code, and a page that needs JavaScript to draw renders empty;
- system fonts only. The server has Arial, Georgia and Courier New (and metric-compatible fallbacks).

Limits per submission: 40 files, 1.5 MB in total, 300 KB per file, 20 pages. Paths are plain relative paths (`about.html`, `css/site.css`); the home page is `index.html`.

## 4. New in 0.8.0 (live)

The result of `/v1/grade/site` keeps every field it had in 0.6.0. It gains:

- `criteria`: `{ id, name, group: 'works' | 'looks' | 'engineering', value: 0..1 | null, notes: string[] }[]`. This is the report card: named criteria such as Key facts, Completeness, Navigation, Colour, Typography, Size, Accessibility, each with up to three notes naming the page and the thing. It is the best thing to show a player, because it says what to change in the prompt. `value: null` means the goal has nothing that criterion applies to.
- `criteriaFeedback`: `{ message, points }[]`, at most eight lines, grouped by criterion. When present, prefer it to `feedback`.
- `measurements`: raw numbers behind the score. For storage and debugging; do not show it.

Scores changed with this version (it marks more like a person: wrong prices and dead links cost more, small spacing differences cost less). Stored scores from 0.6.0 should be re-graded or labelled by version. On single pages the criteria are reported for feedback; the page total is not yet computed from them, so criterion values and the total can disagree a little.

Optional and not built yet: a challenge author's **marks** file (which components of the goal are critical, which texts must be exact). If it lands, it will be an optional `marks` field next to `goal` in the request. A `marks` key in a challenge entry can be reserved for it now; nothing breaks without it.

## 5. Other kinds of challenge

`web/data/challenges.json` has no `kind` yet; everything is a single page. A `kind` field would let the same run flow serve the rest:

| `kind` | Goal stored as | Model output | Route | Live? |
|---|---|---|---|---|
| `page` (today) | one HTML file | one HTML file | `/v1/grade/site` with one file each | yes |
| `site` | a folder of files | several files (parse the model's reply into `path -> text`) | `/v1/grade/site` | yes |
| `scene` | JavaScript defining `function buildScene(THREE)` | the same | `/v1/grade/scene` (`{ goal, candidate }` as code strings) | yes |
| `doc` | a rubric (JSON) written by the challenge author | Markdown, or JSON tool definitions | `/v1/grade/doc` (`{ kind, rubric, candidate }`; rubric format in `grader/src/docs/README.md`, examples in `grader/calibration/docs/`) | yes |
| `workflow` | a rubric (JSON) | a plan as JSON | `/v1/grade/workflow` (`{ rubric, candidate }`; rubric format in `grader/src/workflow/README.md`, examples in `grader/calibration/workflow/`) | yes |

- For `site` and `scene`, goal pictures come from `/v1/render/site` and `/v1/render/scene` (base64 PNGs; four views for 3D). Render once per challenge and store them; do not call on every page view. With `"screenshots": true` (sites) or `"views": true` (3D) a grade also returns the player's pictures as the grader saw them, which makes a good side-by-side.
- 3D: Y is up; the challenge text must say so. A model on its side scores near zero.
- The pillars and the shape of the result (`total`, `pillars`, `criteria`, `feedback`, `error`) are the same for every kind, so one result view can serve all of them.

## 6. Lessons (advanced track)

Finished, in the repository folder `lessons/` (on this machine at `C:\Users\Brett\OneDrive\Documents\HackTheNest\lessons`, committed on the local `grader` branch; not on `main` yet):

- `lessons/index.json`: an array of `{ slug, title, level, minutes, summary, file, bonusChallenge, grader, order }`.
- `lessons/NN-slug.md`: one lesson each, Markdown with front matter (`title`, `slug`, `level`, `minutes`, `summary`, `bonusChallenge`, `grader`). Sections: what you will be able to do, why it matters, the ideas (with a worked example), common mistakes, the bonus challenge, prompting tips, sources.
- `lessons/challenges.json`: one bonus challenge per lesson, in the shape of `web/data/challenges.json` entries plus `kind` (`doc` or `workflow`) and a plain-words `criteria` list. The grader rubrics for these come separately.

The site needs: a lessons list, a lesson page that renders Markdown (headings, lists, code fences, tables, links), and a link from each lesson to its bonus challenge. Eight lessons: project instructions, documentation as a prompt, skills, MCP (two parts), agent workflows, loops and graphs, self-research.

## 7. Small things that save time

- `/api/health` could pass through the grader's `/health` `version`, so a wrong server is obvious.
- Player runs per day are capped in the backend already; the grader has no per-caller limit of its own, so keep that cap.
- Leaderboard brackets by prompt number: Brett's bands are 1, 2, 3 to 5, 6 to 10, 11 and over.
- If the grader is down, the stand-in score is shown as provisional. Keep that; do not put provisional scores on the boards.

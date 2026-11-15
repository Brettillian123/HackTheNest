# Grader

Scores what a player's prompt produced against a goal: a web page, a multi-page site, or a 3D model. Same input, same score, every time. No AI is involved in grading.

> Version 0.6.0. Pages, sites and 3D scenes are all graded, and every result says in plain words what cost points.
> The app calls it through the HTTP service in `service/` (see `service/README.md`); it cannot run inside a Vercel function because it drives a headless browser.

## What it grades

| Kind | Goal and submission are | Call | Total |
|---|---|---|---|
| Page | one self-contained HTML string | `grader.grade(goal, html)` | 0 to 100 |
| Site | files: `{ 'index.html': '...', 'site.css': '...' }` | `grader.gradeSite(goal, files)` | 0 to 100, up to 120 with the bonus |
| 3D model | JavaScript defining `buildScene(THREE)` | `sceneGrader.grade(goal, code)` | 0 to 100, up to 120 with the bonus |

A one-page challenge can be graded either as a page or as a site with one file. The site grader is the fuller one: it adds links, size, speed, accessibility and clean code.

First-time setup on a machine: `npm install`, then `npx playwright install chromium`.

## The calls

Everything is exported from `src/index.ts`. Importing it starts nothing; each grader starts its own browser on first use. Make one of each per server, reuse it, and close it on shutdown.

### Sites

```ts
import { Grader } from '../grader/src/index';

const grader = new Grader();
const goal = await grader.prepareSite({ 'index.html': '...', 'about.html': '...', 'site.css': '...' }); // once per challenge
const { result, candidate } = await grader.gradeSite(goal, submittedFiles);
result.total;     // 87.5
result.feedback;  // [{ message: 'On the about page: an image has no text description ...', points: 2.1 }, ...]
goal.page('index.html')!.snapshot.png;  // PNG of a goal page, to show players
await grader.close();
```

### Pages

```ts
const goal = await grader.render(goalHtml);               // once per challenge
const { result, candidate } = await grader.grade(goal, submittedHtml);
result.total;     // 0 to 100
result.feedback;  // [{ message: "The heading 'Pricing' is missing", points: 12.4 }, ...]
candidate?.png;   // the submission as the grader saw it
```

### 3D models

```ts
import { SceneGrader } from '../grader/src/index';

const scenes = new SceneGrader();
const goal = await scenes.prepare(goalCode);              // once per challenge; goal.views are the four pictures
const { result, candidate } = await scenes.grade(goal, submittedCode);
result.total;     // 0 to 100, up to 120
result.feedback;  // ['The model is about 20% bigger than the goal: ...', ...]  (plain strings)
candidate?.views; // [{ name, png, width, height }, ...] lined up with the goal
await scenes.close();
```

None of the `grade` calls throws for a bad submission: it scores 0, with the reason in `result.error` and as the only line of `result.feedback`. Preparing a goal does throw if the goal itself is broken (that is a broken challenge, not a bad answer).

## What comes back

Every result has `version` (store it with the score), `total` (one decimal), `feedback` and, when the submission could not be graded, `error`.

| Field | Page | Site | 3D |
|---|---|---|---|
| `feedback` | `{ message, points }[]`, at most 6 | `{ message, points }[]`, at most 8 | `string[]`, at most 6 |
| parts of the total | `breakdown`: content, layout, style, visual | `pillars`: works, looks, engineering | `pillars`: works, looks, engineering |
| engineering detail | none | `engineering`: `{ efficiency, accessibility, cleanCode, decidedBy }` and `efficiency` (size and device checks) | `details.engineering`: triangles, meshes, code size |
| other | `details` (missing and extra text, offsets) | `pages`, `links`, `bonus`, `exactMatch` | `details` (shape, parts, placement, views), `bonus`, `exactMatch` |

`feedback` is what to show the player: what cost points, most costly first. For pages and sites, `points` is roughly what the total would gain if that one thing were put right, worked out with the same arithmetic as the total. A perfect result has empty feedback.

Site `engineering` example, each value x100 with one decimal:

```json
{ "efficiency": 96.2, "accessibility": 81.9, "cleanCode": 100, "decidedBy": "accessibility" }
```

`pillars.engineering` is the lowest of the three (here 81.9). `result.efficiency` is unchanged from earlier versions: the size and load-time report.

## How each total is worked out

### Sites

```
total = 100 x (0.40 works + 0.25 looks + 0.35 engineering x works) x deadLinkFactor + bonus
```

- **works** (0 to 1): the right text, in the right places, with the right links between pages. Each page counts content 45% and layout 55%; if the goal's pages link to each other, those links are 25% of works.
- **looks** (0 to 1): each page's style (colours, fonts, borders) 45% and how the screenshot looks 55%.
- **engineering** (-1 to 1): the worst of three credits, each judged against the goal ("worst measure wins"):

| Credit | Range | What it measures |
|---|---|---|
| efficiency | -1 to 1 | Total size and estimated load time on four simulated devices, as a ratio to the goal. Up to 1.15x the goal is full credit; 3x is 0; 10x or more is -1 |
| accessibility | 0 to 1 | Images without a description, form fields without a label, buttons and links with no name, text too faint to read, no page language or title, missing or skipped headings |
| cleanCode | 0 to 1 | Parse errors (unclosed, misnested or stray tags), duplicate ids, obsolete tags like `font` and `center`, piles of inline styles, heavy `!important`, no doctype |

Accessibility and clean code are worked out for each pair of compared pages and averaged over the pages. A submission is only charged for problems the goal does not have too. Engineering counts only as far as the site works, so a blank site does not score on being small.

What one problem costs: one image with no description makes that page's accessibility credit 0.82. On a one-page site that costs about 6 points of the total (35 x 0.18 = 6.3). On a three-page site it is averaged over three pages, so about 2 points. It costs nothing if another engineering credit is already lower.

- **Pages are paired** by name, or else with the submitted page that looks most like the goal page. A missing page scores 0.
- **Orphaned pages:** a page a visitor cannot reach from the home page by following visible links keeps half its works and looks, its links count for nothing, and it is left out of the engineering comparison. It is listed in `links.orphaned`.
- **Dead links:** links on reachable pages to files the submission does not have multiply the total by `1 - 0.4 x (dead links / links on the goal's reachable pages)`, at most 40% off. Shown as `links.deadLinkFactor`.
- **Bonus** (up to 20): only for an exact match (every page 100 and reachable, every goal link there, no dead links) with accessibility and clean code both at full credit, no bigger than the goal and no slower on any device. It grows with how far under the goal it comes.
- **The goal is the reference:** a goal graded against itself always scores exactly 100, whatever is wrong with it.

Load times are estimated from counts (files, bytes, elements, CSS rules, page height), never timed, so they never vary. The device numbers are plausible stand-ins, not measurements.

### Pages

```
total = 25% content + 30% layout + 20% style + 25% visual
```

Content: is the right text there, in order, with nothing extra. Layout: is everything in the right place and size. Style: colours, fonts, borders, corners. Visual: does the screenshot look like the goal. A page grade has no engineering part. Small differences a person would not notice cost nothing.

### 3D models

```
total = placement x 100 x (0.40 works + 0.25 looks + 0.35 engineering x works) + bonus
```

- **Lining up first.** Players only see pictures of the goal, so the submission is moved and uniformly scaled to match the goal's bounding box (centre and diagonal, no rotation) before anything is compared. How far off size and position were is charged through **placement**: 1 when close, down to 0.7 when far off.
- **works** (0 to 1): shape agreement (surfaces compared on voxel grids at three sizes) times the **parts credit**. Parts are the separate connected pieces of the goal (a chair's four legs are four parts). Parts credit = parts present / (goal parts + 0.5 x extra parts), so a missing leg and a stray box both cost.
- **looks** (0 to 1): the four views compared as pictures.
- **engineering** (-1 to 1): the worst of three ratios to the goal: triangles, meshes, and code size (comments and spacing not counted).
- **Bonus** (up to 20): works and looks exact, size and position right, and leaner than the goal.

## Writing a goal

### Sites and pages

- HTML and CSS only (`.html`, `.css`, `.svg`). Scripts never run and nothing loads from the network.
- Up to 40 files, 1.5 MB in all, 300 KB per file; up to 12 pages are graded.
- Pages render 1280 px wide; anything below 2400 px is not graded. Animations are graded in their end state.
- Use installed fonts (Arial, Georgia, Courier New, the generic families). Web fonts do not load.
- Pages are never loaded into frames.
- Keep the goal lean, accessible and well written: it sets the bar. Anything wrong with the goal is excused in every submission.

### 3D models

- JavaScript defining `function buildScene(THREE) { ...; return object; }` (`export function buildScene` also works). `THREE` is three.js 0.187. Return a mesh, group or scene.
- **Up is +y.** The front faces +z (towards the default camera). The views are three-quarter front, front, top and three-quarter back.
- Colour comes from each material's `color` and `opacity`. Lights, textures and the camera in the code are ignored.
- Randomness and time are fixed, so `Math.random()` gives the same numbers every run.
- Limits: 200 KB of code, 100,000 triangles, 2,000 meshes, 8 seconds to run.

## Commands

| Command | What it does |
|---|---|
| `npm test` | Unit, page, site, quality, 3D and service tests (about 3 minutes) |
| `npm run test:properties:page` / `:site` | Rules that must hold for any page or site, over generated inputs (minutes each) |
| `npm run typecheck` | Type-checks `src`, `test` and `service` |
| `npm run calibrate` | Grades `calibration/sets/` (single pages) and writes `calibration/out/report.html` |
| `npm run calibrate:sites` | Grades `calibration/sites/` and writes `calibration/out/site-report.html`, with the three engineering credits per attempt |
| `npm run calibrate:scenes` | Grades the 3D calibration set and writes its report |
| `npm run grade -- goal.html candidate.html` | Grades one page from the command line |
| `npm start` | Runs the HTTP service (needs `GRADER_API_KEY`) |

The service, its routes, environment variables and Docker setup are in `service/README.md`.

Every tunable number is in `src/config.ts`, `src/site-config.ts`, `src/quality/config.ts` and `src/scene3d/config.ts`. Change one and bump `GRADER_VERSION` in `src/config.ts` (the 3D grader reports the same version).

## Known limits

- Scores are identical on one machine. Another operating system draws fonts slightly differently, so grade everything on the one server.
- An animated GIF or a video in a `data:` URI is not frozen, so such a page can score slightly differently between runs.
- Load times are a model, not measurements.
- Accessibility checks are automatic and partial: they cannot tell whether a description is a good one, only whether there is one.
- 3D submissions are compared without rotation: a model built facing the wrong way loses marks.
- 3D feedback lines are plain strings with no points attached.
- Chromium's sandbox is on. If the server cannot support it, set `GRADER_CHROMIUM_SANDBOX=0` and lock the container down instead.
- The expected bands in `calibration/expected.json` were set by one person's eye. No site or 3D attempt has been ranked by the team yet.

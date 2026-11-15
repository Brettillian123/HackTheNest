# Grader

Scores a generated web site against a goal site, 0 to 100. Same input, same score, every time. No AI is involved in grading.

> **Status, 2026-11-14: this is version 0.2.0, a first working form.**
> - It is not wired into the app yet, and it cannot run on Vercel: it drives a real headless browser, which does not fit in a Vercel function. It needs its own small server that the app calls.
> - Version 0.3.0 is in progress and changes how the total is weighted: a site has to work and be well engineered before it has to look right, heavy bloat is marked down harder, and a pixel-exact site that beats the goal on size and speed can score above 100. `result.fidelity` will be replaced by `result.pillars` (`works`, `engineering`, `looks`). The `Grader` calls below stay the same.
> - To see it work: `cd grader`, `npm install`, `npx playwright install chromium`, then `npm run calibrate:sites` and open `calibration/out/site-report.html`.

## Use it from the app

A site is an object of file path to file text. A one-page challenge is a site with one file.

```ts
import { Grader } from '../grader/src/index';

const grader = new Grader();                           // one per server; holds one headless browser
const goal = await grader.prepareSite({                // once per challenge; keep the result
  'index.html': '...', 'about.html': '...', 'site.css': '...',
});
const { result, candidate } = await grader.gradeSite(goal, submittedFiles);

result.total          // 0 to 100, one decimal: the leaderboard score
result.fidelity       // 0 to 100: how well pages and links match the goal
result.efficiency     // size and load time against the goal: { score, space, time: { checks } }
result.pages          // per goal page: which submitted page it was compared with, and its breakdown
result.links          // { score, expected, found, missing, broken }
result.error          // set only if the submission could not be graded (total is then 0)
result.version        // version of the grading rules; store it with every score
goal.page('index.html')!.snapshot.png        // PNG of a goal page: the picture to show players
candidate?.page('index.html')?.snapshot.png  // PNG of a submitted page as the grader saw it

await grader.close();                                  // on server shutdown
```

`gradeSite` never throws for a bad submission; it returns a total of 0 with `error`. `prepareSite` does throw if the goal itself is not a valid site.

`grader.grade(goalHtml, submittedHtml)` still grades one self-contained page on fidelity alone, with no efficiency score.

First-time setup on a machine: `npm install`, then `npx playwright install chromium`.

## How the total is worked out

```
total = fidelity x (0.8 + 0.2 x efficiency)
```

Efficiency can only take marks off, up to 20%. Like a coding judge, speed and size count for nothing unless the answer is right: a blank site is tiny and fast and still scores 0.

### Fidelity: does it match the goal?

Each goal page is compared with the submitted page of the same name, or, failing that, the submitted page that looks most like it. A missing page scores 0. Each page is scored on four parts:

| Part | Question it answers | Share of a page |
|---|---|---|
| content | Is the right text there, and nothing extra? | 25% |
| layout | Is everything in the right place, at the right size? | 30% |
| style | Are colours, fonts, borders and corners right? | 20% |
| visual | At a glance, does the screenshot look like the goal? | 25% |

If the goal's pages link to each other, 15% of fidelity is whether the submission has the same links between the same pages. Only links a visitor could see count: an empty or invisible link is not a way to reach a page. Links that lead to a file the submission does not contain are listed in `links.broken` and cost marks.

It grades what is rendered, not which tags or file names were used. Differences a person would not notice (a few pixels, a barely different shade) cost nothing.

### Efficiency: space and time

The goal site is the reference solution. The submission is compared with it as a ratio: up to 1.15 times the goal is full marks, 3 times or more is none.

- **Space** is the size of everything submitted, in bytes.
- **Time** is the estimated load time of each page on four simulated devices. Each device is one check, like a test case, and each punishes different waste:

| Device | Download | Round trip | Processor |
|---|---|---|---|
| Budget phone on slow 3G | 400 kbps | 400 ms | 6x slower |
| Mid-range phone on 4G | 4 Mbps | 150 ms | 4x slower |
| Old laptop on home Wi-Fi | 20 Mbps | 40 ms | 2.5x slower |
| Desktop on fibre | 100 Mbps | 10 ms | reference |

Nothing is timed with a stopwatch, because that gives a different answer every run. Load time is worked out from counts: files requested, bytes, elements, nesting depth, CSS rules and page height. A request to an outside address (a font or a CDN) is refused but still counted as a round trip. The device constants are stand-ins, chosen to be plausible, not measured.

Every tunable number is in `src/config.ts`; change one and bump `GRADER_VERSION`.

## Rules for goal sites

- HTML and CSS only (`.html`, `.css`, and `.svg` files). Scripts never run and nothing loads from the network, in goals or in submissions.
- Up to 40 files and 1.5 MB in total; up to 12 pages are graded.
- Pages are never loaded into frames: an `<iframe>` of another page renders empty.
- A submission gets 45 seconds of rendering in all; pages it does not reach count as missing. A normal page takes under a second.
- Use fonts installed on the grading machine (Arial, Georgia, Courier New and the generic families). Web fonts do not load.
- Pages render 1280 px wide. Anything below 2400 px tall is not graded.
- Animations are graded in their end state.
- Keep the goal lean: it sets the bar for efficiency.

## Commands

```bash
npm test
```
```bash
npm run calibrate
```
```bash
npm run grade -- goal.html candidate.html
```

```bash
npm run calibrate:sites
```

`npm run calibrate` grades every single-page attempt in `calibration/sets/` and writes `calibration/out/report.html`: each attempt's screenshot beside the goal with its score, for checking by eye. The scores a person expects are in `calibration/expected.json`; `npm test` fails if the grader disagrees with them.

`npm run calibrate:sites` does the same for multi-page sites in `calibration/sites/<name>/` (a `goal/` folder and one folder per attempt under `attempts/`) and writes `calibration/out/site-report.html`: each attempt's pages, links, size and device checks. No expected scores are set for sites yet.

The `grade` command covers single pages only.

## Known limits

- Scores are identical on one machine. A different operating system draws fonts slightly differently, so grade everything on the one server.
- CSS animations and animated SVG are frozen before grading. An animated GIF or a video embedded as a `data:` URI is not, so a page containing one can score slightly differently between runs.
- Chromium's process sandbox is on. If the server's container cannot support it, set `GRADER_CHROMIUM_SANDBOX=0` and lock the container down instead.
- The expected bands in `calibration/expected.json` were set by one person's eye and should be re-ranked by the team. No multi-page site has been ranked by eye yet.

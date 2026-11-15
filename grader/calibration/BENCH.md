# Grader benchmark

One command grades every banded attempt (pages, sites, 3D scenes) against the band a fair human gave it, and prints one table. Run it before and after every grader change.

## Run

From the `grader` folder:

```
npm run bench                                   # everything, with one line per attempt
npm run bench -- --quiet                        # table only
npm run bench -- --domain sites                 # pages | sites | scenes
npm run bench -- --set pages-edge               # one set (names in calibration/bench.json)
npm run bench -- --json calibration/bench/my-run.json --csv calibration/bench/my-run.csv
npm run bench -- --compare calibration/bench/baseline-0.7.0.json
```

- `--json` writes every attempt: score, band, verdict, signed distance, and the grader's whole result with images removed (pages: breakdown, details, feedback; sites: pillars, engineering with decidedBy, links, each page; scenes: pillars, bonus, details, feedback). New fields such as a `criteria` list are copied through as they are.
- `--csv` writes one row per attempt: set, domain, split, attempt, band low/high, score, distance, verdict, then one column per numeric sub-score (dotted path, e.g. `pillars.looks`). Arrays become columns only when their items have a `name` or `id`.
- `--compare` lists attempts that entered their band and those that LEFT it, and the change in each headline number.

## Read

Per set, per domain and overall, for `train` and `heldout` separately:

- `n` attempts graded, `in` inside the band, `%`.
- `mean d`: mean distance outside the band over all attempts (0 for those inside). Lower is better.
- `harsh` / `lenient`: below / above the band.
- `err`: attempts that threw (recorded, not counted in `n`).
- `order`: order checks held / counted (pairs where the first must score above the second).

Then the ten worst misses, how many goals scored exactly 100 against themselves (all must), entries skipped for having no numeric band (refusal `expect`s), and the run time. In the CSV, distance is negative when too harsh and positive when too lenient.

## Add a set

Add one entry to `calibration/bench.json`; no code change:

```json
{ "name": "pages-heldout-1", "domain": "pages", "split": "heldout",
  "bands": "calibration/heldout/pages-1/bands.json",
  "layout": { "kind": "files", "goal": "calibration/heldout/pages-1/{group}/goal.html",
              "attempt": "calibration/heldout/pages-1/{group}/{attempt}.html" } }
```

- Bands file: either nested `{ "<group>": { "<attempt>": { "band": [lo, hi], "why": "..." } }, "order": {...} }` or flat `{ "bands": { "<group>/<attempt>": [lo, hi, "why"] }, "order": [["g/a", "g/b"]] }`. `order` may be a list of full-key pairs or `{ "<group>": [[a, b]] }`. Entries without a numeric band are skipped and counted.
- Layout `files`: `{group}` and `{attempt}` come from the band key; pages point at `.html` files, sites at a folder, scenes at a `.js` file. A list of templates means the first that exists. Layout `module`: a TS module whose export (default `SETS`) is `[{ id, goal, attempts: [{ id, code }] }]`.
- Optional `"order": [["g/a", "g/b"]]` in the entry adds order checks the bands file lacks (used for `pages-edge`).

## The rule

Fix agents may read `train` sets (cases and bands) and tune against them. They never open `heldout` sets, their bands or their cases; only the bench reads them, and only its numbers are reported. A grader change is judged on `heldout`.

## Baseline (grader 0.7.0)

Saved as `calibration/bench/baseline-0.7.0.json` (and `.csv`).

Run on 2026-11-15 with the working tree of that moment (`src/scene3d/**` was being changed by another agent, so the scene rows reflect that in-progress state). 316 banded attempts; run time 457 s.

```
== TRAIN ==
set / domain              n   in      %  mean d  harsh  lenient  err    order
pages-advanced           24   16   66.7    0.97      5        3    0    23/23
pages-edge               52   42   80.8    0.52      1        9    0      4/4
pages-review             38   11   28.9    6.93     12       15    0    22/30
sites-edge               49   35   71.4    1.46      3       11    0      0/0
sites-advanced           18   12   66.7    1.47      0        6    0    20/20
sites-review             32   19   59.4    3.57      1       12    0    24/25
scenes-audit             56   30   53.6    1.44      5       21    0    25/25
scenes-review            47   27   57.4    3.10     14        6    0    30/34
-----------------------------------------------------------------------------
[pages]                 114   69   60.5    2.75     18       27    0    49/57
[sites]                  99   66   66.7    2.14      4       29    0    44/45
[scenes]                103   57   55.3    2.20     19       27    0    55/59
[all train]             316  192   60.8    2.38     41       83    0  148/161

Ten worst misses:
  pages-review    product/p_good                           [76-88]   41.5  harsh by 34.5
  pages-review    invoice/i_good                           [82-93]   50.4  harsh by 31.6
  sites-review    portfolio/x2-cheat-home-cloned           [8-20]   48.6  lenient by 28.6
  scenes-review   mug/m3_mediocre                          [58-72]   32.3  harsh by 25.7
  sites-review    conference/x3-cheat-stubs                [15-30]   54.1  lenient by 24.1
  scenes-review   mug/m4_poor                              [36-50]   13.0  harsh by 23.0
  scenes-review   mug/m7_no_saucer                         [68-82]   49.0  harsh by 19.0
  pages-review    signup/s_good                            [78-90]   60.0  harsh by 18.0
  pages-review    product/p_wrong_product                  [55-70]   86.0  lenient by 16.0
  pages-review    signup/cheat_duplicated                  [35-55]   70.4  lenient by 15.4

Goal vs itself: 76/76 exactly 100
Skipped (no numeric band): 5  (sites-edge 4, scenes-audit 1)
Run time: 457.5 s
```

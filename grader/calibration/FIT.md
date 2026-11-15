# Fitting the score balance

The grader measures named criteria (each 0 to 1). `combine` (`src/criteria/combine.ts`) turns them into a score from 0 to 100 with a few constants kept in `src/criteria/params.json`. `npm run fit` tunes the constants that are not fixed against the human bands the bench recorded. Plain number fitting, run offline: no AI, no network, no randomness. Grading only reads the file.

## Run

From `grader`:

```
npm run bench -- --domain pages --json calibration/bench/pages-now.json   # once, about 3 min
npm run fit -- --from calibration/bench/pages-now.json --cv                # fit + leave-one-set-out
npm run fit -- --from <file> --model pages --holdout pages-edge            # treat a set as held out
npm run fit -- --from <file> --cv --write                                  # save the fitted values
```

- `--model` picks a model from `src/criteria/models.ts` (`pages` today; sites and 3D add theirs there, see `src/criteria/model.ts`).
- Attempts with `split: "heldout"`, and sets named in `--holdout`, are never fitted on and are reported on their own.
- `--prior` (default 4) sets how strongly values are pulled back to neutral so the fit does not chase noise.
- Without `--write` nothing changes. With it, only non-fixed values are written, plus a `fit` note (date, data file, before/after, leave-one-set-out).
- Same input file, same output, byte for byte. A fit of 114 pages takes about 8 s; `--cv` about 35 s.

## Read

- **TRAIN rows**: the grader's own scores, the params file now, neutral values and the fit. `in-band` = attempts inside their human band; `mean d` = mean points outside the band (0 when inside; lower is better); `order` = "A must beat B" pairs held.
- **Parameters**: each value with its bounds; `*` marks a value the fit moved; `fixed` values never move.
- **Ten worst misses**: what no balance of these constants can fix. Those need a better measurement, not a new weight.
- **LEAVE-ONE-SET-OUT**: for each set, fit on the other sets and score that one. This is the honest number: how the balance does on pages it never saw.

## The rule

A fit is adopted only if the **leave-one-set-out** numbers beat the current ones (lower mean d, no fewer in band, no fewer order pairs held). A better fitted number alone means nothing. Group weights are the owner's and are never fitted.

## What each constant means (for players)

- **Group weight** (fixed): how much of the score each part is worth. Pages: content 35, layout 30, style 15, visual 20.
- **Share**: how much one criterion counts inside its part. A criterion that cannot be measured hands its share to the others.
- **Curve (gamma)**: credit is `value ** gamma`. Above 1, every slip costs more and the first ones cost the most. Below 1, small slips cost less and big ones more. 1 = straight line.
- **Blend** (per group, optional): 0 = the plain mean of the group's criteria; 1 = the weakest criterion decides.
- **Limiter**: some things cap the whole score. With strength 0.5, a page with half its key facts wrong loses a quarter of everything.
- **Gate**: "something pretty that does not work is useless". Style and visual credit is scaled down when content is missing. `floor` is how much looks credit survives with no content; `knee` is the content level from which looks count fully.

## Pages, 2026-11-15 (four sub-scores standing in for the twelve criteria)

| | in band (of 114) | mean d | order |
|---|---|---|---|
| grader as run | 57 | 2.49 | 54/57 |
| neutral combine | 61 | 2.57 | 54/57 |
| fitted (on all) | 61 | 1.64 | 54/57 |
| leave-one-set-out | 60 | 2.10 | 54/57 |

Fit: content curve 1.60, layout 0.83, style 0.82, visual 2.03, gate floor 0.92, no limiters.

Later the same day, with the twelve criteria in the bench output, every variant is in `fit/pages-variants.md` and each criterion's reliability is in `fit/pages-diagnosis.md`. The best variant passes leave-one-set-out against the grader as run (62 / 1.94 / 54 against 57 / 2.49 / 54). It is **not adopted**, because it breaks four page tests that keep each noticed fault's cost proportional. `params.json` is back to neutral, and `score()` does not read it.

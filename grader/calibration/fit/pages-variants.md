# Pages: combinations tried (2026-11-15)

Data: `calibration/bench/pages-criteria.json` (114 banded pages, 3 sets, 57 order pairs). Prior 4 unless noted. Produced by `calibration/fit/variants.ts`. **LOSO** = leave-one-set-out, the only number that decides.

To beat (grader as run): 57 in band, mean d 2.49, 54/57 order. The scorer one version back (0.7.0): 69 in band, mean d 2.75.

| id | variant | free | fitted in | fitted d | LOSO in | LOSO d | LOSO order |
|---|---|---|---|---|---|---|---|
| A0 | four sub-scores, curves 0.4-3 + content gate | 6 | 61 | 1.64 | **62** | **1.94** | 54 |
| A0 p1 | same, prior 1 | 6 | 62 | 1.57 | 64 | 1.96 | 53 |
| A0 p10 | same, prior 10 | 6 | 59 | 1.69 | 59 | 2.00 | 54 |
| A1 | A0 + limiters completeness, keyFacts | 10 | 61 | 1.64 | 62 | 1.96 | 54 |
| A2 | A0 + limiters completeness, keyFacts, noExtras, colour | 14 | 59 | 1.54 | 61 | 1.93 | 54 |
| A3 | four sub-scores, curves only (no gate) | 4 | 62 | 1.64 | 59 | 1.85 | 54 |
| A4 | A0 + keyFacts limiter | 8 | 61 | 1.64 | 62 | 1.97 | 54 |
| A5 | A0 + noExtras limiter | 8 | 61 | 1.64 | 60 | 2.12 | 54 |
| A6 | A0 + likeness limiter | 8 | 61 | 1.64 | 61 | 2.01 | 53 |
| A7 | A0, curves 0.8-1.25 | 6 | 57 | 1.93 | 57 | 2.26 | 54 |
| A8 | A0, curves 0.67-1.5 | 6 | 57 | 1.81 | 59 | 2.17 | 54 |
| A9 | four sub-scores, gate only | 6 | 60 | 2.19 | 59 | 2.45 | 54 |
| A10 | A8 with the content curve fixed at 1 | 5 | 58 | 1.86 | 59 | 2.15 | 54 |
| B0 | twelve criteria, plain mean, curves, 2 limiters, gate | 16 | 41 | 5.17 | 35 | 6.91 | 49 |
| B1 | twelve, mean/weakest blend per group, curves, 2 limiters, gate | 20 | 44 | 3.70 | 40 | 5.61 | 48 |
| B2 | twelve, free shares, blend, 2 limiters, gate | 20 | 41 | 5.09 | 40 | 6.16 | 51 |
| C0 | sub-scores beside the twelve, blend, 4 limiters, gate | 18 | 55 | 1.90 | 50 | 2.89 | 52 |
| C1 | sub-scores beside the twelve, blend, gate | 14 | 54 | 1.99 | 51 | 2.81 | 53 |

## Findings

- Every variant built on the twelve criteria is far worse than the four sub-scores. The criteria sit at 1.00 on pages people judge clearly wrong (see `pages-diagnosis.md`), so no weighting can recover what they never measured. Limiters on criteria get fitted to about 0 for the same reason.
- A0, A8 and A10 pass the adoption rule (LOSO above 57 in band, below 2.49 mean d, 54 order pairs held). None reaches 69 in band; all beat 0.7.0's mean distance (2.75).
- **Not adopted.** With `score()` computing the total by combine over the sub-scores, four page tests failed after two fix rounds (A0, then A8, then A10): a wrong price must cost the same on a short and a long page (short/long gap 6 points, test allows 3); four wrong prices must cost at least 3.2x one (24.9 against 29.8); a missing icon row must leave 78 or more (75.9); enforced band `checkout/restyled` 66 to 80 (81.6). With A0 there were ten failures, including enforced band `profile/shifted` (83.7, band 85 to 97). The reason: today's total also takes the lower of the noticed-faults total, which keeps each fault's cost proportional. A total built from the sub-scores alone loses that.
- Next step, if wanted: add the noticed-faults total as a fifth measurement (a limiter or a min). It needs one new field in the result and one bench run.

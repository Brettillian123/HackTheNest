# Pages: how each criterion tracks the human bands

Data: `calibration/bench/pages-criteria.json`, 114 banded pages in 3 sets. Run `npx tsx calibration/fit/diagnose.ts <bench.json> calibration/bench/baseline-0.7.0.json` to get this table plus the list of cases behind each count.

- **rho**: rank correlation with the band midpoint, the criterion on its own (1 = same order as people give).
- **false high**: reads 0.95 or more on a page whose band top is 70 or less. Some of these are fair, for example colour reading 1.00 on a lorem page. The ones that count are where the fault belongs to that criterion.
- **false low**: reads under 0.70 on a page whose band bottom is 80 or more.

| criterion | rho | false high | false low | null |
|---|---|---|---|---|
| completeness | 0.65 | 12 | 0 | 0 |
| keyFacts | 0.50 | 16 | 0 | 5 |
| wording | 0.58 | 15 | 0 | 5 |
| structure | 0.38 | 22 | 0 | 5 |
| noExtras | 0.50 | 14 | 2 | 0 |
| placement | 0.38 | 20 | 0 | 2 |
| spacing | 0.34 | 20 | 0 | 2 |
| colour | 0.35 | 22 | 0 | 0 |
| typography | 0.27 | 20 | 0 | 5 |
| shape | 0.34 | 21 | 0 | 6 |
| pictures | 0.33 | 8 | 0 | 45 |
| likeness | 0.61 | 6 | 4 | 0 |
| breakdown.content | 0.80 | 0 | 0 | 0 |
| breakdown.layout | 0.80 | 4 | 0 | 0 |
| breakdown.style | 0.69 | 5 | 0 | 0 |
| breakdown.visual | 0.77 | 3 | 4 | 0 |
| grader total now | 0.95 | 0 | 0 | 0 |
| grader total 0.7.0 | 0.92 | 0 | 2 | 0 |

## What it says

- **Track judgement best:** completeness (0.65), likeness (0.61) and wording (0.58). Even these are well below each sub-score (0.69 to 0.80) and far below today's total (0.95).
- **Miss their own faults:** keyFacts reads 1.00 on lorem pages, shuffled menu items (`cheat_shuffled`) and copied pages. Completeness reads 1.00 on `cheat_duplicated`, `i_numbers_wrong` and `p_wrong_product`. Colour reads 1.00 on hidden or camouflaged text (`cheat_hidden_text`, `cheat_camouflage`). Typography and placement read 1.00 on `cheat_tiny_text`. noExtras reads 0.51 to 0.56 on a cookie banner and an extra testimonial that people barely mind.
- **Close to noise:** typography (0.27), pictures (0.33, null on 45 pages), spacing, shape and colour (0.34 to 0.35). Most of them read 1.00 on almost every page, so they cannot separate a good page from a bad one.
- likeness reads low (0.55 to 0.69) on four pages that are nearly right (`m_shifted`, `no-icons`, `i_roomy`, `checkout/rebuild-detailed`). A small shift or a missing icon row costs it too much.

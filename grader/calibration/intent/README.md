# Intent benchmark

A small set of attempts judged by a person against the new kind of challenge: a brief in plain words, requirements and key facts, with the reference build as the look to be close to (not to clone). It is the yardstick for measuring and fitting the new grader.

## What is here

- Eight challenges from `challenge-pack/pages-2/`. Each folder has `goal.html` (the reference build), `brief.json` (the challenge entry) and `attempts/` with seven pages.
- `bands.json`: for each attempt, a score band (8 to 12 points wide) and one sentence on why, plus the pairs that must rank in order.
- Renders (1280 wide, as the grader sees them) are in `grader/calibration/out/intent/<slug>/`.

## The scale

The reference scores 100 by definition. It is not one of the banded attempts.

| Score | Meaning |
|---|---|
| 93 to 99 | Exceptional and rare: everything right, cleanly built, and so close to the reference you have to compare carefully. |
| 85 to 93 | Strong: the whole brief, cleanly built, close to the reference with small visible differences. |
| 78 to 88 | Solid: the brief with a couple of honest slips. |
| 62 to 78 | Partly there: a requirement missed, several facts wrong, rough design or poor engineering throughout, or the right content with clearly the wrong look. |
| 40 to 62 | On the subject, much of the brief not met. |
| 15 to 40 | Little of the brief. |
| 0 to 15 | Blank, broken or unrelated. |

"Close enough" to the reference: another shade of the same colour family, a similar typeface, slightly different spacing and sizes are small costs. Another colour family, a major element in a clearly different place, or proportions far off are faults.

## How the attempts were made

Written by hand in the style of small models answering prompts of different quality: plain markup, default-ish styling, details sometimes dropped.

- `a-strong`: excellent prompt. Everything right, its own markup, close to the reference in look.
- `b-good`: good prompt. Two honest slips (one fact or label off, one cramped or uneven area).
- `c-rough-design`: all content, rough design (misaligned, uneven spacing, weak hierarchy, low contrast).
- `d-poor-engineering`: looks fine, badly built (divs for buttons, links and tables, no labels, landmarks or headings, inline styles).
- `e-incomplete`: polished, but two requirements unmet and about three key facts wrong or missing.
- `f-vague`: one-sentence prompt. Right kind of page, invented content.
- `g-wrong-look`: everything right and tidy, but another colour family and one major element in the wrong place.

Each attempt was rendered and checked once by eye.

## Train and held out

- `train`: alert-stack, feature-grid, leaderboard-table, kanban-board, contact-form. A grader developer may read these.
- `heldout`: settings-toggles, event-schedule, shopping-cart. A grader developer must not read these challenges' attempts, bands or renders. They are only for scoring the finished grader.

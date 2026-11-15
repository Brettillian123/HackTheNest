# Page challenge pack (12)

Twelve single-page challenges built from goal pages that already score 100 against themselves in the grader. Goals are byte-for-byte copies; none needed changing.

| Slug | Level | What it is | Source goal |
|---|---|---|---|
| profile-card | 1 | Profile card with CSS-drawn avatar, stats and Follow button | `grader/calibration/sets/profile` |
| harbor-landing | 1 | Header, centred hero, three feature cards, dark footer | `sets/landing` |
| release-changelog | 1 | Navy title bar over twelve fixed-height release cards | `edge/pages/layout-tall` |
| split-signup | 1 | Gradient brand panel beside a sign-up form | `review/pages/signup` |
| restaurant-menu | 2 | Four-course menu with dotted price leaders | `review/pages/menu` |
| field-notes-post | 2 | Blog post with pull quote, bar chart and table | `edge/pages/build-text` |
| pricing-compare-signup | 2 | Gradient hero, overlapping plans, compare table, form | `sets/checkout` |
| planner-landing | 2 | Long green landing page: hero art, features, tiers, quotes, form | `edge/pages/own-whole` |
| analytics-dashboard | 3 | Sidebar, stat cards, 12-bar chart, 10-row orders table | `sets/dashboard` |
| night-train-article | 3 | News feature: quote, line chart, table, code, list, footer | `sets/article` |
| print-invoice | 3 | Invoice sheet with addresses, eight items, totals, notes | `review/pages/invoice` |
| product-detail | 3 | Shop product page: drawn pack, pickers, tabs, reviews | `review/pages/product` |

## Install

1. Copy `goals/*.html` into `web/data/goals/`.
2. Append the twelve objects in `challenges.json` to the `challenges` array of `web/data/challenges.json`.
3. Run `node challenge-pack/pages/check.mjs` to re-check the pack (JSON shape, slugs, goal file rules, and that every hex colour and px value in each spec appears in its goal).

## What the spec cannot fully carry

- Line wrap points (long headings, paragraphs, the invoice's Payment column) follow from widths and fonts; the spec gives those, not the breaks.
- Native form controls (select arrows, checkboxes, the masked password) look however the renderer draws them.
- `release-changelog` keeps the goal's own oddity: Version 4.0 is dated Dec 2026. The spec states it.
- `planner-landing` contains unused CSS classes in the goal; they draw nothing and are not in the spec.
- Exact shadow softness and gradient angles are given as CSS values; a player who uses them will match, an approximation will lose a little.

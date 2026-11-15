# Review round 2: workspace-v3.html

_2026-11-14. Rendered at 1280 x 800 in the browser pane, both states, measured by script. Judged against SPEC.md section e._

## Verdict: PASS

Cold read (opinion): a designer shown either state would not pick this out as generated. Every edge sits on x 40 or x 1240, both columns end on y 720, there are no cards, and the screen has one idea of its own: the rail. State a is a row of 100 red ticks over a clean goal page. State b turns 84 of them light, with three red brackets that match the three cost rows. It is clearly not the v2 screen: v2 was floating rounded boxes with 14 px text; this is a ruled instrument with a 28 px title, a 48 px reading and a full-width scale. Good enough to ship for the event.

## Criteria

| # | Result | Measured |
|---|---|---|
| 1 Rail | PASS | 100 ticks, all 3 px wide, 24 and 32 px tall, first at x 40, last ends at x 1240. State a: 100 red. State b: 84 light, 16 red. Rail y 136 to 168. |
| 2 Red use | PASS | Red only on ticks, three brackets, three cost numbers, brand mark. Specimen holds one page element and nothing over it. |
| 3 Sizes | PASS | 12, 14, 28 in a; 12, 14, 28, 48 in b. |
| 4 Specimen | PASS (spot check) | x 40 to 808, y 240 to 720 in a, b and after the tab swap. |
| 5 Bottoms | PASS | Frame 720. Column 720: button bottom in a, last cost row bottom in b. |
| 6 Edges | PASS | Rail, score, textarea, button all end at x 1240. Title and rail start at x 40. |
| 7 Hairlines, radius | PASS | Unchanged from round 1. |
| 8 Labels | PASS | Unchanged. |
| 9 Brackets, no scrollbar | PASS | Brackets at x 1056 to 1144, 1153 to 1204, 1213 to 1240, y 172 to 174: 8, 5 and 3 ticks, in row order. Textarea 416 (a) and 248 (b), scroll height equals client height in both. |
| 10 Button, mono | PASS | One primary, light fill, 144 px wide in both states. |
| 11 Counts | PASS | 13 text elements in a, 18 in b. |
| 12 Cover test | PASS (opinion) | The rail identifies it without the wordmark. |
| 13 Squint test | PASS (opinion) | Rail band and specimen lead, then prompt, then button. The criterion's wording was corrected in SPEC.md: a 768 x 480 white page will always be as strong as the rail, and that is intended. |

## Interaction checks

- Hovering the "−5" cost row dims the other two tick groups and brackets; seen in a zoomed screenshot.
- Clicking "Goal" swaps the page in place: same box (40, 240, 808, 720), transition 0 s, footer links appear, nothing else moves.

## Optional polish (not required, do not hold the build for these)

1. State a, right end of the rail band: "No runs yet" at 12 px muted is the weakest spot on the screen. Setting it in body text (14 / 20, `--mu`) would hold the corner better.
2. Brackets are 2 px tall and easy to miss from a distance. 3 px would match the tick width. If changed, the band's bottom pad becomes 9.
3. The inactive tab ("Goal") gives no hint that it flips the page. An underline on hover is enough.

## Not proven

Keyboard focus on cost rows and the focus ring were not tried. Only the dark theme at 1280 x 800 was viewed. Empty, loading and error states do not exist in this template yet. The landing page and leaderboard have not been built to this spec.

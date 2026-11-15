# Review round 1: workspace-v3.html

_2026-11-14. Rendered at 1280 x 800 in the browser pane, both states, measured by script. Judged against SPEC.md section e as amended this round._

## Verdict: FAIL (close)

Cold read (opinion): this no longer looks like v1 or v2. The rail band, the square specimen and the shared bottom edge at y 720 make it look composed, and the build follows the old spec almost to the pixel. It is not shippable yet for four reasons. The rail is too thin to carry the screen, so the white page wins and the rest reads as a quiet dark form. The red outlines on the player's page are invented data. The state b prompt box shows a scrollbar and a cut line. The rail stops 10 px short of every other right edge. The second and fourth are faults of the old spec, not of the builder.

## Criteria

| # | Result | Measured |
|---|---|---|
| 1 Rail | FAIL (spec changed) | 100 ticks, 84 light and 16 red in b, 100 red in a: correct. Ticks are 2 px wide; first starts at x 40, last ends at x 1230. Wanted 3 px and x 1240. |
| 2 Red use | FAIL (spec changed) | Red on rail, cost numbers, brand mark: correct. Two red outlines with "−3" and "−8" over the specimen: now banned. |
| 3 Sizes | PASS | 12, 14, 28, 48 only. Largest to body: 2x in a, 3.4x in b. |
| 4 Specimen | PASS | x 40 to 808, y 240 to 720, both states, radius 0. |
| 5 Bottoms | PASS | Frame bottom 720, column bottom 720 in both states. Band below: 40 px. |
| 6 Edges | FAIL | Left: brand, title, rail, frame all at x 40. Right: Leaderboard, score, textarea, button at 1240; rail at 1230. |
| 7 Hairlines, radius | PASS | Both hairlines run x 0 to 1280. Radii found: 0 and 2 only. No cards. |
| 8 Labels | PASS | Every caption shares a row with a right-aligned value. |
| 9 Cost link, no scrollbar | FAIL | No brackets (new this round). State b textarea: content 248 px in a 238 px box, scrollbar visible, ninth line cut. |
| 10 Button, mono | PASS | One primary, fill `--tx`. Mono only on prompt and numbers. |
| 11 Counts | PASS | By the amended counting rule: 13 text elements in a, 18 in b. Muted captions: 3 in a, 2 in b. |
| 12 Cover test | PASS (opinion) | With the wordmark hidden the rail still identifies it. |
| 13 Squint test | FAIL (opinion) | Order seen: specimen, score, title, prompt. The rail (2 x 16 px ticks) is fourth or fifth. In state a nothing in the band competes with the white page. |

## Fixes for the builder, in order of effect on the cold read

1. **Rail ticks** (`.t`): width 2 to 3 px; height 16 to 24 px; tenth ticks (`.t.x`) 24 to 32 px; left offset `i * 12` to `i * 12 + Math.floor(i / 10)`. Last tick must end at x 1240.
2. **Rail band rows**: rail top 140 to 136 (height 24 to 32, bottom at y 168). Row with title and score stays at top 76, height 48.
3. **Remove the outlines**: delete `.marks`, both `.loss` elements, their CSS and the `.loss` part of the hover script. The specimen shows the page only.
4. **Add cost brackets**: three `--red` bars, 2 px tall, top at y 172 (4 px under the rail). For score 84 and costs 8, 5, 3: ticks 84 to 91, 92 to 96, 97 to 99. Each bar runs from its first tick's left edge to its last tick's right edge (x 1056 to 1144, 1153 to 1204, 1213 to 1240 with the new tick formula). Hidden in state a.
5. **Hover link**: hovering or focusing a cost row sets the other groups' ticks and brackets to opacity 0.3 (ticks already do this; add the brackets). Cost rows need `tabindex="0"` so focus works.
6. **State b textarea**: height 240 to 248; padding 16 to 15. Gap between action row and "Points lost" header (`.costs` margin-top) 24 to 16. No scrollbar may show with the sample prompt.
7. **State a textarea**: height 424 to 416; gap above the action row (`.act` margin-top) 16 to 24 in state a only. State b keeps 16.
8. **Primary button** (`#run`): width 109 px in a and 96 px in b, to a fixed 144 px in both, text centred.
9. **Tab swap**: keep "Yours" and "Goal" as built. Confirm the swap has no transition and the page does not shift by a pixel between views.
10. **Brand mark** (`.mark i`): tick width 2 to 3 px with left offsets 0, 5, 10, 15, 20 and mark width 18 to 23, so it matches the new rail. Optional.

## Not to change

Top bar, title and score placement, caption rows, specimen size and position, table rows, colours, the type roles. These pass and should come back untouched.

## Not proven

Hover and focus states were not exercised. Only the dark theme and the 1280 x 800 size were viewed. The bracket rule assumes shown costs sum to at most 100 minus the score.

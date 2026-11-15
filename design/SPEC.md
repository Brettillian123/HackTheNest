# promptdyno design spec

_Written 2026-11-14 by the design reviewer. A coding agent builds from this page plus `RULES.md`. Where the two disagree, this page wins. Lines marked (opinion) are the reviewer's judgement, not a measurement._

## a. Diagnosis: why the templates read as AI-made and alike

Seen in `workspace-v2.html` (both states) and `workspace.html` at 1280 x 800.

1. **Flat type.** In v2 the brand, back link, labels, cost lines and button are all 14 px. State a has nothing larger than 16 px. The only big thing (48 px score) exists in state b only.
2. **Boxes floating in a void.** Nothing sits on a line or an edge. The goal frame ends near y 670, the prompt box near y 500, the button near y 555. About 130 px under the right column is dead in both states.
3. **Label above a rounded box, three times.** "Goal", "Your page", "Your prompt": a bold 14 px label over a 6 px radius, 1 px border, slightly lighter fill. This is the default dark component-library look.
4. **No identity.** The brand is a 14 px red word. Cover it and the screen could be any tool. Red means three things: brand, lost points, primary button (theme 2).
5. **The product shrinks when it matters.** After scoring, the goal and the output drop to 360 x 280 with unreadable text, side by side, with no difference marked. "-8 Footer links are missing" points at nothing.
6. **The score is a stat in a corner.** It is a number next to a list. It is not drawn, and it is not tied to the page or the prompt.
7. **Same skeleton each round.** v1 had 8+ bordered panels, mono labels, badges and key hints. v2 removed things but kept the skeleton: header row, panes, label plus box. I agree with the orchestrator: `RULES.md` is bans and budgets, and "Yours to decide" hands over every positive choice, so the agent returns its usual layout.
8. **What the references do that we do not.** CSSBattle: full-height columns split by hairlines, header strips, target at native size. Monkeytype: content text about 3x the chrome text, one accent used only for the active thing. Vercel: visible grid lines, headline about 4x body with tight tracking, 32 px buttons. (Linear's page body did not render; only its nav was seen.)

## b. Art direction

promptdyno is a **test bench**: a dynamometer for prompts. It should feel like a measuring instrument: flat, ruled, exact, quiet until it shows a reading. Three signature moves. (1) **The rail.** A row of 100 ticks runs the full width of every screen that shows a score. Earned points are light ticks, open or lost points are red ticks. Before a run all 100 are red. The game is turning the rail from red to light. (2) **Red means points not earned, and nothing else.** It appears on the rail, on the brackets under the rail and on the cost numbers. Buttons, links and focus rings are never red. The brand mark may be red because it is made of rail ticks. (3) **The page is the specimen.** The goal page is shown large, square-cornered, at a stated scale, in the same place and size in both states. After scoring the same frame shows the player's page, and one click flips it to the goal in place, so differences show as movement. Nothing is drawn on top of either page: the grader returns text costs only, no regions.

## c. Exact values

**Tokens (dark theme).** `--bg #0F0D0C`, `--sf #181514`, `--bd #2E2826`, `--tx #F1EBE4`, `--mu #A39A92`, `--red #E5484D`, `--ok #5DBB7E`. No other colours in the app chrome.

**Spacing scale.** 4, 8, 12, 16, 24, 40 px only. Fixed heights: 40 (controls, table rows), 56 (top bar), 128 (rail band). Page side padding: 40.

**Radius.** 0 on the specimen frame, the rail and all dividers. 2 px on buttons, inputs and the textarea. Nothing else.

**Borders and surfaces.** Two surfaces only: `--bg` everywhere, `--sf` only as the fill of inputs and the textarea. Structure comes from 1 px `--bd` hairlines that run the full viewport width (edge to edge, ignoring the 40 px padding). No cards, no panels, no shadows. The specimen frame has no border; its own white page is the edge.

**Type roles.** Workspace uses exactly 12, 14, 28, 48.

| Role | Font | Size / line | Weight | Tracking | Colour |
|---|---|---|---|---|---|
| Score | Plex Mono | 48 / 48 | 600 | -0.02em | `--tx` |
| Challenge or page title | Plex Sans | 28 / 32 | 600 | -0.01em | `--tx` |
| Landing lead line only | Plex Sans | 20 / 28 | 400 | 0 | `--mu` |
| Landing headline only | Plex Sans | 48 / 48 | 600 | -0.02em | `--tx` |
| Body, links, cost text | Plex Sans | 14 / 20 | 400 | 0 | `--tx` |
| Labels, wordmark, button text | Plex Sans | 14 / 20 | 600 | 0 | `--tx` |
| Prompt text | Plex Mono | 14 / 24 | 400 | 0 | `--tx` |
| Number meta (counter, scale, sizes) | Plex Mono | 12 / 16 | 400 | 0 | `--mu` |
| Word captions | Plex Sans | 12 / 16 | 400 | 0 | `--mu` |

16 px is not used in the workspace. No uppercase, no letter-spaced labels.

**Numbers.** Always Plex Mono with `font-variant-numeric: tabular-nums`. Right-aligned in tables. Costs are written with a real minus sign, for example "−8". The score is never followed by "%" or a unit; "of 100" is not shown because the rail says it.

**The rail.** 100 ticks from x 40 to x 1240 exactly. Each tick is 3 px wide. Pitch is 12 px, plus 1 extra px after every tenth tick: tick i (0 to 99) starts at x = 40 + 12i + floor(i / 10), so the last tick ends at 1240. Ticks are 24 px tall; every tenth tick is 32 px tall. Bottom-aligned, square ends. Earned: `--tx`. Not earned: `--red`. No track behind it, no labels on it, no animation other than a colour or opacity change.

**Cost brackets (state b only).** Lost ticks sit at the right end. They are split into groups in cost-row order: the first cost row owns the leftmost red ticks, the next row the ticks after them, and so on. Under each group draw one bracket: a `--red` bar 2 px tall, 4 px below the rail, from the left edge of the group's first tick to the right edge of its last tick. The 9 px tick gap separates neighbouring brackets. Red ticks not covered by a shown cost row get no bracket. Hovering or focusing a cost row sets every other group's ticks and brackets to 30 percent opacity. (Assumes the shown costs sum to at most 100 minus the score; not confirmed.)

**Workspace layout at 1280 x 800** (app area is 1280 x 760 above the 40 px review bar).

| Zone | y from top | Height | Contents |
|---|---|---|---|
| Top bar | 0 | 56 | Brand mark and wordmark at x 40. "Challenges" link 24 px after it. "Leaderboard" link right-aligned to x 1240. Hairline below. |
| Rail band | 56 | 128 | 20 pad, 48 row, 12 gap, 32 rail, 4 gap, 2 bracket, 10 pad. Hairline below. |
| Work area | 184 | 576 | 24 pad, 24 caption row, 8 gap, 480 content, 40 bottom pad. |

- Rail band row: challenge title (28) left-aligned at x 40, sitting on the row's bottom edge. State b: the score (48) right-aligned to x 1240, same bottom edge. State a: that spot holds "No runs yet" (word caption).
- Work area columns: specimen 768 wide (x 40 to 808), gutter 32, prompt column 400 wide (x 840 to 1240). No vertical hairline.
- Specimen frame: 768 x 480, the 1280 x 800 goal at 60 percent. Caption row above it: label left, "1280 x 800 at 60%" (number meta) right-aligned to x 808.
- State a specimen caption: "Goal". Right column: caption row ("Prompt" label left, "412 / 2000" right), textarea 416 high (16 whole lines), 24 gap, action row 40. Total 480.
- State b specimen caption: two text tabs, "Yours" (active, 600, `--tx`) and "Goal" (400, `--mu`). The frame shows the player's page, clean, with no outlines or marks. Clicking a tab swaps the page in place with no transition. The scale text stays at the right.
- State b right column: textarea 248 (9 whole lines), 16 gap, action row 40, 16 gap, cost header row 40, three cost rows of 40. Total 480.
- Textarea heights are always 32 + 24n so no line is cut. The sample prompt must fit without a scrollbar in both states. The primary button is 144 wide in both states. The frame and the right column end on the same y (720) in both states.
- Action row: model picker left (text button, `--mu`, caret), primary button right-aligned to x 1240.

**Button.** Height 40, padding 0 16, radius 2, label 14 / 600. Primary: fill `--tx`, text `--bg`, no border; hover fill `#FFFFFF`. Secondary: no fill, 1 px `--bd` border, text `--tx`; hover border `--mu`. Focus: 2 px `--tx` outline, 2 px offset. Disabled: 40 percent opacity. One primary per state: "Run prompt" (a), "Run again" (b).

**Text input.** Height 40, padding 0 12, fill `--sf`, 1 px `--bd` border, radius 2, text 14 / 20. Placeholder `--mu`. Focus: border `--tx`, no glow. Textarea: same, padding 15 plus the 1 px border, Plex Mono 14 / 24, no resize handle.

**Table row** (cost rows and leaderboard rows). Height 40, 1 px `--bd` hairline on top, no fill, no zebra, no side borders, no padding at the left and right ends so text lines up with the column edges. Header row: labels 14 / 600, same height. Cost row: cost number in a 40 px wide column in `--red` mono 14 / 600, then the reason in body text. The cost header row holds "Points lost" left and the "11 of 14 checks passed" link right. At most 3 cost rows; the rest sit behind that link. Leaderboard row: rank (mono, `--mu`, 40 px column), name, prompts used, score (mono 600), all numbers right-aligned.

**Score display.** The 48 px number plus the rail, always together, never one without the other on screens with one score. No ring, no gauge arc, no percent, no colour change by grade. In lists (leaderboard, attempts) a score is a plain mono 14 / 600 number.

## d. Free for the coding agent

- The brand mark, as long as it is built from rail ticks and is at most 24 px tall.
- How the Goal and Yours tabs switch (click, hold, hover) and any transition, 150 ms or less.
- Empty, loading and error states, inside the zones above.
- Hover and pressed details, the model picker menu, the wording.
- The whole composition of the landing page and leaderboard, provided they use the rail, the specimen frame, the tokens, the type roles and the hairline structure. The landing first screen should show a real goal page in a specimen frame and a real rail, not an illustration.
- Anything not fixed in section c.

## e. Pass criteria (checked on a 1280 x 800 screenshot)

A template passes only if every line holds and a designer shown the screenshot cold would not guess AI and would ship it.

1. The rail has exactly 100 ticks, 3 px wide, first starting at x 40, last ending at x 1240, and its light and red counts match the score.
2. Red appears only on the rail, cost brackets, cost numbers and the brand mark. Nothing is drawn over the specimen page. No red button, link, border or text elsewhere.
3. Text sizes on the workspace are 12, 14, 28 and 48 only. The largest text is at least 2x the body text in both states.
4. The specimen frame is 768 x 480 at the same position in state a and state b, with square corners.
5. The frame bottom and the right column bottom are on the same y. No empty band taller than 40 px above the review bar.
6. Left edges: brand, title, rail start and frame all start at x 40. Right edges: Leaderboard link, score, rail end, textarea and primary button all end at x 1240.
7. Hairlines run edge to edge. No box has both a fill and a border except inputs. Zero cards or panels. Radius is 0 or 2 everywhere.
8. No bold label sitting directly on top of a bordered box with no shared row. Captions share a row with a right-aligned value.
9. In state b there is one bracket under the rail per shown cost row, in row order from left to right, and each bracket spans as many ticks as its row's cost. No text field shows a scrollbar or a cut line.
10. One primary button. It is light, not red. Mono appears only on the prompt and on numbers.
11. Counts from `RULES.md` hold: 20 text elements or fewer (a cost row with its number is one element; a link is one element; the specimen page's own text is not counted), 3 muted captions or fewer (controls such as the model picker and the inactive tab do not count), no banned items.
12. Cover test: with the wordmark hidden, the screen is still recognisable as promptdyno from the rail and the specimen. (opinion, judged by the reviewer)
13. Squint test: at 25 percent zoom the rail band and the specimen are the two strongest things, then the prompt, then the button. Nothing else competes. (opinion, judged by the reviewer)

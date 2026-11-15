# QA findings B: workspace, leaderboard, profile, shell

_Reviewer B (Fable), 2026-11-15, on localhost:4173. Static views in headless Chrome (`design/qa/shots-b/`); flows walked in the browser pane at 1280 x 800 and 390 x 844 ("pane" = no saved file). Saved by the orchestrator from the reviewer's report, shortened. Counts: 9 P1, 28 P2, 14 P3. Note: headless Chrome will not lay out under about 500 px, so the `*-390.png` files show false right-edge clipping; a true 390 px has no horizontal overflow._

## P1
1. Profile, own (anonymous), all sizes. `.pf-local svg` (`ICON.info` in `js/profile.js:107`, rule `css/boards.css:93`) has no size, renders 389 px wide, crushes the header and squeezes the notice to one word per line. Make it 14 px (`width:14px;height:14px;flex:none`), text on one line. `pf-1280.png`.
2. Rail raptor tail clipped by its viewBox (`js/shell.js:11`). Same as list A items 1 and 3; follow the decision there (rail mark removed; any lone mark shows the whole raptor).
3. Workspace, cancelled run (Esc), 1280. Left side stays on an empty "YOUR PAGE / Run 2" frame with "SCORING / Stopped"; goal and last compare are gone. Return to the goal page (no runs yet) or to the last run's compare view.
4. Workspace, scored, 390. `#scorePanel` sits at y 1242 under a 901 px `#comparePanel`. Put the score panel first on phones (order -1 under the tabs) or scroll to it when grading ends.
5. Editor, long prompt. `.editor .gutter` (`css/components.css:157`, `js/ui.js:128`): one number per newline at a fixed 25 px, but lines wrap, so numbers drift and the gutter goes blank at the bottom of a long prompt. Size each number to its line's wrapped height, or turn numbering off when wrapping.
6. `.score` (`css/components.css:174`) has a red radial gradient. Flat `var(--section)`.
7. `.run` uses `box-shadow:var(--shadow-run)` (red glow). Flat, no shadow. `zoom-run-button-1280.png`.
8. Scored, mock numbers. "POINT COSTS" lists three costs that do not add up to the loss (68 with -10, -7, -6). List every cost, or add a row such as "3 more, -9" that opens the Runs tab.
9. Mock numbers. Score panel says "rank #15 to #6" for 88 while the strip and the leaderboard say "#5 You 88". One number from one source.

## P2
10. Magnifier, compare view. `.tool-lens` (`css/workspace.css:88`), 220 px, `position:fixed`, is cut by the viewport near the left edge and covers the rail. Clamp to the viewport (ideally the panel).
11. Magnifier, compare view. Frames are 300 x 188 with a 220 px lens each, so the goal lens covers the other frame and the mirrored lens covers the score. Use about 140 px in compare view or offset it away from the other frame.
12. Magnifier. Outside the page the lens shows pure white. Use the panel grey, or stop the lens centre at the page edge.
13. Ruler, after a drag. Size label and cursor label overlap by 3 px on one line. Keep an 8 px gap or move the cursor label above the crosshair when they would collide.
14. Ruler. Esc does not turn it off and it stays on through a run. Turn off on Esc and when a run starts.
15. Editor after any run or cancel. `#prompt` shrinks to its content (126 px) inside a 450 px `#editor`; clicks in the empty part do not focus. Focus the textarea on any click in `#editor`, or keep `min-height:100%`.
16. Running. Button reads "Running" but keeps the play icon and "Ctrl Enter" hint. Show a spinner or stop icon; hide the hint.
17. Running. The preview frame is pure white first, then snaps to the page background (`.frame{background:var(--white)}`, `components.css:144`). Hold a neutral placeholder until the first styled paint.
18. Running, 1280. The "SCORING" strip is a 115 px panel holding one 20 px row; at 390 the chips wrap with a 40 px gap. One tight row (about 64 px), 8 px row gap when wrapped.
19. Scored, 1280. "PROMPT FOR THIS RUN" (`#runPrompt`) is 42 px for 56 px of content: one and a half lines with a scrollbar. Show at least three full lines or end on a line.
20. Runs tab, six costs. The list scrolls under `#useBtn`; the sixth row is cut in half. Stop the list 12 px above the button.
21. Instructions menu, 1280. `.ws-ins` opens 380 px wide over the middle of the goal page and needs its own scrollbar (907 px of content in 570 px); values are right-aligned mono and wrap raggedly. Open beside the goal or as a column that leaves the goal visible; values left-aligned under their labels.
22. Panel heads, 1280. `#insBtn` top 218, `#modelBtn` top 215; "GOAL PAGE" sits 3 px lower than "PROMPT". One baseline. `zoom-panel-heads-1280.png`.
23. Two raptors side by side at top left. Same as list A item 3.
24. Workspace head. "40 players solved" on all six challenges, while the board for pricing-plans says "Players 25". Vary per challenge and match the board for the same period.
25. Mock grading. The same fault changes cost between runs with an unchanged page (-10, then -6). Same cost each time.
26. Empty prompt. "Write a prompt first, then run it." appears as a second grey note and shifts the editor 3 px. Replace the Preview note with it, in the red text colour, no shift.
27. Workspace, 1024. Strip names truncate ("quin..."), "Top score" drops out of the head, and the strip panel has about 110 px empty. Two rows of two at this width; keep the stat. `ws-pricing-1024.png`.
28. Leaderboard, 1280. The page scrolls (972 px) and `.wrap` scrolls inside it: nested scrolls. The pinned "You" bar (`.bd-pin`, `css/boards.css:51`) floats 12 px above the scroller bottom. One scroller; pin flush with its bottom.
29. Leaderboard podium. The three cards repeat rows #1 to #3 of the table below; a bracket with one player shows one card, two "Open spot" boxes and the same single row. Start the table at #4 when the podium shows; hide the podium under three players.
30. Leaderboard, 390. Bracket pills wrap and leave "11+" alone. One sideways-scrolling row or a 3 x 2 grid.
31. Bracket names differ (pills "2", "11+"; side list "2 prompts", "11 or more"; profile "2", "11+"). One set everywhere.
32. Profile, other player. Right column says "NEXT CHALLENGE", "YOUR BEST Not tried", "Start this challenge" and the list has a "YOURS" column: mixes visitor and viewed player. Head it "Try one <name> has not solved" or hide it on other players' pages.
33. Profile, 1280. Left panel stretches to match the right column; its lower half is empty. End at its content or carry recent runs.
34. Profile, own. "WHEN" shows "earlier" for a run made minutes ago (`js/profile.js:41`). Store the time; show "today".
35. Profile, unknown user. Heading and the line under it say the same thing; 60 percent of the screen is bare. One heading, a line "Check the spelling or pick a player from the board", centred.
36. Callouts (`.callout`: `#scNote` in `workspace.html:154`, and on leaderboard and profile) use a 3 px left accent bar on a dark card, a stock template pattern. Plain grey note with the icon, no bar. (List A item 24 asks grey for info and red for errors: resolve as no bar for info notes; errors keep red text and icon.)
37. `.panel` (`css/components.css:80`) carries `var(--shadow-panel)`. No shadow.

## P3
38. Workspace head. "MODEL" appears as a stat card and as the dropdown below. Keep the dropdown only, or make the stat the control.
39. Stat values "Not tried" and "none yet" are mono beside sans labels and differ in case. Sans, sentence case, same wording on all pages.
40. Profile "WHEN" values are mono. Sans; mono for numbers only.
41. "Avg prompts" is a whole number on the board and one decimal on the profile. One decimal in both.
42. Ruler labels use the letter x and a double space. Use the multiply sign and one space.
43. Score panel "First prompt" above "rank #31". Say "Run 1"; capitalise "Rank".
44. Board strip after a score shows #1, #2, #3 then "#5 You". Show #4 then You, or a small gap mark.
45. "Use this prompt" on run 1 says "Prompt 1 is in the editor" while the block above shows run 2's faults. Show the chosen run's faults or hide the block.
46. Stats at 390 lay out two plus one orphan. Three across, or 2 x 2 with a fourth stat.
47. Leaderboard, 390. `.wrap` scrolls sideways by 8 px. Fit.
48. Workspace, 390, running. Run and Cancel sit under the bottom nav. Keep them in view (sticky above the nav).
49. Goal frames at 0.48 scale make 12 px labels unreadable and the tools are hidden on narrow screens (`css/responsive.css:8`). Allow tap to open the goal full size on phones.
50. Profile rows. Descriptions cut at about 215 px. Allow two lines.
51. Profile, own. No rail or nav item is active. Mark a profile item or the leaderboard.

## Checked and fine
Ruler numbers are right and the mirror works. Bracket counts add up. Tie order follows the rule. Start over needs two clicks and resets to 0. Model, challenge and period controls work and stay in the viewport. No horizontal page overflow at a true 390 px. All six goal pages fit and centre.

## Bigger picture (optional, for Brett; not in the fix pass)
A. Before a run the red Run button is louder than the prompt. Let the editor be the loud thing: larger placeholder, a short example line, a calmer button until there is text.
B. After a run the score competes with six red crosses, three red cost chips and a red button. Keep red for the score and the primary button; make fail marks and cost chips grey with white numbers.
C. The compare thumbnails are 300 px wide, too small to compare by eye. Offer an overlay toggle or slider that lays "yours" over the goal at full panel width.
D. The ruler could snap to element edges and show the gap to the nearest edge; the magnifier could be a fixed loupe in a panel corner.
E. Mock data: per-challenge solved counts, less scripted scores, one rank source.

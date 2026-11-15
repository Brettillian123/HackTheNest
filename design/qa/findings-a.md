# QA findings A: landing, challenges, log in, sign up, 404, shared shell

_Reviewer A (Fable), 2026-11-15. Seen on localhost:4173 with headless Chrome (1440, 1280, 1024, 390) and the browser pane. Screenshots in `design/qa/shots-a/`. "Pane" means seen in the built-in browser only. Saved by the orchestrator from the reviewer's report. Counts: 5 P1, 24 P2, 12 P3._

## P1

1. All pages, 760 and up. Rail raptor `.rail-logo svg` (`ICONS.logo` in `web/js/shell.js`). The tail is cut off flat: viewBox `0 0 56 56` with `scale(0.3733) translate(-50 4)` puts the tail left of the viewBox. Should show the full mark: use the viewBox of `assets/mark.svg` (`0 12 200 90`), no translate. Shot `rail-zoom.png`.
2. Tab icon `web/assets/favicon.svg`. Same crop (`clipPath` plus `translate(-50 4)`); the raptor also sits high with an empty band under the feet. Should be the whole raptor centred in the 64 box, or a head-only crop made on purpose that reads at 16 px. Shot `favicon.png`.
3. All pages, 760 and up. Two raptors side by side at top left: the rail mark at x 9 and the lockup raptor at x 68 (`.rail-logo`, `.brand`). Reads as a mistake. Keep one. Orchestrator's decision: keep the nav lockup, remove the mark from the rail. Shots `rail-zoom.png`, `landing-1280.png`.
4. Landing, 1280 and 1440. Score card `.overlay` (`landing.css` line 22) covers the goal page: hides the Business price and cuts the Team button to "Start free tria". The goal frame is also cut at the bottom through the plan buttons. Should overlap only empty goal space, or sit under or beside the frame; the goal must show whole. Shots `landing-1280.png`, `landing-1440.png`.
5. Landing hero and challenge thumbnails, real browsers. Goal iframes show a grey scrollbar inside the preview (pane, 1280 and 375). Headless hides it. Make `.frame > iframe` never scroll (`scrolling="no"` and `overflow:hidden` on the framed document).

## P2

6. Challenges, signed in. `.phead` still says "Play without an account". Should say "Signed in as <name>" or drop it.
7. Landing, signed in. Hero stat "ACCOUNT / Not needed" and footer links "Log in", "Sign up" do not change when signed in. Switch or hide.
8. Log in, sign up, 404. `.score` panels (`components.css` line 174) have a red radial glow top left. Brett wants no gradients or glows. Flat `var(--section)`. Shots `login-1280.png`, `404-1280.png`.
9. Landing. Primary `.run` button has a red glow under it (`rgba(255,77,77,.55) 0 6px 18px -6px`). No shadow.
10. Landing. `.overlay` and `.hero-goal .frame` use `--shadow-float`; reads as a floating glass card. Flat 1 px border only.
11. Challenges, 1024 and 390. `.chal-brief` is one line with ellipsis; it is the only description. Clamp to two lines.
12. Challenges, all sizes. Thumbnails `.chal .frame` crop the goal page (Login card loses its bottom; Product grid shows a sliced fourth column). Show the whole goal scaled to fit.
13. Challenges, keyboard. Tab onto a row draws two red rings (title link and row). One ring, on the row.
14. Challenges. "Challenges" appears three times in the top 90 px (crumb, nav link, title). Remove the crumb on this page.
15. Challenges. Every row shows "SOLVED 40" and top score 98 or 97; looks like placeholder data. Vary the mock numbers (for example 212, 164, 97, 71, 38, 22).
16. Challenges. Level said twice per row (`Lv 1` tag and "Level 1: Easy"). Keep the tag and show only "Easy".
17. Challenges, 1280 and up. Page ends after six rows with no footer; half a tall screen is empty. Add the shared footer the landing has.
18. Landing "How it works", 1280 and 1440. The three `.step-body` blocks do not top-align (about 30 px apart; step 2 has an empty band). Align all three to the top.
19. Landing, 1440. `.hero-copy` has about 130 px empty between "Browse challenges" and the stats. Keep the 1280 spacing.
20. Landing, 1024. Goal frame floats with about 80 px empty above and below; the overlay hangs outside the frame. Top-align the frame under its label.
21. Landing "Prompt brackets". Pills look like filter pills but do nothing. Make them links to `leaderboard.html` with that bracket, or plain labels.
22. Landing, 390. Board panel head cramped ("TOP 5 OVERALL" and its caption both wrap around the tag). Drop the caption under 760 or give it its own line.
23. Landing, 390. Stat "Not needed" wraps to two lines; boxes uneven. Use "Optional".
24. All pages. Info notes and error messages look the same (dark box, red left bar). Info notes use a grey bar (`var(--line)`); red only for errors.
25. Log in and sign up. Board shows ranks 1 to 4 as a strip, then the table starts at #5 with its header under the strip; looks like rows are missing. At 1024 the strip name is cut ("kwa..."). One table from #1, or the strip only.
26. Log in and sign up. Score panel's top-right label "Login card" reads as a name for the panel. Say "Challenge: Login card".
27. Log in, 1280. About 180 px empty between "Create an account" and the note. Move the note up, or let the panel be its own height.
28. 404, 1280. Right panel has two empty bands and "+0 pts" beside a 0 score. Even 24 px gaps; drop "+0 pts".
29. Sign up. After sign-up the page jumps to the challenge list with no confirmation. Show one line "Signed in as <name>" on arrival.

## P3

30. Top nav. "Challenges", "Leaderboard" are 14 px; "Log in", "Sign up" are 13 px; boxes differ by 1 px. One size, one box height.
31. Radii mixed in one row: nav links 8, "Sign up" 4, pills 5, stats 6, cards 8. Use two: 4 for controls, 8 for panels.
32. Landing. "Try the first challenge" is mono; other buttons are Lato. Keep mono for the workspace Run button only.
33. Log in and sign up header stats. "YOUR BEST" shows a bare "-"; at 1024 the third stat vanishes; at 390 it takes a row alone. Use "None yet"; same count at every size.
34. Phone bottom bar. Three icons with no labels. Add 10 px labels.
35. Phone. "Log in" in the top bar and the log-in icon in the bottom bar go to the same place. Drop one.
36. Keyboard order. Two stops are both "promptdyno home"; no skip link to content. Add a skip link; one home stop.
37. Challenges. Count ignores the filter ("6 challenges" with Level 3 picked). Say "2 of 6".
38. Sign up, rail. The log-in icon is active on `login.html` but nothing on `signup.html`. Mark the same icon on both.
39. Challenges, 390. `Lv` tag pushes title and brief in about 60 px. Put the tag on the title line.
40. Avatars (`.avatar`, `components.css` line 76) use a diagonal gradient. Flat fill.
41. Form errors push fields down about 20 px when they appear. Reserve the line.

## Checked and fine
No em dashes or exclamation marks. No horizontal scroll at any size. Landing and footer links correct. Validation messages clear. Log out works. Lockup lettering sharp at 24 px. Filter pills and sort work and update the URL.

## Bigger picture (optional, for Brett; not in the fix pass)
A. The challenge list is a plain stack of rows; give it one loud element, such as a large "next up" challenge with its goal at full size.
B. Log in, sign up and 404 all reuse the big red score panel. Keep it on 404; make the auth pages quieter.
C. Decide what the rail is for: it duplicates the top nav links.
D. "DEMO DATA" tags appear up to three times per screen; one note would do.
E. On the challenge list nothing says "start here"; mark the first untried row.

# Multi-page grading review (grader 0.7.0)

Three new goal sites: a restaurant (4 pages, one form), a portfolio with a blog (8 pages, posts two folders deep, links both ways) and a conference (11 pages, six speaker pages from one template). 21 honest attempts, 11 cheat or odd-navigation attempts, and 20 probes. Bands were written in `bands.json` after looking at the contact sheets (`calibration/out/review/sites/*-sheet-*.png`) and before any grading.

Files: `gen.mjs` (all cases and probes), `shots.ts` (screenshots, contact sheets, and the pixel-image cheat), `run.ts` (the runner), `run-output.txt`.

## Verdict

**NOT SATISFIED** (narrowly).

Honest rebuilds are graded fairly: perfect rebuilds score exactly 100, good and poor attempts land in or near their bands, 24 of 25 order checks hold, grading is deterministic, and a grade takes about 1.5 s. The problem is placeholder work. A site whose inner pages are stubs (right title, menu and heading, nothing else) scores 54, and a site that is the home page copied under every file name scores 49. Both should be under 30, so a player who fakes the pages comes within about 10 points of one who built them badly. Also, the cost of one dead link depends on the size of the site, about seven times over (19.7 points on a 3-page site, 2.8 on a 10-page one), and a menu link that is dead on every page scores higher than the same menu link left out.

## Numbers

- Inside the band: **17 of 32** (honest attempts: 13 of 21; cheats and odd navigation: 4 of 11).
- Outside the band: mean distance 10.3 points, worst 38.5 (form-button navigation, harsh). Honest attempts outside the band miss by 0.6 to 9.2 points (mean 5.3).
- Order checks held: **24 of 25**. The failure: one speaker page missing (90.6) beats good-with-slips (90.3).
- Cheats that worked (lenient by more than 5): **4 of 7**. Home page cloned (+28.6), stub pages (+24.1), hidden words (+7.6), pixel image (+6.3). Defeated: invisible 1px links, meta-refresh pages, one catch-all page.
- Each goal against itself: 100.0, 100.0, 100.0 (and 100.0 for the three probe goals). Each attempt graded twice: identical every time. Time per grade: median 1.5 s, max 2.2 s over 87 grades.

## Problems

Ranked by how unfair they would feel to a player.

### 1. Stub and copied pages keep about half their marks
- **Cases:** `conference/x3-cheat-stubs` (band 15-30) scored **54.1** (works 58.3, links 90.8, stub pages 27 to 50 each). `portfolio/x2-cheat-home-cloned` (band 8-20) scored **48.6** (works 53.4, links 45/45, cloned pages 25 to 39 each). `portfolio/x8-cheat-hidden-words` scored 31.6 against 10-24, with heading-only pages at 28 to 52.
- **What a person sees:** every page except the home page is empty, or is the home page again. "You didn't build the site." For comparison, c3-mediocre, which really built all eleven pages thinly, scores 64.6, only 10 points above the stubs.
- **Mechanism:** `score()` in `score.ts` gives each page credit for every matched block. The header, menu and footer are shared by every page of a site, so a page with only the site chrome and the right heading matches a large share of its goal page's blocks, in the right places and colours. In `site-grade.ts`, `scoreSite` / `worksCreditOf` then give these pages 25% link credit, because their menus work. Nothing requires a page to carry its own content: `contentShare` (each goal page's own words) is used only to pair pages in `pairPages`, never to score them. Nothing notices that two submitted pages are identical.
- **How common:** occasional. Models that run out of room write "Coming soon" or thin placeholder pages, and on a leaderboard this is an easy trick.

### 2. One dead link costs about seven times more on a small site than on a large one
- **Probes:** one dead home-page menu link (the page is still reachable from other pages) costs **19.7** on the 3-page site (80.3) and **2.8** on the 10-page site (97.2).
- **What a person sees:** the same single typo. 80 puts it in "several visible flaws". 97 puts it in "differences you only find by flipping between the two", which is not the "pretty big penalty" the owner asked for.
- **Mechanism:** `deadFactorOf(deadCount / goalFacts.linkUses)` in `scoreSite` (`site-grade.ts`). The share is out of all the goal's link uses: 6 on the small site, 90 on the large one. With the 0.7 curve, one dead link out of 6 takes 17% of the total, and one out of 90 takes 2.6%.
- **How common:** common. Challenges will mostly be small sites, and a single wrong file name is the most frequent link fault in model output.

### 3. A menu link that is dead on every page scores higher than leaving the link out
- **Probes:** `probe-10/dead-everywhere-1` (the "Services" item on every page leads to a missing file) scores **84.7**. `probe-10/unreachable-page` (the "Services" item removed from every menu) scores **82.2**. Both leave the page unreachable. The first also gives the visitor nine 404s, but it scores 2.5 points higher.
- **Mechanism:** the dead links are marked `coveredBy` the unreachable page in `scoreSite`, so they cost nothing beyond the 35% unreachable charge (`SITE.orphanCredit`). Removing the item instead changes how every page looks (each drops to 88.3 in `score()`). So the gentler fault pays the look penalty and the worse fault does not. The same thing makes `conference/c6-one-speaker-missing` (90.6, band 72-85) beat c2-good-slips: its three dead links to the missing page are not counted, and the page itself is 1/11 of the site.
- **How common:** common. A dead menu item across a site and a missing page are both everyday model faults.

### 4. Bloat is docked lightly
- **Cases:** `restaurant/r6-css-3x` (three times the CSS it uses; the site is 1.7 times the goal) scored **96.3** (band 76-90) and still counts as an exact match. `conference/c5-inline-css-every-page` (2 times the size) scored 91.9, which is inside its band. `restaurant/x9-cheat-pixel-image` is 28 times the goal's size and loses only 11.5 points for it.
- **Mechanism:** `PERF.ratio` (`site-config.ts`) gives full credit up to 1.15 times the goal and declines linearly to 0 at 3 times, so 1.7 times keeps 79% of the size credit. Engineering is 35% of the total and is multiplied by works, so 1.7 times costs about 4 points. Unused CSS rules are not a clean-code fault (only unused files are). Credit stops at -1, and because it is multiplied by works, a site that hardly works pays little for any amount of weight.
- **How common:** occasional. Model output often carries unused CSS, though rarely three times over.

### 5. A plain but working site is docked on "works"
- **Case:** `restaurant/r8-plain-good-engineering`: every page, every word, every link and clean code, but unstyled. It scored **45.8** (band 55-70) with works at only 53.2.
- **Mechanism:** within a page, works = 45% content + 55% layout (`PAGE_PILLARS`), and layout is measured from block positions in the screenshot. Unstyled pages move every block, so the "works" pillar loses half its marks for what is really a look problem, and engineering (multiplied by works) shrinks with it. Meanwhile the pixel-image cheat, which has no text and no usable form, keeps works at 37.7. "Works" partly measures looks.
- **How common:** rare in this extreme form. The same effect lifts or lowers every layout-heavy attempt a little.

### 6. Links that are not `<a href>` count for nothing
- **Cases:** `restaurant/x5-form-button-nav` (every link is a form button, which works in a browser without JavaScript) scored **31.5** (band 70-84, the largest miss): all three inner pages unreachable. `portfolio/x6-image-map-nav` (menu as an image map with alt text) scored 71.9 (band 74-88), with About counted unreachable.
- **Mechanism:** the link collector in `render.ts` collects only `a[href]`. `<area href>` and form `action` navigation are invisible to `reachableFrom`.
- **How common:** rare in model output, but the visitor-facing result is wrong when it happens.

### 7. Smaller misses (each under 6 points)
- `r5-form-lost`: 83.2 against 64-78. The reservations page's one job is gone, but it is costed as 1/4 of a page's blocks.
- `p3-content-swapped`: 72.3 against 56-70. Pairing by content was right, and the swapped links were charged as opening the wrong page.
- `r7-pretty-poor-engineering`: 77.4 against 62-76.
- `c3-mediocre`: 64.6 against 50-64.
- `p6-mediocre` (74.5 against 52-66) and `p4-crumbs-footer-wrong` (80.4 against 58-72) are lenient by about 8.5. On reflection my bands for these two may be a little harsh, so I count them as borderline. In p4, 14 dead uses (the footer on every page plus the breadcrumbs) cost 19.6 points.

## Cheats

| Cheat | Band | Score | Result |
|---|---|---|---|
| x2 home page copied to every file (portfolio) | 8-20 | 48.6 | **worked**: links all "work" and each copy keeps 25-39 for shared chrome |
| x3 stub pages: title, heading and menu only (conference) | 15-30 | 54.1 | **worked**: same mechanism |
| x8 thin pages with the goal's text hidden in a clipped 1px box (portfolio) | 10-24 | 31.6 | partly: the hidden text did not obviously help (no control run), the shared chrome did |
| x9 each page is a screenshot of the goal under a real menu (restaurant) | 5-18 | 24.3 | partly: works 37.7 with no text; 28 times the size costs 11.5 |
| x1 every label linked in invisible 1px text, no visible menu (conference) | 25-40 | 37.1 | defeated: invisible links filtered by ink, 7 pages unreachable |
| x7 speaker pages are meta-refresh redirects (conference) | 45-60 | 45.9 | defeated: refresh stripped, pages graded empty |
| x4 home right, every link to one catch-all page (restaurant) | 38-52 | 48.5 | defeated: moved content keeps up to 50% |
| x5 form-button links / x6 image-map menu | 70-84 / 74-88 | 31.5 / 71.9 | not cheats: they work for a visitor; graded harsh (problem 6) |

## Consistency

- **One dead menu link:** costs 19.7 (3 pages) against 2.8 (10 pages). Not what a person expects (problem 2).
- **One unreachable page:** costs 37.1 (3 pages) against 17.8 (10 pages). Roughly in proportion to the share of the site lost, which a person would accept.
- **One page with a broken layout:** costs 13.6 (3 pages) against 8.1 (10 pages). The weakest-page drag stops the large site from diluting it to nothing. Sensible.
- **1, 2, 4 and 8 dead links on the home page** (pages stay reachable): 97.2, 95.4, 92.4, 87.5. Rises and never falls, but 8 dead home-menu links costing only 12.5 is gentle.
- **The same links dead on every page** (pages become unreachable): 84.7, 76.3, 65.2, 39.4. Monotonic.
- **Strictly worse scoring higher:** yes, twice. dead-everywhere-1 (84.7) is above unreachable-page (82.2), and c6-one-speaker-missing (90.6) is above c2-good-slips (90.3) (problem 3).
- **Exactly the goal but 10%, 30% and 50% smaller:** 101.0, 102.9, 104.9. Monotonic and modest. Sensible. The two sites at their own size (r1, p1, c1) get exactly 100 with no bonus.
- **Repeats:** identical. Self-grades: exactly 100.

## Feedback text

Lines that are untrue, misleading, not what a person would say first, or awkward:

- r5-form-lost: "On the reservations page: the part with '18:00' is missing". A person says "the booking form is missing".
- r5-form-lost: "On the reservations page: the label 'Name' has different words from the goal's: missing 'name'; has 'to', 'book', 'a' and 18 more where the goal does not". Misleading: there is no label; a paragraph was paired with it.
- r7: "On the reservations page: 6 pieces of text should be bold, such as the form field '18:00'". The fault is labels replaced by placeholders, not boldness.
- r8: "On the home page: the section with 'Home' is missing". Untrue: the Home link is there; it is the styled header that is missing.
- x4: "The find us page's content is on the menu page, not on a page of its own". The content is on `info.html`, which was paired with the menu page; the player never made a "menu page".
- x9: "On the home page: the page background is light grey where the goal's is white". The goal's background is cream. Nothing says the first thing a person would say: "your pages are pictures; there is no text and the form cannot be used".
- x2: "On the about page: the heading says 'I design and build calm, useful softw...' where the goal says 'About'". True, but the first thing to say is "every page is a copy of the home page".
- x3: nothing says "these pages are empty stubs". It lists missing sections one by one.
- c2: "On the tickets page: the part with '1' is missing". This is the Quantity field.
- c3: "On the schedule page: the section with '09:00' is missing". The schedule is a list instead of a table.
- x7: "The ada lin page is empty" followed by "On the ada lin page: the section with 'Ada Lin' is missing". The same fault, said twice.
- p5: "On the on color page: the link 'Older: Notes on grids' is missing" and "The on color page has no link to the grid notes page". The same fault twice.
- Repetition instead of one site-wide line: r2 "the link 'Opening hours' is missing" (4 lines, one per page); r7 the missing `lang` (4 lines); c7 "the page background is dark where the goal's is light" (8 lines, so the 8-line limit is spent on one fault); probe unreachable-page "the link 'Services' is missing" (7 lines).
- Page names come from file names, in lower case: "the on color page" (the title is "On colour"), "the dev patel page", "the faq page". A person says "Dev Patel's page" or "the FAQ page".
- Good lines: "Nothing reaches the services page: the 9 links meant for it lead to x-services.html, which is not in the site"; "The emi sato page was never made"; "The site is 1.7 times the size of the goal"; "15 links are broken: the home page's 'Projects' link opens the about page instead of the projects page".

As a whole: for link and page faults, the feedback would help a player fix their prompt. It names the page, the link and the file. For content faults it names a sample piece of text ('18:00', '1', '09:00') instead of the thing a person would name (a form, a field, a table), and it spends its 8 lines repeating one site-wide fault page by page. A player would often need to look at the screenshots to understand it.

## What is good

- Exact rebuilds with entirely different class names score exactly 100 on all three goals, with no bonus unless leaner. Self-grades are exactly 100, repeats are identical, and a grade takes 1.5 s.
- Ordering is right in 24 of 25 checks. Poor, mediocre, good and excellent separate cleanly on all three goals.
- Pairing is robust. Posts moved from `blog/2026/` to `blog/` were paired correctly. Swapped page content was paired by content and the links were charged as "opens the about page instead of the projects page", which is exactly right.
- The wrong-relative-path case (every link on deep pages missing `../`, p2) scores 50.1, inside its band, with one clear feedback line.
- Invisible links (1px text in the background colour) are ignored, meta-refresh pages are graded as empty, and the catch-all page gets only partial moved-content credit.
- Unreachable pages and missing pages are charged in proportion and the feedback says so plainly. Dead-link counts are monotonic. The leaner-than-goal bonus is monotonic and modest.
- Accessibility faults (missing `lang`, unlabelled fields) are found and decide engineering where they should (r7).

## Runner output

```
=== BANDED CASES ===

### restaurant: goal against itself 100.0 (bonus 0)

restaurant/r1-excellent  band 92-100  TOTAL 100.0  ok  (0.9 s)
  works 100.0  looks 99.9  engineering 100.0  bonus 0.0  exact true
  eng: efficiency 100.0  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 9.9 KB vs 9.9 KB (credit 100.0)
  links: score 100.0  found 12/12  broken 0  missing 0  orphaned []  factor 1.000
  pages: index.html 100.0; find-us.html 100.0; menu.html 100.0; reservations.html 100.0

restaurant/r2-good-slips  band 80-92  TOTAL 84.2  ok  (0.9 s)
  works 85.9  looks 79.2  engineering 100.0  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 9.6 KB vs 9.9 KB (credit 100.0)
  links: score 100.0  found 12/12  broken 0  missing 0  orphaned []  factor 1.000
  pages: index.html 84.9; find-us.html 74.5; menu.html 73.7; reservations.html 86.6
  - [1.8] On the menu page: the box with 'Affogato' is missing
  - [1.7] On the find us page: 2 table cells are missing
  - [1.6] On the home page: the link 'Opening hours' is missing
  - [1.6] On the reservations page: the link 'Opening hours' is missing
  - [1.2] On the find us page: the link 'Opening hours' is missing
  - [1.2] On the menu page: the link 'Opening hours' is missing
  - [0.5] On the home page: colours across the page are slightly off: for example, the heading 'Wood-fired food, slow evenings' is a lighter dark green than the goal's
  - [0.5] On the menu page: colours across the page are slightly off: for example, the heading 'Menu' is a lighter dark green than the goal's

restaurant/r3-mediocre  band 52-66  TOTAL 52.8  ok  (1.0 s)
  works 62.1  looks 36.4  engineering 86.8  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 86.8  cleanCode 100.0  decidedBy accessibility
  size 7.6 KB vs 9.9 KB (credit 100.0)
  links: score 100.0  found 12/12  broken 0  missing 0  orphaned []  factor 1.000
  pages: index.html 48.2; find-us.html 37.0; menu.html 42.6; reservations.html 41.0
  - [3.0] On the find us page: the section with 'Opening hours' is missing
  - [2.1] On the find us page: the link 'Olive & Ember' sits about 420 pixels too far right
  - [2.0] On the home page: the dark green section near the bottom is missing
  - [1.8] On the find us page: the dark green section near the bottom is missing
  - [1.6] On the home page: the link 'Olive & Ember' sits about 420 pixels too far right
  - [1.6] On the menu page: the section with 'Desserts' is missing
  - [1.5] On the menu page: the link 'Olive & Ember' sits about 420 pixels too far right
  - [1.4] On the find us page: the part with 'Find us' sits about 40 pixels too low and about 360 pixels too far left

restaurant/r4-poor  band 20-35  TOTAL 24.0  ok  (0.4 s)
  works 27.3  looks 19.1  engineering 86.8  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 86.8  cleanCode 100.0  decidedBy accessibility
  size 5.2 KB vs 6.5 KB (credit 100.0)
  links: score 16.7  found 2/12  broken 0  missing 10  orphaned []  factor 1.000
  pages: index.html 58.0; find-us.html 0.0; menu.html 49.3; reservations.html 0.0
  - [24.5] The find us page was never made
  - [24.5] The reservations page was never made
  - [3.0] On the menu page: the section with 'Starters' and 1 more like it are missing
  - [2.4] On the menu page: the dark green section near the bottom is missing
  - [2.2] On the menu page: colours across the page differ from the goal's: blue where the goal uses dark green, for example on the heading 'Menu'
  - [2.1] On the home page: the dark green section near the bottom is missing
  - [1.7] On the home page: colours across the page differ from the goal's: blue where the goal uses dark green, for example on the heading 'Wood-fired food, slow evenings'
  - [1.6] On the menu page: the text uses a sans-serif font where the goal uses a serif one (21 pieces of text)

restaurant/r5-form-lost  band 64-78  TOTAL 83.2  LENIENT by 5.2  (0.9 s)
  works 84.5  looks 79.3  engineering 100.0  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 9.3 KB vs 9.9 KB (credit 100.0)
  links: score 100.0  found 12/12  broken 0  missing 0  orphaned []  factor 1.000
  pages: index.html 100.0; find-us.html 100.0; menu.html 100.0; reservations.html 58.4
  - [10.7] On the reservations page: the part with '18:00' is missing
  - [6.1] On the reservations page: the label 'Name' has different words from the goal's: missing 'name'; has 'to', 'book', 'a' and 18 more where the goal does not

restaurant/r6-css-3x  band 76-90  TOTAL 96.3  LENIENT by 6.3  (0.9 s)
  works 100.0  looks 100.0  engineering 89.3  bonus 0.0  exact true
  eng: efficiency 89.3  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 16.4 KB vs 9.9 KB (credit 78.7)
  links: score 100.0  found 12/12  broken 0  missing 0  orphaned []  factor 1.000
  pages: index.html 100.0; find-us.html 100.0; menu.html 100.0; reservations.html 100.0
  - [3.7] The site is 1.7 times the size of the goal

restaurant/r7-pretty-poor-engineering  band 62-76  TOTAL 77.4  LENIENT by 1.4  (1.0 s)
  works 91.4  looks 68.7  engineering 73.9  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 73.9  cleanCode 95.0  decidedBy accessibility
  size 10.0 KB vs 9.9 KB (credit 100.0)
  links: score 100.0  found 12/12  broken 0  missing 0  orphaned []  factor 1.000
  pages: index.html 93.2; find-us.html 98.9; menu.html 96.3; reservations.html 68.8
  - [3.6] On the reservations page: 2 labels are missing
  - [2.1] On the find us page: the page does not say what language it is in: add a lang attribute to <html>, like lang="en"
  - [2.1] On the home page: the page does not say what language it is in: add a lang attribute to <html>, like lang="en"
  - [2.1] On the menu page: the page does not say what language it is in: add a lang attribute to <html>, like lang="en"
  - [2.1] On the reservations page: the page does not say what language it is in: add a lang attribute to <html>, like lang="en"
  - [1.9] On the reservations page: 6 pieces of text should be bold, such as the form field '18:00'
  - [1.8] On the reservations page: the label says 'Notes' where the goal says 'Notes (allergies, occasions)'
  - [0.6] On the reservations page: the label 'Email' is grey where the goal's is dark grey

restaurant/r8-plain-good-engineering  band 55-70  TOTAL 45.8  HARSH by 9.2  (1.2 s)
  works 53.2  looks 23.4  engineering 100.0  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 8.0 KB vs 9.9 KB (credit 100.0)
  links: score 100.0  found 12/12  broken 0  missing 0  orphaned []  factor 1.000
  pages: index.html 32.6; find-us.html 31.8; menu.html 31.5; reservations.html 33.3
  - [2.8] On the home page: the section with 'Home' is missing
  - [2.1] On the reservations page: the dark green section near the top is missing
  - [2.0] On the find us page: the section with '5pm – 11pm' is missing
  - [1.8] On the reservations page: the dark green section near the bottom is missing
  - [1.7] On the menu page: colours across the page differ from the goal's: blue where the goal uses light orange, for example on the link 'Olive & Ember'
  - [1.5] On the find us page: colours across the page differ from the goal's: blue where the goal uses light orange, for example on the link 'Olive & Ember'
  - [1.4] On the home page: colours across the page differ from the goal's: blue where the goal uses light orange, for example on the link 'Olive & Ember'
  - [1.3] On the menu page: 8 boxes are missing

restaurant/x4-cheat-catch-all  band 38-52  TOTAL 48.5  ok  (0.9 s)
  works 51.3  looks 43.1  engineering 96.3  bonus 0.0  exact false
  eng: efficiency 98.3  accessibility 96.3  cleanCode 100.0  decidedBy accessibility
  size 8.3 KB vs 6.5 KB (credit 96.7)
  links: score 16.7  found 2/12  broken 0  missing 10  orphaned []  factor 1.000
  pages: index.html 100.0; find-us.html(moved:info.html) 50.0; menu.html=>info.html 72.7; reservations.html(moved:info.html) 50.0
  - [19.3] The find us page's content is on the menu page, not on a page of its own
  - [19.3] The reservations page's content is on the menu page, not on a page of its own
  - [4.2] On the menu page: extra content the goal does not have: 'Address'
  - [3.9] On the menu page: extra content the goal does not have: 'Book a table'
  - [0.4] On the menu page: the page has 3 main headings: keep one <h1> and make the others <h2>
  - [0.3] On the menu page: the tag 'Menu' sits about 70 pixels too far left

restaurant/x5-form-button-nav  band 70-84  TOTAL 31.5  HARSH by 38.5  (1.1 s)
  works 32.3  looks 29.2  engineering 100.0  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 5.0 KB vs 4.3 KB (credit 100.0)
  links: score 0.0  found 0/12  broken 0  missing 12  orphaned [find-us.html, menu.html, reservations.html]  factor 1.000
  pages: index.html 69.1; find-us.html(orphan) 24.1; menu.html(orphan) 24.2; reservations.html(orphan) 28.5
  - [17.3] Nothing links to the reservations page, so visitors cannot reach it
  - [16.0] Nothing links to the find us page, so visitors cannot reach it
  - [16.0] Nothing links to the menu page, so visitors cannot reach it
  - [1.2] On the home page: the text is generally smaller than the goal's (5 pieces of text)
  - [1.0] On the home page: the link 'See the menu' is missing
  - [0.7] On the home page: the link 'See the menu' is dark grey where the goal's is white
  - [0.4] On the home page: the link 'Olive & Ember' should be bold
  - [0.4] On the reservations page: the text is generally smaller than the goal's (5 pieces of text)

restaurant/x9-cheat-pixel-image  band 5-18  TOTAL 24.3  LENIENT by 6.3  (1.2 s)
  works 37.7  looks 40.3  engineering -6.3  bonus 0.0  exact false
  eng: efficiency -6.3  accessibility 80.6  cleanCode 100.0  decidedBy efficiency
  size 272.8 KB vs 9.9 KB (credit -100.0)
  links: score 100.0  found 12/12  broken 0  missing 0  orphaned []  factor 1.000
  pages: index.html 32.6; find-us.html 34.6; menu.html 29.8; reservations.html 38.3
  - [11.5] The site is 28 times the size of the goal
  - [5.8] On the menu page: the section with 'Menu' is missing
  - [4.7] On the reservations page: the part with 'Book a table' is missing
  - [4.4] On the find us page: the section with 'Address' is missing
  - [3.3] On the home page: the page background is light grey where the goal's is white
  - [3.0] On the reservations page: the dark green section near the bottom is missing
  - [2.9] On the menu page: the dark green section near the bottom is missing
  - [2.5] On the find us page: the dark green section near the bottom is missing

### portfolio: goal against itself 100.0 (bonus 0)

portfolio/p1-excellent  band 93-100  TOTAL 100.0  ok  (1.4 s)
  works 100.0  looks 100.0  engineering 100.0  bonus 0.0  exact true
  eng: efficiency 100.0  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 15.5 KB vs 15.4 KB (credit 100.0)
  links: score 100.0  found 45/45  broken 0  missing 0  orphaned []  factor 1.000
  pages: index.html 100.0; about.html 100.0; blog/2026/grid-notes.html 100.0; blog/2026/on-color.html 100.0; blog/2026/quiet-tools.html 100.0; blog/index.html 100.0; contact.html 100.0; projects.html 100.0

portfolio/p2-inner-nav-wrong  band 42-56  TOTAL 50.1  ok  (1.4 s)
  works 85.6  looks 100.0  engineering 100.0  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 15.1 KB vs 15.4 KB (credit 100.0)
  links: score 42.2  found 19/45  broken 44  missing 26  orphaned []  factor 0.562
    broken: blog/2026/grid-notes.html -> blog/2026/about.html | blog/2026/grid-notes.html -> blog/2026/blog/2026/on-color.html | blog/2026/grid-notes.html -> blog/2026/blog/2026/quiet-tools.html | blog/2026/grid-notes.html -> blog/2026/blog/index.html | blog/2026/grid-notes.html -> blog/2026/blog/index.html | blog/2026/grid-notes.html -> blog/2026/blog/index.html | blog/2026/grid-notes.html -> blog/2026/contact.html | blog/2026/grid-notes.html -> blog/2026/contact.html ...
  pages: index.html 100.0; about.html 100.0; blog/2026/grid-notes.html 100.0; blog/2026/on-color.html 100.0; blog/2026/quiet-tools.html 100.0; blog/index.html 100.0; contact.html 100.0; projects.html 100.0
  - [49.9] 44 links are broken: the grid notes page's "Mara Quinn" link leads to blog/2026/index.html, which is not in the site; the grid notes page's "Home" link leads to blog/2026/index.html, which is not in the site; the grid notes page's "Projects" link leads to blog/2026/projects.html, which is not in the site; ...

portfolio/p3-content-swapped  band 56-70  TOTAL 72.3  LENIENT by 2.3  (1.5 s)
  works 92.2  looks 87.6  engineering 100.0  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 15.5 KB vs 15.4 KB (credit 100.0)
  links: score 68.9  found 31/45  broken 15  missing 14  orphaned []  factor 0.794
    broken: about.html -> about.html | blog/2026/grid-notes.html -> about.html | blog/2026/grid-notes.html -> projects.html | blog/2026/on-color.html -> about.html | blog/2026/on-color.html -> projects.html | blog/2026/quiet-tools.html -> about.html | blog/2026/quiet-tools.html -> projects.html | blog/index.html -> about.html ...
  pages: index.html 100.0; about.html=>projects.html 88.6; blog/2026/grid-notes.html 100.0; blog/2026/on-color.html 100.0; blog/2026/quiet-tools.html 100.0; blog/index.html 100.0; contact.html 100.0; projects.html=>about.html 88.6
  - [24.6] 15 links are broken: the home page's "Projects" link opens the about page instead of the projects page; the home page's "About" link opens the projects page instead of the about page; the home page's "View all projects" link opens the about page instead of the projects page; ...
  - [0.2] On the about page: the link 'About' is dark blue where the goal's is orange
  - [0.2] On the projects page: the link 'Projects' is dark blue where the goal's is orange
  - [0.1] On the about page: the link 'About' should be bold
  - [0.1] On the about page: the link 'Projects' is orange where the goal's is dark blue
  - [0.1] On the about page: the link 'Projects' should not be bold
  - [0.1] On the projects page: the link 'About' is orange where the goal's is dark blue
  - [0.1] On the projects page: the link 'About' should not be bold

portfolio/p4-crumbs-footer-wrong  band 58-72  TOTAL 80.4  LENIENT by 8.4  (1.4 s)
  works 100.0  looks 100.0  engineering 100.0  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 15.4 KB vs 15.4 KB (credit 100.0)
  links: score 100.0  found 45/45  broken 14  missing 0  orphaned []  factor 0.804
    broken: about.html -> contact | blog/2026/grid-notes.html -> blog/2026/contact | blog/2026/grid-notes.html -> blog/2026/index.html | blog/2026/grid-notes.html -> index.html | blog/2026/on-color.html -> blog/2026/contact | blog/2026/on-color.html -> blog/2026/index.html | blog/2026/on-color.html -> index.html | blog/2026/quiet-tools.html -> blog/2026/contact ...
  pages: index.html 100.0; about.html 100.0; blog/2026/grid-notes.html 100.0; blog/2026/on-color.html 100.0; blog/2026/quiet-tools.html 100.0; blog/index.html 100.0; contact.html 100.0; projects.html 100.0
  - [19.6] 14 links are broken: the home page's "Email me" link leads to contact, which is not in the site; the about page's "Email me" link leads to contact, which is not in the site; the grid notes page's "Home" link leads to blog/2026/index.html, which is not in the site; ...

portfolio/p5-good-slips  band 80-92  TOTAL 91.3  ok  (1.5 s)
  works 92.6  looks 87.5  engineering 100.0  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 15.3 KB vs 15.4 KB (credit 100.0)
  links: score 97.8  found 44/45  broken 0  missing 1  orphaned []  factor 1.000
  pages: index.html 97.1; about.html 80.5; blog/2026/grid-notes.html 98.2; blog/2026/on-color.html 86.3; blog/2026/quiet-tools.html 98.6; blog/index.html 96.0; contact.html 98.1; projects.html 98.4
  - [3.1] On the about page: the part with 'What I do' is missing
  - [0.8] On the on color page: the link 'Older: Notes on grids' is missing
  - [0.4] The on color page has no link to the grid notes page
  - [0.2] On the about page: the link 'About' is brown where the goal's is orange
  - [0.2] On the home page: colours across the page differ from the goal's: brown where the goal uses orange, for example on the link 'Home'
  - [0.1] On the about page: the link 'Email me' is brown where the goal's is orange
  - [0.1] On the blog page: the link 'Blog' is brown where the goal's is orange
  - [0.1] On the blog page: the link 'Notes on grids' is brown where the goal's is orange

portfolio/p6-mediocre  band 52-66  TOTAL 74.5  LENIENT by 8.5  (1.5 s)
  works 87.9  looks 44.2  engineering 91.7  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 91.7  cleanCode 100.0  decidedBy accessibility
  size 13.6 KB vs 15.4 KB (credit 100.0)
  links: score 100.0  found 45/45  broken 0  missing 0  orphaned []  factor 1.000
  pages: index.html 71.1; about.html 75.3; blog/2026/grid-notes.html=>blog/grid-notes.html 74.6; blog/2026/on-color.html=>blog/on-color.html 74.9; blog/2026/quiet-tools.html=>blog/quiet-tools.html 74.9; blog/index.html 72.2; contact.html 59.4; projects.html 50.1
  - [2.0] On the projects page: 2 boxes are missing
  - [1.5] On the contact page: the part with 'Message' is missing
  - [1.2] On the projects page: colours across the page differ from the goal's: white where the goal uses dark blue, for example on the link 'Mara Quinn'
  - [1.1] On the projects page: 2 pictures are missing
  - [1.0] On the contact page: colours across the page differ from the goal's: white where the goal uses dark blue, for example on the link 'Mara Quinn'
  - [0.9] On the home page: colours across the page differ from the goal's: white where the goal uses dark blue, for example on the link 'Mara Quinn'
  - [0.9] On the projects page: the text uses a serif font where the goal uses a sans-serif one (14 pieces of text)
  - [0.8] On the blog page: colours across the page differ from the goal's: white where the goal uses dark blue, for example on the link 'Mara Quinn'

portfolio/p7-poor  band 12-26  TOTAL 19.1  ok  (0.4 s)
  works 19.8  looks 16.9  engineering 100.0  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 4.9 KB vs 4.9 KB (credit 100.0)
  links: score 4.4  found 2/45  broken 0  missing 43  orphaned []  factor 1.000
  pages: index.html 86.7; about.html 0.0; blog/2026/grid-notes.html 0.0; blog/2026/on-color.html 0.0; blog/2026/quiet-tools.html 0.0; blog/index.html 84.8; contact.html 0.0; projects.html 0.0
  - [13.6] The about page was never made
  - [13.6] The contact page was never made
  - [13.6] The projects page was never made
  - [12.4] The grid notes page was never made
  - [12.0] The on color page was never made
  - [12.0] The quiet tools page was never made
  - [0.8] On the blog page: colours across the page differ from the goal's: purple where the goal uses orange, for example on the link 'Blog'
  - [0.7] On the home page: colours across the page differ from the goal's: purple where the goal uses orange, for example on the link 'Home'

portfolio/p8-orphan-post  band 70-82  TOTAL 80.7  ok  (1.5 s)
  works 80.7  looks 81.0  engineering 100.0  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 13.5 KB vs 13.7 KB (credit 100.0)
  links: score 80.0  found 36/45  broken 0  missing 9  orphaned [blog/2026/on-color.html]  factor 1.000
  pages: index.html 82.6; about.html 100.0; blog/2026/grid-notes.html 88.0; blog/2026/on-color.html(orphan) 30.5; blog/2026/quiet-tools.html 100.0; blog/index.html 76.7; contact.html 100.0; projects.html 100.0
  - [9.2] Nothing links to the on color page, so visitors cannot reach it
  - [3.0] On the blog page: the box with 'On colour' is missing
  - [1.2] On the home page: the box with 'On colour' is missing
  - [0.8] On the grid notes page: the link 'Newer: On colour' is missing
  - [0.1] On the on color page: the link 'Older: Notes on grids' is missing

portfolio/x2-cheat-home-cloned  band 8-20  TOTAL 48.6  LENIENT by 28.6  (1.8 s)
  works 53.4  looks 45.3  engineering 84.9  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 84.9  cleanCode 100.0  decidedBy accessibility
  size 12.9 KB vs 15.4 KB (credit 100.0)
  links: score 100.0  found 45/45  broken 0  missing 0  orphaned []  factor 1.000
  pages: index.html 100.0; about.html 36.2; blog/2026/grid-notes.html 38.8; blog/2026/on-color.html 38.9; blog/2026/quiet-tools.html 38.6; blog/index.html 36.5; contact.html 34.9; projects.html 25.1
  - [2.4] On the projects page: the section with 'Harbour timetable' is missing
  - [2.1] On the about page: the heading says 'I design and build calm, useful softw...' where the goal says 'About'
  - [1.9] On the about page: the section with 'What I do' is missing
  - [1.4] On the contact page: the heading says 'I design and build calm, useful softw...' where the goal says 'Contact'
  - [1.4] On the contact page: the part with 'Send message' is missing
  - [1.2] On the blog page: the heading says 'I design and build calm, useful softw...' where the goal says 'Blog'
  - [1.1] On the blog page: 2 pieces of text are missing
  - [1.1] On the grid notes page: 2 pieces of text are missing

portfolio/x6-image-map-nav  band 74-88  TOTAL 71.9  HARSH by 2.1  (1.6 s)
  works 72.2  looks 76.7  engineering 94.4  bonus 0.0  exact false
  eng: efficiency 94.4  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 19.6 KB vs 14.0 KB (credit 88.9)
  links: score 57.8  found 26/45  broken 0  missing 19  orphaned [about.html]  factor 1.000
  pages: index.html 84.5; about.html(orphan) 29.6; blog/2026/grid-notes.html 84.5; blog/2026/on-color.html 84.5; blog/2026/quiet-tools.html 84.5; blog/index.html 84.5; contact.html 84.5; projects.html 84.5
  - [9.9] Nothing links to the about page, so visitors cannot reach it
  - [1.4] The site is 1.4 times the size of the goal
  - [1.0] On the blog page: 5 links are missing
  - [1.0] On the contact page: 5 links are missing
  - [1.0] On the grid notes page: 5 links are missing
  - [1.0] On the home page: 5 links are missing
  - [1.0] On the on color page: 5 links are missing
  - [1.0] On the projects page: 5 links are missing

portfolio/x8-cheat-hidden-words  band 10-24  TOTAL 31.6  LENIENT by 7.6  (1.5 s)
  works 31.1  looks 33.3  engineering 100.0  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 7.8 KB vs 10.3 KB (credit 100.0)
  links: score 44.4  found 20/45  broken 0  missing 25  orphaned [blog/2026/grid-notes.html, blog/2026/on-color.html, blog/2026/quiet-tools.html]  factor 1.000
  pages: index.html 45.0; about.html 44.1; blog/2026/grid-notes.html(orphan) 13.0; blog/2026/on-color.html(orphan) 13.3; blog/2026/quiet-tools.html(orphan) 13.2; blog/index.html 32.3; contact.html 51.8; projects.html 27.9
  - [6.1] Nothing links to the grid notes page, so visitors cannot reach it
  - [5.8] Nothing links to the on color page, so visitors cannot reach it
  - [5.8] Nothing links to the quiet tools page, so visitors cannot reach it
  - [4.5] On the projects page: 4 boxes are missing
  - [4.3] On the home page: the section with 'Latest writing' is missing
  - [3.9] On the blog page: 3 boxes are missing
  - [3.0] On the about page: the section with 'What I do' is missing
  - [2.8] On the contact page: the part with 'Send message' is missing

### conference: goal against itself 100.0 (bonus 0)

conference/c1-excellent  band 93-100  TOTAL 100.0  ok  (1.9 s)
  works 100.0  looks 100.0  engineering 100.0  bonus 0.0  exact true
  eng: efficiency 100.0  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 22.9 KB vs 22.7 KB (credit 100.0)
  links: score 100.0  found 65/65  broken 0  missing 0  orphaned []  factor 1.000
  pages: index.html 100.0; faq.html 100.0; schedule.html 100.0; speakers.html 100.0; speakers/ada-lin.html 100.0; speakers/ben-okafor.html 100.0; speakers/carla-diaz.html 100.0; speakers/dev-patel.html 100.0; speakers/emi-sato.html 100.0; speakers/femi-adeyemi.html 100.0; tickets.html 100.0

conference/c2-good-slips  band 80-92  TOTAL 90.3  ok  (1.9 s)
  works 90.6  looks 89.4  engineering 100.0  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 22.6 KB vs 22.7 KB (credit 100.0)
  links: score 98.5  found 64/65  broken 0  missing 1  orphaned []  factor 1.000
  pages: index.html 100.0; faq.html 100.0; schedule.html 74.1; speakers.html 100.0; speakers/ada-lin.html 100.0; speakers/ben-okafor.html 100.0; speakers/carla-diaz.html 100.0; speakers/dev-patel.html 85.8; speakers/emi-sato.html 100.0; speakers/femi-adeyemi.html 100.0; tickets.html 83.7
  - [2.4] On the schedule page: the part with '15:30' is missing
  - [1.0] On the tickets page: the part with '1' is missing
  - [0.9] On the dev patel page: the heading says 'Research in local government' where the goal says 'Research inside a council'
  - [0.7] On the schedule page: the table cell says 'Research in local government' where the goal says 'Research inside a council'
  - [0.3] The schedule page has no link to the femi adeyemi page

conference/c3-mediocre  band 50-64  TOTAL 64.6  LENIENT by 0.6  (1.7 s)
  works 71.0  looks 45.1  engineering 100.0  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 18.5 KB vs 22.7 KB (credit 100.0)
  links: score 90.8  found 59/65  broken 0  missing 6  orphaned []  factor 1.000
  pages: index.html 81.6; faq.html 68.4; schedule.html 53.9; speakers.html 78.3; speakers/ada-lin.html 50.6; speakers/ben-okafor.html 51.9; speakers/carla-diaz.html 48.8; speakers/dev-patel.html 53.0; speakers/emi-sato.html 53.4; speakers/femi-adeyemi.html 52.2; tickets.html 81.6
  - [2.2] On the schedule page: the section with '09:00' is missing
  - [1.9] On the carla diaz page: the section with 'Field notes as a team sport' is missing
  - [1.8] On the ada lin page: the section with 'Listening before asking' is missing
  - [1.8] On the ben okafor page: the section with 'Diary studies that people finish' is missing
  - [1.8] On the femi adeyemi page: the section with 'Turning notes into decisions' is missing
  - [1.7] On the dev patel page: the section with 'Research inside a council' is missing
  - [1.7] On the emi sato page: the section with 'What the photos leave out' is missing
  - [1.7] The schedule page has no links to the ada lin, ben okafor, carla diaz, dev patel, emi sato and femi adeyemi pages

conference/c4-poor  band 20-34  TOTAL 21.8  ok  (0.9 s)
  works 23.8  looks 16.0  engineering 100.0  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 11.0 KB vs 12.6 KB (credit 100.0)
  links: score 18.5  found 12/65  broken 0  missing 53  orphaned []  factor 1.000
  pages: index.html 73.6; faq.html 0.0; schedule.html 55.9; speakers.html 58.3; speakers/ada-lin.html 0.0; speakers/ben-okafor.html 0.0; speakers/carla-diaz.html 0.0; speakers/dev-patel.html 0.0; speakers/emi-sato.html 0.0; speakers/femi-adeyemi.html 0.0; tickets.html 55.0
  - [10.6] The faq page was never made
  - [8.6] The ada lin page was never made
  - [8.6] The ben okafor page was never made
  - [8.6] The carla diaz page was never made
  - [8.3] The dev patel page was never made
  - [8.3] The emi sato page was never made
  - [8.3] The femi adeyemi page was never made
  - [1.3] On the tickets page: the part with 'Reserve tickets' is missing

conference/c5-inline-css-every-page  band 80-93  TOTAL 91.9  ok  (1.8 s)
  works 100.0  looks 100.0  engineering 76.9  bonus 0.0  exact true
  eng: efficiency 76.9  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 47.6 KB vs 22.7 KB (credit 53.8)
  links: score 100.0  found 65/65  broken 0  missing 0  orphaned []  factor 1.000
  pages: index.html 100.0; faq.html 100.0; schedule.html 100.0; speakers.html 100.0; speakers/ada-lin.html 100.0; speakers/ben-okafor.html 100.0; speakers/carla-diaz.html 100.0; speakers/dev-patel.html 100.0; speakers/emi-sato.html 100.0; speakers/femi-adeyemi.html 100.0; tickets.html 100.0
  - [8.1] The site is 2 times the size of the goal

conference/c6-one-speaker-missing  band 72-85  TOTAL 90.6  LENIENT by 5.6  (2.0 s)
  works 90.5  looks 90.9  engineering 100.0  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 21.4 KB vs 21.3 KB (credit 100.0)
  links: score 89.2  found 58/65  broken 0  missing 7  orphaned []  factor 1.000
  pages: index.html 100.0; faq.html 100.0; schedule.html 100.0; speakers.html 100.0; speakers/ada-lin.html 100.0; speakers/ben-okafor.html 100.0; speakers/carla-diaz.html 100.0; speakers/dev-patel.html 100.0; speakers/emi-sato.html 0.0; speakers/femi-adeyemi.html 100.0; tickets.html 100.0
  - [9.4] The emi sato page was never made

conference/c7-wrong-theme  band 58-72  TOTAL 66.0  ok  (1.7 s)
  works 88.0  looks 17.9  engineering 85.6  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 85.6  cleanCode 100.0  decidedBy accessibility
  size 22.9 KB vs 22.7 KB (credit 100.0)
  links: score 100.0  found 65/65  broken 0  missing 0  orphaned []  factor 1.000
  pages: index.html 57.3; faq.html 64.5; schedule.html 53.2; speakers.html 58.7; speakers/ada-lin.html 66.0; speakers/ben-okafor.html 65.7; speakers/carla-diaz.html 66.0; speakers/dev-patel.html 65.7; speakers/emi-sato.html 65.0; speakers/femi-adeyemi.html 65.2; tickets.html 55.9
  - [1.5] On the schedule page: the page background is dark where the goal's is light
  - [1.4] On the ada lin page: the page background is dark where the goal's is light
  - [1.4] On the ben okafor page: the page background is dark where the goal's is light
  - [1.4] On the carla diaz page: the page background is dark where the goal's is light
  - [1.4] On the dev patel page: the page background is dark where the goal's is light
  - [1.4] On the emi sato page: the page background is dark where the goal's is light
  - [1.4] On the faq page: the page background is dark where the goal's is light
  - [1.4] On the femi adeyemi page: the page background is dark where the goal's is light

conference/x1-cheat-tiny-links  band 25-40  TOTAL 37.1  ok  (2.1 s)
  works 36.8  looks 38.0  engineering 100.0  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 13.4 KB vs 12.6 KB (credit 100.0)
  links: score 4.6  found 3/65  broken 0  missing 62  orphaned [faq.html, speakers/ada-lin.html, speakers/ben-okafor.html, speakers/carla-diaz.html, speakers/dev-patel.html, speakers/emi-sato.html, speakers/femi-adeyemi.html]  factor 1.000
  pages: index.html 76.3; faq.html(orphan) 30.3; schedule.html 72.4; speakers.html 61.3; speakers/ada-lin.html(orphan) 30.3; speakers/ben-okafor.html(orphan) 30.3; speakers/carla-diaz.html(orphan) 30.3; speakers/dev-patel.html(orphan) 30.3; speakers/emi-sato.html(orphan) 30.3; speakers/femi-adeyemi.html(orphan) 30.3; tickets.html 86.7
  - [8.1] Nothing links to the faq page, so visitors cannot reach it
  - [6.0] Nothing links to the ada lin page, so visitors cannot reach it
  - [6.0] Nothing links to the ben okafor page, so visitors cannot reach it
  - [6.0] Nothing links to the carla diaz page, so visitors cannot reach it
  - [5.8] Nothing links to the dev patel page, so visitors cannot reach it
  - [5.8] Nothing links to the emi sato page, so visitors cannot reach it
  - [5.8] Nothing links to the femi adeyemi page, so visitors cannot reach it
  - [1.1] On the speakers page: 6 links are missing

conference/x3-cheat-stubs  band 15-30  TOTAL 54.1  LENIENT by 24.1  (2.2 s)
  works 58.3  looks 41.5  engineering 100.0  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 13.4 KB vs 22.7 KB (credit 100.0)
  links: score 90.8  found 59/65  broken 0  missing 6  orphaned []  factor 1.000
  pages: index.html 100.0; faq.html 36.1; schedule.html 27.1; speakers.html 50.4; speakers/ada-lin.html 45.3; speakers/ben-okafor.html 46.1; speakers/carla-diaz.html 44.6; speakers/dev-patel.html 46.1; speakers/emi-sato.html 47.8; speakers/femi-adeyemi.html 48.0; tickets.html 33.3
  - [4.9] On the schedule page: the section with '09:00' is missing
  - [4.9] On the tickets page: the section with '£180' is missing
  - [4.6] On the faq page: the part with 'Is the venue step-free?' is missing
  - [2.5] On the carla diaz page: the section with 'Field notes as a team sport' is missing
  - [2.4] On the ada lin page: the section with 'Listening before asking' is missing
  - [2.4] On the ben okafor page: the section with 'Diary studies that people finish' is missing
  - [2.4] On the dev patel page: the section with 'Research inside a council' is missing
  - [2.3] On the emi sato page: the section with 'What the photos leave out' is missing

conference/x7-cheat-meta-refresh  band 45-60  TOTAL 45.9  ok  (2.2 s)
  works 47.6  looks 47.8  engineering 89.4  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 89.4  cleanCode 100.0  decidedBy accessibility
  size 15.1 KB vs 22.7 KB (credit 100.0)
  links: score 53.8  found 35/65  broken 0  missing 30  orphaned []  factor 1.000
  pages: index.html 100.0; faq.html 100.0; schedule.html 100.0; speakers.html 100.0; speakers/ada-lin.html 1.8; speakers/ben-okafor.html 1.9; speakers/carla-diaz.html 1.8; speakers/dev-patel.html 1.9; speakers/emi-sato.html 1.9; speakers/femi-adeyemi.html 1.9; tickets.html 100.0
  - [8.4] The ada lin page is empty
  - [8.4] The ben okafor page is empty
  - [8.4] The carla diaz page is empty
  - [8.4] The dev patel page is empty
  - [8.4] The emi sato page is empty
  - [8.4] The femi adeyemi page is empty
  - [7.0] On the ada lin page: the section with 'Ada Lin' is missing
  - [7.0] On the ben okafor page: the section with 'Ben Okafor' is missing

=== ORDER CHECKS ===
  ok   restaurant/r1-excellent (100.0) > restaurant/r2-good-slips (84.2)
  ok   restaurant/r2-good-slips (84.2) > restaurant/r3-mediocre (52.8)
  ok   restaurant/r3-mediocre (52.8) > restaurant/r4-poor (24.0)
  ok   restaurant/r1-excellent (100.0) > restaurant/r5-form-lost (83.2)
  ok   restaurant/r2-good-slips (84.2) > restaurant/r5-form-lost (83.2)
  ok   restaurant/r1-excellent (100.0) > restaurant/r6-css-3x (96.3)
  ok   restaurant/r1-excellent (100.0) > restaurant/r7-pretty-poor-engineering (77.4)
  ok   restaurant/r3-mediocre (52.8) > restaurant/x9-cheat-pixel-image (24.3)
  ok   restaurant/r3-mediocre (52.8) > restaurant/x4-cheat-catch-all (48.5)
  ok   portfolio/p1-excellent (100.0) > portfolio/p5-good-slips (91.3)
  ok   portfolio/p5-good-slips (91.3) > portfolio/p6-mediocre (74.5)
  ok   portfolio/p6-mediocre (74.5) > portfolio/p7-poor (19.1)
  ok   portfolio/p1-excellent (100.0) > portfolio/p8-orphan-post (80.7)
  ok   portfolio/p8-orphan-post (80.7) > portfolio/p2-inner-nav-wrong (50.1)
  ok   portfolio/p5-good-slips (91.3) > portfolio/p3-content-swapped (72.3)
  ok   portfolio/p6-mediocre (74.5) > portfolio/x2-cheat-home-cloned (48.6)
  ok   portfolio/p6-mediocre (74.5) > portfolio/x8-cheat-hidden-words (31.6)
  ok   conference/c1-excellent (100.0) > conference/c2-good-slips (90.3)
  ok   conference/c2-good-slips (90.3) > conference/c3-mediocre (64.6)
  ok   conference/c3-mediocre (64.6) > conference/c4-poor (21.8)
  ok   conference/c1-excellent (100.0) > conference/c5-inline-css-every-page (91.9)
  FAIL conference/c2-good-slips (90.3) > conference/c6-one-speaker-missing (90.6)
  ok   conference/c3-mediocre (64.6) > conference/x3-cheat-stubs (54.1)
  ok   conference/c3-mediocre (64.6) > conference/x1-cheat-tiny-links (37.1)
  ok   conference/c6-one-speaker-missing (90.6) > conference/x7-cheat-meta-refresh (45.9)

=== PROBES (not banded) ===

### probe-3: goal against itself 100.0

probe-3/broken-layout  TOTAL 86.4    (0.4 s)
  works 88.0  looks 81.6  engineering 100.0  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 3.6 KB vs 3.6 KB (credit 100.0)
  links: score 100.0  found 6/6  broken 0  missing 0  orphaned []  factor 1.000
  pages: index.html 100.0; services.html 58.3; team.html 100.0
  - [2.7] On the services page: the part with 'Services' sits about 30 pixels too high and about 120 pixels too far left
  - [2.3] On the services page: the heading 'Services' is noticeably smaller than the goal's (14 px text instead of 40 px)
  - [2.2] On the services page: the heading 'Services two' sits about 20 pixels too low and about 220 pixels too far left
  - [2.0] On the services page: the part with 'Services three' sits about 10 pixels too low and about 190 pixels too far left
  - [1.6] On the services page: the part is on the left where the goal has it on the right
  - [0.8] On the services page: the text 'Harbor Clinic · 2 Pier Road' sits about 100 pixels too low

probe-3/dead-menu-link  TOTAL 80.3    (0.4 s)
  works 95.8  looks 100.0  engineering 100.0  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 3.6 KB vs 3.6 KB (credit 100.0)
  links: score 83.3  found 5/6  broken 1  missing 1  orphaned []  factor 0.829
    broken: index.html -> servics.html
  pages: index.html 100.0; services.html 100.0; team.html 100.0
  - [19.7] 1 link is broken: the home page's "Services" link leads to servics.html, which is not in the site

probe-3/unreachable-page  TOTAL 62.9    (0.4 s)
  works 60.2  looks 71.1  engineering 100.0  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 2.6 KB vs 2.6 KB (credit 100.0)
  links: score 33.3  found 2/6  broken 0  missing 4  orphaned [services.html]  factor 1.000
  pages: index.html 88.3; services.html(orphan) 35.0; team.html 88.3
  - [29.9] Nothing links to the services page, so visitors cannot reach it
  - [2.4] On the home page: the link 'Services' is missing
  - [2.4] On the team page: the link 'Services' is missing

### probe-10: goal against itself 100.0

probe-10/broken-layout  TOTAL 91.9    (1.5 s)
  works 92.5  looks 90.0  engineering 100.0  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 12.4 KB vs 12.4 KB (credit 100.0)
  links: score 100.0  found 90/90  broken 0  missing 0  orphaned []  factor 1.000
  pages: index.html 100.0; blog.html 100.0; careers.html 100.0; contact.html 100.0; faq.html 100.0; locations.html 100.0; news.html 100.0; prices.html 100.0; services.html 58.3; team.html 100.0
  - [1.6] On the services page: the part with 'Services' sits about 30 pixels too high and about 120 pixels too far left
  - [1.4] On the services page: the heading 'Services' is noticeably smaller than the goal's (14 px text instead of 40 px)
  - [1.3] On the services page: the heading 'Services two' sits about 20 pixels too low and about 220 pixels too far left
  - [1.2] On the services page: the part with 'Services three' sits about 10 pixels too low and about 190 pixels too far left
  - [0.9] On the services page: the part is on the left where the goal has it on the right
  - [0.5] On the services page: the text 'Harbor Clinic · 2 Pier Road' sits about 100 pixels too low

probe-10/dead-everywhere-1  TOTAL 84.7    (1.5 s)
  works 90.1  looks 93.5  engineering 100.0  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 11.2 KB vs 11.2 KB (credit 100.0)
  links: score 80.0  found 72/90  broken 9  missing 18  orphaned [services.html]  factor 1.000
    broken: blog.html -> x-services.html | careers.html -> x-services.html | contact.html -> x-services.html | faq.html -> x-services.html | index.html -> x-services.html | locations.html -> x-services.html | news.html -> x-services.html | prices.html -> x-services.html ...
  pages: index.html 100.0; blog.html 100.0; careers.html 100.0; contact.html 100.0; faq.html 100.0; locations.html 100.0; news.html 100.0; prices.html 100.0; services.html(orphan) 35.0; team.html 100.0
  - [15.3] Nothing reaches the services page: the 9 links meant for it lead to x-services.html, which is not in the site

probe-10/dead-everywhere-2  TOTAL 76.3    (1.6 s)
  works 80.8  looks 87.0  engineering 100.0  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 10.1 KB vs 10.1 KB (credit 100.0)
  links: score 62.2  found 56/90  broken 16  missing 34  orphaned [services.html, team.html]  factor 1.000
    broken: blog.html -> x-services.html | blog.html -> x-team.html | careers.html -> x-services.html | careers.html -> x-team.html | contact.html -> x-services.html | contact.html -> x-team.html | faq.html -> x-services.html | faq.html -> x-team.html ...
  pages: index.html 100.0; blog.html 100.0; careers.html 100.0; contact.html 100.0; faq.html 100.0; locations.html 100.0; news.html 100.0; prices.html 100.0; services.html(orphan) 35.0; team.html(orphan) 35.0
  - [9.5] Nothing reaches the services page: the 8 links meant for it lead to x-services.html, which is not in the site
  - [9.5] Nothing reaches the team page: the 8 links meant for it lead to x-team.html, which is not in the site

probe-10/dead-everywhere-4  TOTAL 65.2    (1.7 s)
  works 63.8  looks 74.0  engineering 100.0  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 7.8 KB vs 7.8 KB (credit 100.0)
  links: score 33.3  found 30/90  broken 24  missing 60  orphaned [faq.html, prices.html, services.html, team.html]  factor 1.000
    broken: blog.html -> x-faq.html | blog.html -> x-prices.html | blog.html -> x-services.html | blog.html -> x-team.html | careers.html -> x-faq.html | careers.html -> x-prices.html | careers.html -> x-services.html | careers.html -> x-team.html ...
  pages: index.html 100.0; blog.html 100.0; careers.html 100.0; contact.html 100.0; faq.html(orphan) 35.0; locations.html 100.0; news.html 100.0; prices.html(orphan) 35.0; services.html(orphan) 35.0; team.html(orphan) 35.0
  - [7.6] Nothing reaches the faq page: the 6 links meant for it lead to x-faq.html, which is not in the site
  - [7.6] Nothing reaches the prices page: the 6 links meant for it lead to x-prices.html, which is not in the site
  - [7.6] Nothing reaches the services page: the 6 links meant for it lead to x-services.html, which is not in the site
  - [7.6] Nothing reaches the team page: the 6 links meant for it lead to x-team.html, which is not in the site

probe-10/dead-everywhere-8  TOTAL 39.4    (1.7 s)
  works 36.6  looks 48.0  engineering 100.0  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 3.1 KB vs 3.1 KB (credit 100.0)
  links: score 2.2  found 2/90  broken 16  missing 88  orphaned [blog.html, careers.html, contact.html, faq.html, locations.html, prices.html, services.html, team.html]  factor 1.000
    broken: index.html -> x-blog.html | index.html -> x-careers.html | index.html -> x-contact.html | index.html -> x-faq.html | index.html -> x-locations.html | index.html -> x-prices.html | index.html -> x-services.html | index.html -> x-team.html ...
  pages: index.html 100.0; blog.html(orphan) 35.0; careers.html(orphan) 35.0; contact.html(orphan) 35.0; faq.html(orphan) 35.0; locations.html(orphan) 35.0; news.html 100.0; prices.html(orphan) 35.0; services.html(orphan) 35.0; team.html(orphan) 35.0
  - [7.6] Nothing reaches the blog page: the 2 links meant for it lead to x-blog.html, which is not in the site
  - [7.6] Nothing reaches the careers page: the 2 links meant for it lead to x-careers.html, which is not in the site
  - [7.6] Nothing reaches the contact page: the 2 links meant for it lead to x-contact.html, which is not in the site
  - [7.6] Nothing reaches the faq page: the 2 links meant for it lead to x-faq.html, which is not in the site
  - [7.6] Nothing reaches the locations page: the 2 links meant for it lead to x-locations.html, which is not in the site
  - [7.6] Nothing reaches the prices page: the 2 links meant for it lead to x-prices.html, which is not in the site
  - [7.6] Nothing reaches the services page: the 2 links meant for it lead to x-services.html, which is not in the site
  - [7.6] Nothing reaches the team page: the 2 links meant for it lead to x-team.html, which is not in the site

probe-10/dead-home-1  TOTAL 97.2    (1.5 s)
  works 99.7  looks 100.0  engineering 100.0  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 12.4 KB vs 12.4 KB (credit 100.0)
  links: score 98.9  found 89/90  broken 1  missing 1  orphaned []  factor 0.974
    broken: index.html -> x-services.html
  pages: index.html 100.0; blog.html 100.0; careers.html 100.0; contact.html 100.0; faq.html 100.0; locations.html 100.0; news.html 100.0; prices.html 100.0; services.html 100.0; team.html 100.0
  - [2.8] 1 link is broken: the home page's "Services" link leads to x-services.html, which is not in the site

probe-10/dead-home-2  TOTAL 95.4    (1.6 s)
  works 99.4  looks 100.0  engineering 100.0  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 12.4 KB vs 12.4 KB (credit 100.0)
  links: score 97.8  found 88/90  broken 2  missing 2  orphaned []  factor 0.958
    broken: index.html -> x-services.html | index.html -> x-team.html
  pages: index.html 100.0; blog.html 100.0; careers.html 100.0; contact.html 100.0; faq.html 100.0; locations.html 100.0; news.html 100.0; prices.html 100.0; services.html 100.0; team.html 100.0
  - [4.6] 2 links are broken: the home page's "Services" link leads to x-services.html, which is not in the site; the home page's "Team" link leads to x-team.html, which is not in the site

probe-10/dead-home-4  TOTAL 92.4    (1.4 s)
  works 98.9  looks 100.0  engineering 100.0  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 12.4 KB vs 12.4 KB (credit 100.0)
  links: score 95.6  found 86/90  broken 4  missing 4  orphaned []  factor 0.932
    broken: index.html -> x-faq.html | index.html -> x-prices.html | index.html -> x-services.html | index.html -> x-team.html
  pages: index.html 100.0; blog.html 100.0; careers.html 100.0; contact.html 100.0; faq.html 100.0; locations.html 100.0; news.html 100.0; prices.html 100.0; services.html 100.0; team.html 100.0
  - [7.6] 4 links are broken: the home page's "Services" link leads to x-services.html, which is not in the site; the home page's "Team" link leads to x-team.html, which is not in the site; the home page's "Prices" link leads to x-prices.html, which is not in the site; ...

probe-10/dead-home-8  TOTAL 87.5    (1.6 s)
  works 97.8  looks 100.0  engineering 100.0  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 12.4 KB vs 12.4 KB (credit 100.0)
  links: score 91.1  found 82/90  broken 8  missing 8  orphaned []  factor 0.890
    broken: index.html -> x-blog.html | index.html -> x-careers.html | index.html -> x-contact.html | index.html -> x-faq.html | index.html -> x-locations.html | index.html -> x-prices.html | index.html -> x-services.html | index.html -> x-team.html
  pages: index.html 100.0; blog.html 100.0; careers.html 100.0; contact.html 100.0; faq.html 100.0; locations.html 100.0; news.html 100.0; prices.html 100.0; services.html 100.0; team.html 100.0
  - [12.5] 8 links are broken: the home page's "Services" link leads to x-services.html, which is not in the site; the home page's "Team" link leads to x-team.html, which is not in the site; the home page's "Prices" link leads to x-prices.html, which is not in the site; ...

probe-10/dead-menu-link  TOTAL 97.2    (1.6 s)
  works 99.7  looks 100.0  engineering 100.0  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 12.4 KB vs 12.4 KB (credit 100.0)
  links: score 98.9  found 89/90  broken 1  missing 1  orphaned []  factor 0.974
    broken: index.html -> servics.html
  pages: index.html 100.0; blog.html 100.0; careers.html 100.0; contact.html 100.0; faq.html 100.0; locations.html 100.0; news.html 100.0; prices.html 100.0; services.html 100.0; team.html 100.0
  - [2.8] 1 link is broken: the home page's "Services" link leads to servics.html, which is not in the site

probe-10/unreachable-page  TOTAL 82.2    (1.5 s)
  works 81.5  looks 84.5  engineering 100.0  bonus 0.0  exact false
  eng: efficiency 100.0  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 10.9 KB vs 11.2 KB (credit 100.0)
  links: score 80.0  found 72/90  broken 0  missing 18  orphaned [services.html]  factor 1.000
  pages: index.html 88.3; blog.html 88.3; careers.html 88.3; contact.html 88.3; faq.html 88.3; locations.html 88.3; news.html 88.3; prices.html 88.3; services.html(orphan) 35.0; team.html 88.3
  - [9.0] Nothing links to the services page, so visitors cannot reach it
  - [0.7] On the blog page: the link 'Services' is missing
  - [0.7] On the careers page: the link 'Services' is missing
  - [0.7] On the contact page: the link 'Services' is missing
  - [0.7] On the faq page: the link 'Services' is missing
  - [0.7] On the home page: the link 'Services' is missing
  - [0.7] On the locations page: the link 'Services' is missing
  - [0.7] On the news page: the link 'Services' is missing

### probe-size: goal against itself 100.0

probe-size/smaller-10pct  TOTAL 101.0    (1.6 s)
  works 100.0  looks 100.0  engineering 100.0  bonus 1.0  exact true
  eng: efficiency 100.0  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 25.3 KB vs 28.1 KB (credit 100.0)
  links: score 100.0  found 90/90  broken 0  missing 0  orphaned []  factor 1.000
  pages: index.html 100.0; blog.html 100.0; careers.html 100.0; contact.html 100.0; faq.html 100.0; locations.html 100.0; news.html 100.0; prices.html 100.0; services.html 100.0; team.html 100.0

probe-size/smaller-30pct  TOTAL 102.9    (1.6 s)
  works 100.0  looks 100.0  engineering 100.0  bonus 2.9  exact true
  eng: efficiency 100.0  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 19.7 KB vs 28.1 KB (credit 100.0)
  links: score 100.0  found 90/90  broken 0  missing 0  orphaned []  factor 1.000
  pages: index.html 100.0; blog.html 100.0; careers.html 100.0; contact.html 100.0; faq.html 100.0; locations.html 100.0; news.html 100.0; prices.html 100.0; services.html 100.0; team.html 100.0

probe-size/smaller-50pct  TOTAL 104.9    (1.6 s)
  works 100.0  looks 100.0  engineering 100.0  bonus 4.9  exact true
  eng: efficiency 100.0  accessibility 100.0  cleanCode 100.0  decidedBy efficiency
  size 14.2 KB vs 28.1 KB (credit 100.0)
  links: score 100.0  found 90/90  broken 0  missing 0  orphaned []  factor 1.000
  pages: index.html 100.0; blog.html 100.0; careers.html 100.0; contact.html 100.0; faq.html 100.0; locations.html 100.0; news.html 100.0; prices.html 100.0; services.html 100.0; team.html 100.0

=== MONOTONIC DEAD LINKS (cost must never fall) ===
  dead-home: 97.2 -> 95.4 -> 92.4 -> 87.5  ok
  dead-everywhere: 84.7 -> 76.3 -> 65.2 -> 39.4  ok

=== SUMMARY ===
  in band 17/32; order held 24/25
  outside: mean distance 10.3, worst 38.5
    restaurant/x5-form-button-nav: HARSH by 38.5
    portfolio/x2-cheat-home-cloned: LENIENT by 28.6
    conference/x3-cheat-stubs: LENIENT by 24.1
    restaurant/r8-plain-good-engineering: HARSH by 9.2
    portfolio/p6-mediocre: LENIENT by 8.5
    portfolio/p4-crumbs-footer-wrong: LENIENT by 8.4
    portfolio/x8-cheat-hidden-words: LENIENT by 7.6
    restaurant/r6-css-3x: LENIENT by 6.3
    restaurant/x9-cheat-pixel-image: LENIENT by 6.3
    conference/c6-one-speaker-missing: LENIENT by 5.6
    restaurant/r5-form-lost: LENIENT by 5.2
    portfolio/p3-content-swapped: LENIENT by 2.3
    portfolio/x6-image-map-nav: HARSH by 2.1
    restaurant/r7-pretty-poor-engineering: LENIENT by 1.4
    conference/c3-mediocre: LENIENT by 0.6
  time per grade: median 1.5 s, max 2.2 s over 87 grades
```

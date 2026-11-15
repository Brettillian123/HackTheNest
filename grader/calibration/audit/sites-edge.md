# Multi-page site edge cases: audit

53 attempts in 9 cases (`calibration/edge/sites/`, written by `sites-edge-gen.mts`). Human bands were fixed in `sites-edge.json` before grading. Run: `npx tsx calibration/audit/run-sites-edge.mts grade`.

Summary: 49 banded attempts. **20 agree, 25 lenient, 4 harsh**; all 4 refusals were right and clear. Every attempt gave the same total on both runs. Slowest grade 2.3 s, nothing near 15 s.

The main pattern: **a broken link that is not a 404 costs almost nothing.** The grader charges heavily for pages it can't reach and for links to files that don't exist. A menu item that does nothing, or one that leaves the site, costs about 1.5 points per page.

## Disagreements (worst first)

1. **links-bad / nav-external, nav-hash, nav-empty, nav-js-void.** Band 50-72; graded **96.9** (LENIENT by 25-31).
   - A person sees the About menu item doing nothing, or sending them to someone else's site, on every page.
   - The grader charged 2 "missing links" of 12, about 3 points. Works 95.8, looks 100. About is still reachable through the pricing button, so it is not orphaned.
   - Cause: `linkTarget` in `src/site.ts` returns null for `""`, `#...`, `javascript:` and outside addresses, so they are never "dead". `scoreSite` only counts them as missing goal links, which are worth 25% of works (`SITE.linkShare`). A visible link that goes nowhere is treated as if it didn't exist, not as a broken link.
2. **structure / one-page.** Band 40-58; graded **13.0** (HARSH by 27).
   - A person sees all the content on one long page with working anchor links: the wrong structure, but everything is there.
   - The grader said "The about page was never made" three times. Works 10.4, looks 21.8.
   - Cause: `pairPages` pairs whole pages only, and `scoreSite` gives an unpaired goal page 0 works and 0 looks. Content moved to another page earns nothing, so it scores like a blank site with a good home page.
3. **engineering / outside-20.** Band 55-72; graded **89.6** (LENIENT by 17.6).
   - A person sees 20 stylesheets that fail to load: broken requests, console errors, a slow first paint.
   - The grader made it about 2x slower on the model. Efficiency 70.3, so about -10.
   - Cause: `estimateLoadMs` in `src/performance.ts` counts each blocked request as one round trip. A failed outside request is priced as slowness only, never as a fault, and nothing in `scoreSite` treats failed resources as broken.
4. **links-bad / nav-typo.** Band 52-68; graded **84.0** (LENIENT by 16).
   - A person sees the About menu item 404 on every page.
   - The grader found 4 dead links with a factor of 0.867, plus 2 missing links.
   - Cause: in `scoreSite`, `deadShare` is dead links divided by all the goal's reachable links (about 14 here). The same broken menu item repeated on every page counts as 4 of 14, about 11% off. The 40% cap only applies when there are as many dead links as the goal has links.
5. **engineering / unlinked-200k-file.** Band 80-93; graded **65.0** (HARSH by 15).
   - A person sees a stray file in the folder that visitors never download.
   - The grader said "The site is 29 times the size of the goal". Efficiency 0.
   - Cause: `scoreSite` adds every candidate file to `bytes`, loaded or not. Meanwhile the goal's unloaded files (`unusedBytes`) are added to the reference. An unused file is charged the same as one every page downloads: only 12 points better than `unused-200k-linked` (52.7).
6. **docs-subfolder / broken-css-path.** Band 40-58; graded **72.4** (LENIENT by 14.4).
   - A person sees three of four pages as unstyled raw HTML.
   - The grader scored those pages about 50 each (works 79.8, looks 50.4). Efficiency was 100, because the missing stylesheets make the pages lighter.
   - Cause: the per-page `score` still gives raw HTML high content and layout marks, and the site layer never names a missing local stylesheet. The two stylesheet requests that 404 per page count only as blocked requests (time), and that time is outweighed by having no CSS. A missing local stylesheet is not a dead link.
7. **thirteen / missing-last 99.7 and missing-first 99.1.** Band 75-88 (LENIENT by 11-12).
   - A person sees one of the thirteen pages missing.
   - Cause, two parts:
     - (a) `prepareSite(…, strict=true)` cuts the goal to `SITE.maxPages` = 12 in `pagesOf` order, without saying so. `page-12.html` is never graded, and its links leave `expected` (22 instead of 24).
     - (b) In missing-first, `pairPages` lets an unnamed page that scores at least `pageMatchMinimum` (35) stand in. `page-12.html` stood in for the missing `page-01.html` at 95.2, because pages built from one template differ only in a few words.
   - On any templated site (product or route pages), a missing page can be covered by a sibling page almost for free.
8. **limits / not-html.** Band 50-66; graded **76.7** (LENIENT by 10.7).
   - A person sees About as unstyled plain text: a dead end with no menu.
   - The grader scored that page 21.9 and the other three 100. The lost links cost 4.4.
   - Cause: in `worksCreditOf` and `looksCreditOf`, one broken page is a quarter of the site, and its missing links are only 25% of works. Expected from the design, but a broken page costs less than a person would charge.

Also outside the band:
- **contact-self-only / contact-hidden-only:** 79.5 against 55-70, LENIENT by 9.5. An orphan keeps 50% (`SITE.orphanCredit`), so about -20. That is milder than "pretty significantly".
- **footer-nav:** 95.4 against 72-86, LENIENT by 9.4. The visual scorer weighs the small menu text lightly, so losing the header menu costs about 5.
- **upper-case:** 72.3 against 80-95, HARSH by 7.7. `linkTarget` is case-sensitive, so this is a fair call for Linux hosting. But the one fault is charged twice: about.html is orphaned (-17.5) and 3 dead links (-8).
- **home-is-home-html:** 69.8, LENIENT by 4.8.
- **two-clicks:** 94.7, LENIENT by 4.7.
- **extra-copies:** 96.2, LENIENT by 4.2.
- **all-home:** 48.4, LENIENT by 3.4.
- **btn-nav:** 98.1, LENIENT by 3.1.
- **renamed:** 100, LENIENT by 3.
- **subfolder:** 100, LENIENT by 2.
- **dead-of-many:** 96.7, LENIENT by 2.7.
- **flattened:** 100.1 with a 0.1 bonus, LENIENT by 5.1. Shorter paths count as leaner.
- **css-split-6:** 90.1, HARSH by 1.9.
- **one-css:** 102.3, LENIENT by 0.3.
- **extra-page:** 99.1, LENIENT by 0.1.
- **empty-index:** 25.1, LENIENT by 0.1.

For renamed, subfolder and flattened, my bands were probably harsh: a visitor sees no difference.

## Agreements
- links-ok/self 100.0; dot-slash 100.0; hash-team 100.0; root-slash 100.0; query 100.0. Link forms resolve correctly.
- links-ok/image-link 99.2: the image link is counted.
- links-ok/extra-links 99.0: extra links are free.
- docs-subfolder/self 100.0; folder-link 100.0 (`docs/` means `docs/index.html`); dotdot-roundabout 100.0 (`../index.html` and `../docs/x.html` both resolve).
- dead-of-few/one-dead 72.5: one dead link of three, priced as a person would.
- structure/merged 65.8: the missing Contact page is charged.
- engineering/minified 100.1: never below the goal. It only removed newlines (about 2% smaller), so +0.1 is proportionate.
- engineering/css-inline 96.7; bloated-2x 89.5; unused-200k-linked 52.7; base64-250k 62.8.
- limits/space-in-path 100.0 (`site%20styles.css` decodes); backslash-path 100.0 (`styles\site.css` normalised).
- thirteen/self 100.0.

## Errors and refusals
Each is 0 with `error` set, and the first feedback line repeats the reason after "The site could not be graded: ".
- files-41: "The site has more than 40 files." Clear. It could say how many files the site has.
- file-over-300k: `File "big.css" is larger than 300000 bytes.` Clear; names the file. "300 KB" would read better than a raw byte count.
- css-only: "The site has no .html page." Clear.
- dotdot-path: `"../outside.css" is not a valid file path inside the site.` Clear; names the path.
- backslash-path and space-in-path: graded, not refused, which is fair.
- empty-index: graded 25.1, not refused, which is fair. But the first feedback is three "Nothing links to the X page" lines. Nothing says the home page is empty.
- thirteen pages: no message at all. The 13th goal page is dropped without a word, to the challenge author or the player.

## Feedback text
- links-bad/nav-hash, nav-empty, nav-js-void, nav-external: "The home page has no link to the about page". Untrue: there is an About link, it just goes nowhere or off-site. It should say the link is broken.
- links-ok/image-link: "On the home page: the button 'See pricing' is missing". Untrue: it is there, drawn as an image.
- links-ok/footer-nav: "On the about page: the text 'About' is missing". Untrue: it moved to the footer. The real point, that the header menu is gone, is never stated.
- structure/one-page: "The about page was never made" (x3). Misleading: the content is on the home page. A person would first say "split this into separate pages".
- docs-subfolder/broken-css-path: "On the docs page: the dark blue section near the top is missing". This describes a symptom. The one-line cause, that `css/base.css` and `css/theme.css` don't exist at that path, is never mentioned.
- engineering/unlinked-200k-file: "The site is 29 times the size of the goal". Misleading: no page loads the file. It should name the unused file.
- engineering/outside-20: "The site asks for 20 files from outside addresses, or that it does not contain". Awkward English.
- engineering/css-split-6: "Pages load about 2 times slower than the goal's on a mid-range phone on 4G". An overstatement from the round-trip-heavy model on tiny pages: six small stylesheets instead of one.
- links-ok/extra-links: "the text 'Tidewater Bikes, Ypsilanti, Michigan....' is wider than the goal's (about 588 pixels wide instead of 371)". Misleading: the footer gained links; the text didn't get wider.
- thirteen/missing-first: "On the page 01 page: the text 'Route 01 runs 13 kilometres along the...' has different words from the goal's". Bad English ("page 01 page"). It's also wrong: page 01 is missing, and a different page is being compared.
- structure/home-is-home-html: "The home page has no links to the about, the contact and the pricing pages". Awkward ("the about, the contact and the pricing"). It also misses the point: the real home page is `home.html` behind a splash link.
- limits/not-html: "The about page has no links to the contact, the home and the pricing pages". Not what a person would mention first: the page isn't a styled HTML page at all.
- dead-of-few, nav-typo: the dead link and the "has no link to" line describe one fault, and both are charged.
- links-ok/btn-nav: "an extra dark blue box near the top right that the goal does not have". Vague: these are the restyled menu buttons.

## Inside the band but felt unfair
- limits/empty-index 25.1: a blank home page still earns 25, and accessibility, not "blank", decides engineering.
- engineering/css-split-6 90.1 (just under the band): -10 for five extra small requests is a lot for something nobody would raise.
- structure/merged 65.8: "The contact page was never made" (-29.7) prices merged content the same as missing content.
- docs-subfolder/flattened and one-css get a bonus over 100. one-css is fair. flattened is only shorter file paths.
- links-ok/upper-case: one wrong-case link is charged as orphan plus dead links at once.

## Full output of step 4
```
dead-of-few/one-dead  band 68-82  total 72.5 (repeat same)  works 87.5 / eng 100.0 / looks 100.0  [eff 100.0 a11y 100.0 clean 100.0 by efficiency]  links 1/2 broken 1 orphaned 0 deadFactor 0.800  ok  0.5s/0.5s
    broken: about.html -> indx.html
    pages: index.html 100.0; about.html 100.0
    -18.1  1 link leads to a page that does not exist: indx.html
    -7.5  The about page has no link to the home page
dead-of-many/one-dead  band 84-94  total 96.7 (repeat same)  works 100.0 / eng 100.0 / looks 100.0  [eff 100.0 a11y 100.0 clean 100.0 by efficiency]  links 12/12 broken 1 orphaned 0 deadFactor 0.967  LENIENT by 2.7  1.0s/0.9s
    broken: pricing.html -> contct.html
    pages: index.html 100.0; about.html 100.0; contact.html 100.0; pricing.html 100.0
    -3.3  1 link leads to a page that does not exist: contct.html
docs-subfolder/broken-css-path  band 40-58  total 72.4 (repeat same)  works 79.8 / eng 100.0 / looks 50.4  [eff 100.0 a11y 100.0 clean 100.0 by efficiency]  links 12/12 broken 0 orphaned 0 deadFactor 1.000  LENIENT by 14.4  0.9s/0.8s
    pages: index.html 100.0; docs/faq.html 53.5; docs/guide.html 47.3; docs/index.html 50.9
    -3.9  On the docs page: the dark blue section near the top is missing
    -3.8  On the faq page: the dark blue section near the top is missing
    -3.1  On the guide page: the dark blue section near the top is missing
docs-subfolder/dotdot-roundabout  band 96-101  total 100.0 (repeat same)  works 100.0 / eng 100.0 / looks 100.0  [eff 100.0 a11y 100.0 clean 100.0 by efficiency]  links 12/12 broken 0 orphaned 0 deadFactor 1.000  ok  0.8s/0.7s
    pages: index.html 100.0; docs/faq.html 100.0; docs/guide.html 100.0; docs/index.html 100.0
docs-subfolder/flattened  band 82-95  total 100.1 (repeat same)  works 100.0 / eng 100.0 / looks 100.0  bonus 0.1  [eff 100.0 a11y 100.0 clean 100.0 by efficiency]  links 12/12 broken 0 orphaned 0 deadFactor 1.000  LENIENT by 5.1  0.9s/0.8s
    pages: index.html 100.0; docs/faq.html=>faq.html 100.0; docs/guide.html=>guide.html 100.0; docs/index.html=>docs.html 100.0
docs-subfolder/folder-link  band 96-101  total 100.0 (repeat same)  works 100.0 / eng 100.0 / looks 100.0  [eff 100.0 a11y 100.0 clean 100.0 by efficiency]  links 12/12 broken 0 orphaned 0 deadFactor 1.000  ok  0.8s/0.8s
    pages: index.html 100.0; docs/faq.html 100.0; docs/guide.html 100.0; docs/index.html 100.0
docs-subfolder/one-css  band 97-102  total 102.3 (repeat same)  works 100.0 / eng 100.0 / looks 100.0  bonus 2.3  [eff 100.0 a11y 100.0 clean 100.0 by efficiency]  links 12/12 broken 0 orphaned 0 deadFactor 1.000  LENIENT by 0.3  0.8s/0.9s
    pages: index.html 100.0; docs/faq.html 100.0; docs/guide.html 100.0; docs/index.html 100.0
docs-subfolder/self  band 98-101  total 100.0 (repeat same)  works 100.0 / eng 100.0 / looks 100.0  [eff 100.0 a11y 100.0 clean 100.0 by efficiency]  links 12/12 broken 0 orphaned 0 deadFactor 1.000  ok  0.8s/0.8s
    pages: index.html 100.0; docs/faq.html 100.0; docs/guide.html 100.0; docs/index.html 100.0
engineering/base64-250k  band 55-72  total 62.8 (repeat same)  works 100.0 / eng -6.3 / looks 99.9  [eff -6.3 a11y 100.0 clean 100.0 by efficiency]  links 12/12 broken 0 orphaned 0 deadFactor 1.000  ok  0.9s/1.0s
    pages: index.html 99.8; about.html 100.0; contact.html 100.0; pricing.html 100.0
    -35.0  The site is 35 times the size of the goal
    -2.2  Pages load about 1.8 times slower than the goal's on a budget phone on slow 3G
engineering/bloated-2x  band 82-94  total 89.5 (repeat same)  works 100.0 / eng 70.1 / looks 100.0  [eff 70.1 a11y 100.0 clean 100.0 by efficiency]  links 12/12 broken 0 orphaned 0 deadFactor 1.000  ok  0.9s/0.8s
    pages: index.html 100.0; about.html 100.0; contact.html 100.0; pricing.html 100.0
    -10.5  The site is 2 times the size of the goal
engineering/css-inline  band 92-100  total 96.7 (repeat same)  works 100.0 / eng 90.5 / looks 100.0  [eff 90.5 a11y 100.0 clean 100.0 by efficiency]  links 12/12 broken 0 orphaned 0 deadFactor 1.000  ok  0.8s/0.8s
    pages: index.html 100.0; about.html 100.0; contact.html 100.0; pricing.html 100.0
    -3.3  The site is 1.5 times the size of the goal
engineering/css-split-6  band 92-100  total 90.1 (repeat same)  works 100.0 / eng 71.8 / looks 100.0  [eff 71.8 a11y 100.0 clean 100.0 by efficiency]  links 12/12 broken 0 orphaned 0 deadFactor 1.000  HARSH by 1.9  0.8s/0.8s
    pages: index.html 100.0; about.html 100.0; contact.html 100.0; pricing.html 100.0
    -9.9  Pages load about 2 times slower than the goal's on a mid-range phone on 4G
engineering/minified  band 100-108  total 100.1 (repeat same)  works 100.0 / eng 100.0 / looks 100.0  bonus 0.1  [eff 100.0 a11y 100.0 clean 100.0 by efficiency]  links 12/12 broken 0 orphaned 0 deadFactor 1.000  ok  0.8s/0.8s
    pages: index.html 100.0; about.html 100.0; contact.html 100.0; pricing.html 100.0
engineering/outside-20  band 55-72  total 89.6 (repeat same)  works 100.0 / eng 70.3 / looks 100.0  [eff 70.3 a11y 100.0 clean 100.0 by efficiency]  links 12/12 broken 0 orphaned 0 deadFactor 1.000  LENIENT by 17.6  0.8s/0.9s
    pages: index.html 100.0; about.html 100.0; contact.html 100.0; pricing.html 100.0
    -9.9  Pages load about 2 times slower than the goal's on a mid-range phone on 4G
    -9.9  The site asks for 20 files from outside addresses, or that it does not contain
    -0.5  The site is 1.2 times the size of the goal
engineering/unlinked-200k-file  band 80-93  total 65.0 (repeat same)  works 100.0 / eng 0.0 / looks 100.0  [eff 0.0 a11y 100.0 clean 100.0 by efficiency]  links 12/12 broken 0 orphaned 0 deadFactor 1.000  HARSH by 15.0  0.8s/0.9s
    pages: index.html 100.0; about.html 100.0; contact.html 100.0; pricing.html 100.0
    -35.0  The site is 29 times the size of the goal
engineering/unused-200k-linked  band 52-70  total 52.7 (repeat same)  works 100.0 / eng -35.0 / looks 100.0  [eff -35.0 a11y 100.0 clean 100.0 by efficiency]  links 12/12 broken 0 orphaned 0 deadFactor 1.000  ok  0.9s/0.8s
    pages: index.html 100.0; about.html 100.0; contact.html 100.0; pricing.html 100.0
    -35.0  The site is 29 times the size of the goal
    -12.3  Pages load about 4 times slower than the goal's on a budget phone on slow 3G
limits/backslash-path  band 95-101  total 100.0 (repeat same)  works 100.0 / eng 100.0 / looks 100.0  [eff 100.0 a11y 100.0 clean 100.0 by efficiency]  links 12/12 broken 0 orphaned 0 deadFactor 1.000  ok  0.9s/0.9s
    pages: index.html 100.0; about.html 100.0; contact.html 100.0; pricing.html 100.0
limits/css-only  band expect  total 0.0 (repeat same)  works 0.0 / eng 0.0 / looks 0.0  [no engineering]  links 0/0 broken 0 orphaned 0 deadFactor 1.000  refused  0.0s/0.0s
    pages: index.html=>MISSING 0.0; about.html=>MISSING 0.0; contact.html=>MISSING 0.0; pricing.html=>MISSING 0.0
    -100.0  The site could not be graded: The site has no .html page.
    ERROR: The site has no .html page.
limits/dotdot-path  band expect  total 0.0 (repeat same)  works 0.0 / eng 0.0 / looks 0.0  [no engineering]  links 0/0 broken 0 orphaned 0 deadFactor 1.000  refused  0.0s/0.0s
    pages: index.html=>MISSING 0.0; about.html=>MISSING 0.0; contact.html=>MISSING 0.0; pricing.html=>MISSING 0.0
    -100.0  The site could not be graded: "../outside.css" is not a valid file path inside the site.
    ERROR: "../outside.css" is not a valid file path inside the site.
limits/empty-index  band 5-25  total 25.1 (repeat same)  works 28.1 / eng 44.0 / looks 38.2  [eff 92.3 a11y 44.0 clean 64.9 by accessibility]  links 0/12 broken 0 orphaned 3 deadFactor 1.000  LENIENT by 0.1  0.7s/0.7s
    orphaned: about.html, contact.html, pricing.html
    pages: index.html 1.3; about.html 50.0 (orphan); contact.html 50.0 (orphan); pricing.html 50.0 (orphan)
    -12.9  Nothing links to the about page, so visitors cannot reach it
    -12.9  Nothing links to the contact page, so visitors cannot reach it
    -12.9  Nothing links to the pricing page, so visitors cannot reach it
limits/file-over-300k  band expect  total 0.0 (repeat same)  works 0.0 / eng 0.0 / looks 0.0  [no engineering]  links 0/0 broken 0 orphaned 0 deadFactor 1.000  refused  0.0s/0.0s
    pages: index.html=>MISSING 0.0; about.html=>MISSING 0.0; contact.html=>MISSING 0.0; pricing.html=>MISSING 0.0
    -100.0  The site could not be graded: File "big.css" is larger than 300000 bytes.
    ERROR: File "big.css" is larger than 300000 bytes.
limits/files-41  band expect  total 0.0 (repeat same)  works 0.0 / eng 0.0 / looks 0.0  [no engineering]  links 0/0 broken 0 orphaned 0 deadFactor 1.000  refused  0.0s/0.0s
    pages: index.html=>MISSING 0.0; about.html=>MISSING 0.0; contact.html=>MISSING 0.0; pricing.html=>MISSING 0.0
    -100.0  The site could not be graded: The site has more than 40 files.
    ERROR: The site has more than 40 files.
limits/not-html  band 50-66  total 76.7 (repeat same)  works 80.4 / eng 88.6 / looks 78.2  [eff 100.0 a11y 88.6 clean 91.2 by accessibility]  links 9/12 broken 0 orphaned 0 deadFactor 1.000  LENIENT by 10.7  0.7s/0.7s
    pages: index.html 100.0; about.html 21.9; contact.html 100.0; pricing.html 100.0
    -4.4  The about page has no links to the contact, the home and the pricing pages
    -2.8  On the about page: the dark blue section near the top is missing
    -2.3  On the about page: the text 'Today we build about two hundred bike...' is missing
limits/space-in-path  band 95-101  total 100.0 (repeat same)  works 100.0 / eng 100.0 / looks 100.0  [eff 100.0 a11y 100.0 clean 100.0 by efficiency]  links 12/12 broken 0 orphaned 0 deadFactor 1.000  ok  0.9s/0.8s
    pages: index.html 100.0; about.html 100.0; contact.html 100.0; pricing.html 100.0
links-bad/all-home  band 25-45  total 48.4 (repeat same)  works 46.9 / eng 85.7 / looks 62.5  [eff 85.7 a11y 100.0 clean 100.0 by efficiency]  links 0/12 broken 0 orphaned 3 deadFactor 1.000  LENIENT by 3.4  0.8s/0.8s
    orphaned: about.html, contact.html, pricing.html
    pages: index.html 100.0; about.html 50.0 (orphan); contact.html 50.0 (orphan); pricing.html 50.0 (orphan)
    -15.5  Nothing links to the about page, so visitors cannot reach it
    -15.5  Nothing links to the contact page, so visitors cannot reach it
    -15.5  Nothing links to the pricing page, so visitors cannot reach it
links-bad/contact-hidden-only  band 55-70  total 79.5 (repeat same)  works 77.2 / eng 99.9 / looks 86.6  [eff 99.9 a11y 100.0 clean 100.0 by efficiency]  links 6/12 broken 0 orphaned 1 deadFactor 1.000  LENIENT by 9.5  0.8s/0.9s
    orphaned: contact.html
    pages: index.html 98.9; about.html 98.3; contact.html 50.0 (orphan); pricing.html 98.4
    -19.5  Nothing links to the contact page, so visitors cannot reach it
    -0.3  On the about page: the text 'Contact' is missing
    -0.2  On the home page: the text 'Contact' is missing
links-bad/contact-self-only  band 55-70  total 79.5 (repeat same)  works 77.2 / eng 100.0 / looks 86.6  [eff 100.0 a11y 100.0 clean 100.0 by efficiency]  links 6/12 broken 0 orphaned 1 deadFactor 1.000  LENIENT by 9.5  0.8s/0.8s
    orphaned: contact.html
    pages: index.html 98.9; about.html 98.3; contact.html 50.0 (orphan); pricing.html 98.4
    -19.5  Nothing links to the contact page, so visitors cannot reach it
    -0.3  On the about page: the text 'Contact' is missing
    -0.2  On the home page: the text 'Contact' is missing
links-bad/nav-empty  band 58-72  total 96.9 (repeat same)  works 95.8 / eng 100.0 / looks 100.0  [eff 100.0 a11y 100.0 clean 100.0 by efficiency]  links 10/12 broken 0 orphaned 0 deadFactor 1.000  LENIENT by 24.9  0.9s/0.8s
    pages: index.html 100.0; about.html 100.0; contact.html 100.0; pricing.html 100.0
    -1.6  The contact page has no link to the about page
    -1.6  The home page has no link to the about page
links-bad/nav-external  band 50-66  total 96.9 (repeat same)  works 95.8 / eng 100.0 / looks 100.0  [eff 100.0 a11y 100.0 clean 100.0 by efficiency]  links 10/12 broken 0 orphaned 0 deadFactor 1.000  LENIENT by 30.9  0.8s/0.8s
    pages: index.html 100.0; about.html 100.0; contact.html 100.0; pricing.html 100.0
    -1.6  The contact page has no link to the about page
    -1.6  The home page has no link to the about page
links-bad/nav-hash  band 58-72  total 96.9 (repeat same)  works 95.8 / eng 100.0 / looks 100.0  [eff 100.0 a11y 100.0 clean 100.0 by efficiency]  links 10/12 broken 0 orphaned 0 deadFactor 1.000  LENIENT by 24.9  0.9s/0.8s
    pages: index.html 100.0; about.html 100.0; contact.html 100.0; pricing.html 100.0
    -1.6  The contact page has no link to the about page
    -1.6  The home page has no link to the about page
links-bad/nav-js-void  band 58-72  total 96.9 (repeat same)  works 95.8 / eng 100.0 / looks 100.0  [eff 100.0 a11y 100.0 clean 100.0 by efficiency]  links 10/12 broken 0 orphaned 0 deadFactor 1.000  LENIENT by 24.9  0.8s/1.0s
    pages: index.html 100.0; about.html 100.0; contact.html 100.0; pricing.html 100.0
    -1.6  The contact page has no link to the about page
    -1.6  The home page has no link to the about page
links-bad/nav-typo  band 52-68  total 84.0 (repeat same)  works 95.8 / eng 100.0 / looks 100.0  [eff 100.0 a11y 100.0 clean 100.0 by efficiency]  links 10/12 broken 4 orphaned 0 deadFactor 0.867  LENIENT by 16.0  0.8s/0.8s
    broken: about.html -> abuot.html, contact.html -> abuot.html, index.html -> abuot.html, pricing.html -> abuot.html
    pages: index.html 100.0; about.html 100.0; contact.html 100.0; pricing.html 100.0
    -12.9  4 links lead to pages that do not exist: abuot.html
    -1.4  The contact page has no link to the about page
    -1.4  The home page has no link to the about page
links-ok/btn-nav  band 85-95  total 98.1 (repeat same)  works 98.2 / eng 100.0 / looks 97.7  [eff 100.0 a11y 100.0 clean 100.0 by efficiency]  links 12/12 broken 0 orphaned 0 deadFactor 1.000  LENIENT by 3.1  1.0s/0.9s
    pages: index.html 98.3; about.html 97.4; contact.html 97.2; pricing.html 97.6
    -0.2  On the about page: an extra dark blue box near the top right that the goal does not have
    -0.2  On the contact page: an extra dark blue box near the top right that the goal does not have
    -0.2  On the pricing page: an extra dark blue box near the top right that the goal does not have
links-ok/dot-slash  band 97-101  total 100.0 (repeat same)  works 100.0 / eng 100.0 / looks 100.0  [eff 100.0 a11y 100.0 clean 100.0 by efficiency]  links 12/12 broken 0 orphaned 0 deadFactor 1.000  ok  0.8s/0.8s
    pages: index.html 100.0; about.html 100.0; contact.html 100.0; pricing.html 100.0
links-ok/extra-links  band 90-99  total 99.0 (repeat same)  works 98.9 / eng 100.0 / looks 99.5  [eff 100.0 a11y 100.0 clean 100.0 by efficiency]  links 12/12 broken 0 orphaned 0 deadFactor 1.000  ok  0.9s/0.7s
    pages: index.html 99.2; about.html 98.9; contact.html 98.7; pricing.html 98.9
    -0.2  On the about page: the text 'Tidewater Bikes, Ypsilanti, Michigan....' is wider than the goal's (about 588 pixels wide instead of 371)
    -0.2  On the contact page: the text 'Tidewater Bikes, Ypsilanti, Michigan....' is wider than the goal's (about 588 pixels wide instead of 371)
    -0.2  On the pricing page: the text 'Tidewater Bikes, Ypsilanti, Michigan....' is wider than the goal's (about 588 pixels wide instead of 371)
links-ok/extra-page  band 88-99  total 99.1 (repeat same)  works 99.3 / eng 99.0 / looks 99.8  [eff 99.0 a11y 100.0 clean 100.0 by efficiency]  links 12/12 broken 0 orphaned 0 deadFactor 1.000  LENIENT by 0.1  1.1s/1.1s
    pages: index.html 99.5; about.html 99.5; contact.html 99.3; pricing.html 99.3
    -0.3  The site is 1.2 times the size of the goal
    -0.1  On the about page: the text 'Tidewater Bikes, Ypsilanti, Michigan....' has different words from the goal's: has 'site', 'map' where the goal does not
    -0.1  On the contact page: the text 'Tidewater Bikes, Ypsilanti, Michigan....' has different words from the goal's: has 'site', 'map' where the goal does not
links-ok/footer-nav  band 72-86  total 95.4 (repeat same)  works 95.4 / eng 100.0 / looks 95.5  [eff 100.0 a11y 100.0 clean 100.0 by efficiency]  links 12/12 broken 0 orphaned 0 deadFactor 1.000  LENIENT by 9.4  0.9s/1.0s
    pages: index.html 96.2; about.html 94.2; contact.html 93.6; pricing.html 94.5
    -0.3  On the about page: the text 'About' is missing
    -0.3  On the about page: the text 'Contact' is missing
    -0.3  On the about page: the text 'Home' is missing
links-ok/hash-team  band 96-101  total 100.0 (repeat same)  works 100.0 / eng 100.0 / looks 100.0  [eff 100.0 a11y 100.0 clean 100.0 by efficiency]  links 12/12 broken 0 orphaned 0 deadFactor 1.000  ok  0.9s/0.8s
    pages: index.html 100.0; about.html 100.0; contact.html 100.0; pricing.html 100.0
links-ok/image-link  band 92-100  total 99.2 (repeat same)  works 99.2 / eng 100.0 / looks 99.1  [eff 100.0 a11y 100.0 clean 100.0 by efficiency]  links 12/12 broken 0 orphaned 0 deadFactor 1.000  ok  0.9s/0.9s
    pages: index.html 96.0; about.html 100.0; contact.html 100.0; pricing.html 100.0
    -0.7  On the home page: the button 'See pricing' is missing
    -0.1  On the home page: an extra image near the middle left that the goal does not have
links-ok/query  band 95-101  total 100.0 (repeat same)  works 100.0 / eng 100.0 / looks 100.0  [eff 100.0 a11y 100.0 clean 100.0 by efficiency]  links 12/12 broken 0 orphaned 0 deadFactor 1.000  ok  0.8s/0.9s
    pages: index.html 100.0; about.html 100.0; contact.html 100.0; pricing.html 100.0
links-ok/root-slash  band 95-101  total 100.0 (repeat same)  works 100.0 / eng 100.0 / looks 100.0  [eff 100.0 a11y 100.0 clean 100.0 by efficiency]  links 12/12 broken 0 orphaned 0 deadFactor 1.000  ok  0.9s/0.9s
    pages: index.html 100.0; about.html 100.0; contact.html 100.0; pricing.html 100.0
links-ok/self  band 98-101  total 100.0 (repeat same)  works 100.0 / eng 100.0 / looks 100.0  [eff 100.0 a11y 100.0 clean 100.0 by efficiency]  links 12/12 broken 0 orphaned 0 deadFactor 1.000  ok  0.9s/0.9s
    pages: index.html 100.0; about.html 100.0; contact.html 100.0; pricing.html 100.0
links-ok/two-clicks  band 78-90  total 94.7 (repeat same)  works 93.8 / eng 100.0 / looks 97.2  [eff 100.0 a11y 100.0 clean 100.0 by efficiency]  links 10/12 broken 0 orphaned 0 deadFactor 1.000  LENIENT by 4.7  0.9s/0.9s
    pages: index.html 98.9; about.html 93.7; contact.html 98.1; pricing.html 98.4
    -1.6  The home page has no link to the contact page
    -1.6  The pricing page has no link to the contact page
    -0.4  On the about page: the text 'Contact' is missing
links-ok/upper-case  band 80-95  total 72.3 (repeat same)  works 78.1 / eng 99.5 / looks 87.5  [eff 99.5 a11y 100.0 clean 100.0 by efficiency]  links 6/12 broken 3 orphaned 1 deadFactor 0.900  HARSH by 7.7  0.9s/0.9s
    broken: contact.html -> ABOUT.html, index.html -> ABOUT.html, pricing.html -> ABOUT.html
    orphaned: about.html
    pages: index.html 100.0; about.html 50.0 (orphan); contact.html 100.0; pricing.html 100.0
    -17.5  Nothing links to the about page, so visitors cannot reach it
    -8.0  3 links lead to pages that do not exist: ABOUT.html
    -0.1  The site is 1.2 times the size of the goal
structure/extra-copies  band 80-92  total 96.2 (repeat same)  works 100.0 / eng 89.1 / looks 100.0  [eff 89.1 a11y 100.0 clean 100.0 by efficiency]  links 12/12 broken 0 orphaned 0 deadFactor 1.000  LENIENT by 4.2  1.5s/1.4s
    pages: index.html 100.0; about.html 100.0; contact.html 100.0; pricing.html 100.0
    -3.8  The site is 1.6 times the size of the goal
structure/home-is-home-html  band 45-65  total 69.8 (repeat same)  works 69.1 / eng 95.1 / looks 76.3  [eff 100.0 a11y 95.1 clean 100.0 by accessibility]  links 6/12 broken 0 orphaned 0 deadFactor 1.000  LENIENT by 4.8  1.0s/1.0s
    pages: index.html 3.5; about.html 100.0; contact.html 100.0; pricing.html 100.0
    -4.6  The home page has no links to the about, the contact and the pricing pages
    -3.8  On the home page: the teal section near the top is missing
    -1.8  On the home page: the dark blue section near the top is missing
structure/merged  band 62-78  total 65.8 (repeat same)  works 63.6 / eng 100.0 / looks 72.1  [eff 100.0 a11y 100.0 clean 100.0 by efficiency]  links 6/12 broken 0 orphaned 0 deadFactor 1.000  ok  0.7s/0.7s
    pages: index.html 98.9; about.html 82.4; contact.html=>MISSING 0.0; pricing.html 98.4
    -29.7  The contact page was never made
    -0.7  On the about page: extra text the goal does not have: 'Come and see the workshop, ride a tes...'
    -0.6  On the about page: extra text the goal does not have: 'Tuesday to Saturday, 10 in the mornin...'
structure/one-page  band 40-58  total 13.0 (repeat same)  works 10.4 / eng 93.5 / looks 21.8  [eff 93.5 a11y 100.0 clean 100.0 by efficiency]  links 0/12 broken 0 orphaned 0 deadFactor 1.000  HARSH by 27.0  0.6s/0.6s
    pages: index.html 69.6; about.html=>MISSING 0.0; contact.html=>MISSING 0.0; pricing.html=>MISSING 0.0
    -26.0  The about page was never made
    -26.0  The contact page was never made
    -26.0  The pricing page was never made
structure/renamed  band 85-97  total 100.0 (repeat same)  works 100.0 / eng 100.0 / looks 100.0  [eff 100.0 a11y 100.0 clean 100.0 by efficiency]  links 12/12 broken 0 orphaned 0 deadFactor 1.000  LENIENT by 3.0  1.2s/1.1s
    pages: index.html 100.0; about.html=>about-us.html 100.0; contact.html=>contact-us.html 100.0; pricing.html=>prices.html 100.0
structure/subfolder  band 88-98  total 100.0 (repeat same)  works 100.0 / eng 100.0 / looks 100.0  [eff 100.0 a11y 100.0 clean 100.0 by efficiency]  links 12/12 broken 0 orphaned 0 deadFactor 1.000  LENIENT by 2.0  1.0s/0.9s
    pages: index.html 100.0; about.html=>pages/about.html 100.0; contact.html=>pages/contact.html 100.0; pricing.html=>pages/pricing.html 100.0
thirteen/missing-first  band 75-88  total 99.1 (repeat same)  works 98.9 / eng 100.0 / looks 99.7  [eff 100.0 a11y 100.0 clean 100.0 by efficiency]  links 22/22 broken 0 orphaned 0 deadFactor 1.000  LENIENT by 11.1  2.1s/2.1s
    pages: index.html 93.5; page-01.html=>page-12.html 95.2; page-02.html 100.0; page-03.html 100.0; page-04.html 100.0; page-05.html 100.0; page-06.html 100.0; page-07.html 100.0; page-08.html 100.0; page-09.html 100.0; page-10.html 100.0; page-11.html 100.0
    -0.3  On the page 01 page: the text 'Route 01 runs 13 kilometres along the...' has different words from the goal's: missing '01', '13', 'easy'; has '12', '46', 'hard' where the goal does not
    -0.2  On the home page: 10 buttons sit about 140 pixels too far left
    -0.1  On the home page: the button 'Route 01' is missing
thirteen/missing-last  band 75-88  total 99.7 (repeat same)  works 99.7 / eng 100.0 / looks 99.7  [eff 100.0 a11y 100.0 clean 100.0 by efficiency]  links 22/22 broken 0 orphaned 0 deadFactor 1.000  LENIENT by 11.7  1.9s/1.9s
    pages: index.html 96.1; page-01.html 100.0; page-02.html 100.0; page-03.html 100.0; page-04.html 100.0; page-05.html 100.0; page-06.html 100.0; page-07.html 100.0; page-08.html 100.0; page-09.html 100.0; page-10.html 100.0; page-11.html 100.0
    -0.3  On the home page: the button 'Route 12' is missing
thirteen/self  band 98-101  total 100.0 (repeat same)  works 100.0 / eng 100.0 / looks 100.0  [eff 100.0 a11y 100.0 clean 100.0 by efficiency]  links 22/22 broken 0 orphaned 0 deadFactor 1.000  ok  2.3s/2.1s
    pages: index.html 100.0; page-01.html 100.0; page-02.html 100.0; page-03.html 100.0; page-04.html 100.0; page-05.html 100.0; page-06.html 100.0; page-07.html 100.0; page-08.html 100.0; page-09.html 100.0; page-10.html 100.0; page-11.html 100.0
```

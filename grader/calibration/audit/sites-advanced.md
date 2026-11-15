# Audit: advanced multi-page sites (docs, shop)

Two new goal sites: `docs` (6 pages, two levels of folders, sidebar, breadcrumbs, prev/next, anchors, mailto, tables) and `shop` (5 pages, two stylesheets, forms, tables). Nine attempts each. Bands were written in `sites-advanced.json` before any grade was run, and not changed after.

Result: 6 of 18 attempts inside the band. All 20 "A must beat B" order checks hold. Both goals score exactly 100 against themselves. A grade takes 0.6 to 2.4 s. `npx vitest run test/site.test.ts`: 61 of 61 passed.

Of the 12 outside the band, 4 are near misses (5.5 points or less): `docs/sloppy`, `shop/sloppy`, `shop/near` and `shop/rebuild-detailed`. The pattern in the big ones: **broken navigation and one broken page are charged too lightly, and a site that works but looks different is charged as if it had no pages at all.**

## Disagreements

### 1. docs/rebuild-vague: band 35 to 50, grader 12.3 (HARSH by 22.7)
- **Person:** a Lumen docs site with all six pages, every link working, valid, small. It has its own green top-nav look and thinner content, and its guide pages sit at the root (`install.html`, `configuration.html`). "Right site, wrong look, half the detail."
- **Grader:** works 11.9, looks 13.7, engineering 100. Install, config and deploy are each charged 18.5 as "missing: none of the pages looks enough like it". Links found: 6 of 30.
- **Cause:** `src/site-grade.ts` `pairPages`. A page with a different file name is paired only if its look-alike score from `score()` reaches `SITE.pageMatchMinimum` (35). A restyled page never gets there, so three pages that exist and work count as never built. Their links then count as missing too. Separately, `worksCreditOf` builds "works" from look-alike scores (content plus layout), not from whether the pages and links function. A site that fully works but looks different therefore gets about 12 on "works", and the engineering 100 is multiplied by that 0.12 in `totalOf`.

### 2. shop/links-rotten: band 45 to 62, grader 83.1 (LENIENT by 21.1)
- **Person:** looks perfect, but 23 of 75 link uses go nowhere. That includes **all twelve product cards on the catalogue page**, plus links to basket, home, catalogue and contact on several pages. A shopper browsing the catalogue cannot open any product.
- **Grader:** works 92.5, looks 100, engineering 100. Dead-link factor 0.880 (12% off). Counted 6 broken.
- **Cause:** `scoreSite` (dead-link block, lines 649 to 669) counts *distinct dead targets per page*, so twelve dead cards count as one. It divides by the goal's distinct link count (20), and `SITE.deadLinkPenalty` (0.4) means even 100% dead takes only 40% off. A third of the navigation broken costs about 12%. Missing links get only `SITE.linkShare` (25%) of "works", which is 40% of the total: about 3 more points. Nothing weights a link by how many visitors depend on it.

### 3. docs/links-rotten: band 50 to 65, grader 81.3 (LENIENT by 16.3)
- **Person:** 17 of 60 links dead, spread over every page (sidebar, breadcrumbs, prev/next, cards).
- **Grader:** dead-link factor 0.867, counted 10 broken, works 91.7.
- **Cause:** same as #2. Distinct-per-page counting and a 40% ceiling make "a third of the links are broken" cost about 19 points in all.

### 4. shop/rebuild-vague: band 35 to 50, grader 17.1 (HARSH by 17.9)
- **Person:** a tea shop with all five pages working (`products.html` and `cart.html` instead of `catalogue.html` and `basket.html`). Own orange theme, fewer sections.
- **Grader:** basket and catalogue charged 22.8 each as "missing: none of the pages looks enough like it". Works 17.3.
- **Cause:** same as #1 (`pairPages` with `pageMatchMinimum`, and "works" measured as look-alike).

### 5. docs/one-page-wrong: band 72 to 85, grader 97.1 (LENIENT by 12.1)
- **Person:** on the Configuration page the whole sidebar has fallen under the content, 930 px down. That is the first thing a reviewer would see on that page.
- **Grader:** that page scores 79. The site loses 2.9 points. The feedback prices the fault at 1.5 + 0.9 + 0.2.
- **Cause:** two layers. (a) `worksCreditOf` and `looksCreditOf` average the pages, so one bad page in six costs a sixth of its own loss. An obvious bug costs less the more pages the site has. (b) The page scorer (`src/score.ts`) gives a 79 to a page whose main navigation block moved 930 px and whose content moved 240 px. Every block is still present and in order, so content and style hold up.

### 6. shop/one-page-wrong: band 72 to 85, grader 93.1 (LENIENT by 8.1)
- **Person:** the catalogue, the main shopping page, has collapsed to one column of huge cards running off the bottom.
- **Grader:** that page scores 57, the site 93.1.
- **Cause:** same averaging in `worksCreditOf` and `looksCreditOf`. One page at 57 among five costs about 7 points.

### 7. docs/nav-incomplete: band 50 to 65, grader 73.1 (LENIENT by 8.1); shop/nav-incomplete: band 48 to 62, grader 68.2 (LENIENT by 6.2)
- **Person:** two pages no visitor can reach. In the shop that is Basket and Contact, so nobody can check out.
- **Grader:** orphaned pages keep `SITE.orphanCredit` (half). That costs 12 to 14 points per page, a bit lighter than a person's "a page unreachable" would.
- **Also a real bug:** the feedback says "The site is 1.2 times the size of the goal", but this attempt is **0.96x** the goal (it is smaller). In `scoreSite` (lines 679 to 688) the reference size counts only the goal files used by *live* (not orphaned) pages, while `bytes` counts *every* candidate file, orphaned pages included. So an orphaned page is charged a second time, as bloat. The efficiency part dropped to 97.6 and 98.3.

### 8. Near misses
- docs/sloppy 80.5 (band 60 to 75) and shop/sloppy 79.2 (band 60 to 75). Engineering pillar 46.6 and 40.6: the issues are found and named, but at 35% weight a site with almost every code fault still scores 80.
- shop/near 99.5 (band 90 to 98) and shop/rebuild-detailed 99.5 (band 88 to 97). The rebuild's buttons are 6 px shorter on every page and its menu sits higher; the grader prices each at 0.1. Small differences you can see are priced as nearly invisible.

## Agreements
- docs/rebuild-detailed 99.3 (92 to 100): a from-scratch rebuild with another structure and CSS file is matched correctly.
- docs/near 98.9 (90 to 99).
- docs/heavy 66.4 (55 to 70): 10x size, efficiency 3.9, clear feedback.
- docs/half-built 25.3 (25 to 40).
- shop/heavy 66.1 (55 to 70).
- shop/half-built 30.3 (25 to 40).

## Feedback text
- docs/rebuild-detailed: "On the changelog page: the text 'Search the docs' is taller than the goal's (about 68 pixels high instead of 17)". Untrue to the eye: the search box is identical. It is measuring something invisible (the screen-reader label or the field).
- docs/nav-incomplete: "On the changelog page: the button 'Changelog' is missing". It is a sidebar link, not a button, and the real problem (already named above it) is that the page cannot be reached.
- shop/rebuild-detailed: "On the basket page: the button 'Basket' is taller than the goal's (about 31 pixels high instead of 25)". It is a menu link, not a button.
- docs/nav-incomplete and shop/nav-incomplete: "The site is 1.2 times the size of the goal". Untrue: the site is smaller than the goal (see #7).
- docs/heavy and shop/heavy: "The site is 9 times the size of the goal". It is 10.0x by file size (the 2 KB slack added to both sides shrinks the ratio). Minor, but the number a person checks is off.
- shop/links-rotten: "The catalogue page has no link to the product page". Misleading: it has twelve, all pointing at a file that does not exist. The same goes for "The basket page has no link to the home page" (it has one, to `index.htm`).
- shop/links-rotten: "6 links lead to pages that do not exist" while 23 link uses are dead. Counting distinct targets per page understates it to a person who clicks.
- docs/rebuild-vague: "The config page is missing: none of the pages looks enough like it". Untrue: `configuration.html` exists and is linked from every page.
- shop/rebuild-vague: "On the product page: the text 'Bright, floral spring tea from the Ca...' has different words from the goal's: missing 'bright', 'from', 'the' and 15 more; ...". Not what a person would mention first: the whole look and two whole pages differ.
- docs/near: four lines of "N things sit about 10 pixels too far right" at 0.1 each. Fine in content, but four lines for one cause (the sidebar is 12 px wider) is noise.

## Inside the band but felt unfair
- docs/heavy and shop/heavy land in the band, but their engineering pillar is 3.9 and 3.2 out of 100 while the total stays at 66. "Works" and "looks" are both 100, so being ten times too heavy can never cost more than about 34 points. That is acceptable against the band, but it is the ceiling, not a choice.
- docs/half-built (25.3) charges 16 points per missing page and also a 0.893 dead-link factor for the nav links to those same pages. The missing pages are charged twice. The total still lands in the band.

## Grade output (step 5)

```

docs  (goal prepared in 1549 ms)
  goal vs itself: 100.0 ok  (1611 ms)
  half-built        band  25-40  total  25.3  w/e/l 26.7 / 100.0 / 33.3  eng: eff 100.0 a11y 100.0 clean 100.0 by efficiency  ok  (567 ms)
      links: 2/30 found, score 6.7, broken 8, orphaned [], dead factor 0.893  pages: index.html 100, changelog.html 0, guide/config.html 0, guide/deploy.html 0, guide/install.html 100, reference.html 0
      - 16.0  The changelog page was never made
      - 16.0  The config page was never made
      - 16.0  The deploy page was never made
      - 16.0  The reference page was never made
  heavy             band  55-70  total  66.4  w/e/l 100.0 / 3.9 / 100.0  eng: eff 3.9 a11y 100.0 clean 100.0 by efficiency  ok  (2413 ms)
      links: 30/30 found, score 100.0, broken 0, orphaned [], dead factor 1.000  pages: index.html 100, changelog.html 100, guide/config.html 100, guide/deploy.html 100, guide/install.html 100, reference.html 100
      - 33.6  The site is 9 times the size of the goal
  links-rotten      band  50-65  total  81.3  w/e/l 91.7 / 100.0 / 100.0  eng: eff 100.0 a11y 100.0 clean 100.0 by efficiency  LENIENT by 16.3  (1329 ms)
      links: 20/30 found, score 66.7, broken 10, orphaned [], dead factor 0.867  pages: index.html 100, changelog.html 100, guide/config.html 100, guide/deploy.html 100, guide/install.html 100, reference.html 100
      - 12.5  10 links lead to pages that do not exist: changelog-page.html, guide/config-page.html, guide/deploy.htm, ...
      -  1.1  The changelog page has no links to the install and the reference pages
      -  1.1  The config page has no links to the install and the reference pages
      -  1.1  The install page has no links to the changelog and the config pages
  nav-incomplete    band  50-65  total  73.1  w/e/l 71.1 / 97.6 / 81.6  eng: eff 97.6 a11y 100.0 clean 100.0 by efficiency  LENIENT by 8.1  (1447 ms)
      links: 12/30 found, score 40.0, broken 0, orphaned [changelog.html, guide/deploy.html], dead factor 1.000  pages: index.html 99, changelog.html 48, guide/config.html 98, guide/deploy.html 48, guide/install.html 98, reference.html 99
      - 12.0  Nothing links to the changelog page, so visitors cannot reach it
      - 12.0  Nothing links to the deploy page, so visitors cannot reach it
      -  0.6  The site is 1.2 times the size of the goal
      -  0.2  On the changelog page: the button 'Changelog' is missing
  near              band  90-99  total  98.9  w/e/l 99.7 / 100.0 / 96.7  eng: eff 100.0 a11y 100.0 clean 100.0 by efficiency  ok  (1694 ms)
      links: 30/30 found, score 100.0, broken 0, orphaned [], dead factor 1.000  pages: index.html 98, changelog.html 98, guide/config.html 98, guide/deploy.html 99, guide/install.html 99, reference.html 98
      -  0.1  On the changelog page: 4 pieces of text sit about 15 pixels too far right
      -  0.1  On the changelog page: 8 things sit about 10 pixels too far right
      -  0.1  On the config page: 6 things sit about 10 pixels too far right
      -  0.1  On the deploy page: 5 things sit about 10 pixels too far right
  one-page-wrong    band  72-85  total  97.1  w/e/l 97.3 / 100.0 / 96.6  eng: eff 100.0 a11y 100.0 clean 100.0 by efficiency  LENIENT by 12.1  (1498 ms)
      links: 30/30 found, score 100.0, broken 0, orphaned [], dead factor 1.000  pages: index.html 100, changelog.html 100, guide/config.html 79, guide/deploy.html 100, guide/install.html 100, reference.html 100
      -  1.5  On the config page: 12 things sit about 240 pixels too far left
      -  0.9  On the config page: 1 boxes sit about 930 pixels too low
      -  0.2  On the config page: the dark blue section near the top is slightly out of place
  rebuild-detailed  band  92-100 total  99.3  w/e/l 99.1 / 100.0 / 100.0  eng: eff 100.0 a11y 100.0 clean 100.0 by efficiency  ok  (1512 ms)
      links: 30/30 found, score 100.0, broken 0, orphaned [], dead factor 1.000  pages: index.html 100, changelog.html 99, guide/config.html 99, guide/deploy.html 99, guide/install.html 99, reference.html 100
      -  0.1  On the changelog page: the text 'Search the docs' is taller than the goal's (about 68 pixels high instead of 17)
  rebuild-vague     band  35-50  total  12.3  w/e/l 11.9 / 100.0 / 13.7  eng: eff 100.0 a11y 100.0 clean 100.0 by efficiency  HARSH by 22.7  (1661 ms)
      links: 6/30 found, score 20.0, broken 0, orphaned [], dead factor 1.000  pages: index.html 24, changelog.html 24, guide/config.html 0, guide/deploy.html 0, guide/install.html 0, reference.html 20
      - 18.5  The config page is missing: none of the pages looks enough like it
      - 18.5  The deploy page is missing: none of the pages looks enough like it
      - 18.5  The install page is missing: none of the pages looks enough like it
      -  1.0  On the changelog page: the text 'Added deploy profiles. The serve comm...' is missing
  sloppy            band  60-75  total  80.5  w/e/l 98.9 / 46.6 / 99.3  eng: eff 100.0 a11y 55.0 clean 46.6 by cleanCode  LENIENT by 5.5  (1373 ms)
      links: 30/30 found, score 100.0, broken 0, orphaned [], dead factor 1.000  pages: index.html 99, changelog.html 99, guide/config.html 99, guide/deploy.html 99, guide/install.html 99, reference.html 99
      -  1.1  On the changelog page: 11 ids are used on more than one element; each id must be unique ("item")
      -  1.1  On the config page: 5 ids are used on more than one element; each id must be unique ("item")
      -  1.1  On the deploy page: 5 ids are used on more than one element; each id must be unique ("item")
      -  1.1  On the install page: 8 ids are used on more than one element; each id must be unique ("item")

shop  (goal prepared in 1060 ms)
  goal vs itself: 100.0 ok  (1404 ms)
  half-built        band  25-40  total  30.3  w/e/l 32.5 / 100.0 / 40.0  eng: eff 100.0 a11y 100.0 clean 100.0 by efficiency  ok  (654 ms)
      links: 2/20 found, score 10.0, broken 6, orphaned [], dead factor 0.880  pages: index.html 100, basket.html 0, catalogue.html 100, contact.html 0, product.html 0
      - 19.2  The basket page was never made
      - 19.2  The contact page was never made
      - 19.2  The product page was never made
      -  4.1  6 links lead to pages that do not exist: basket.html, contact.html, product.html
  heavy             band  55-70  total  66.1  w/e/l 100.0 / 3.2 / 100.0  eng: eff 3.2 a11y 100.0 clean 100.0 by efficiency  ok  (1302 ms)
      links: 20/20 found, score 100.0, broken 0, orphaned [], dead factor 1.000  pages: index.html 100, basket.html 100, catalogue.html 100, contact.html 100, product.html 100
      - 33.9  The site is 9 times the size of the goal
  links-rotten      band  45-62  total  83.1  w/e/l 92.5 / 100.0 / 100.0  eng: eff 100.0 a11y 100.0 clean 100.0 by efficiency  LENIENT by 21.1  (1261 ms)
      links: 14/20 found, score 70.0, broken 6, orphaned [], dead factor 0.880  pages: index.html 100, basket.html 100, catalogue.html 100, contact.html 100, product.html 100
      - 11.3  6 links lead to pages that do not exist: basket.htm, index.htm, pages/catalogue.html, ...
      -  1.6  The product page has no links to the catalogue and the contact pages
      -  0.8  The basket page has no link to the home page
      -  0.8  The catalogue page has no link to the product page
  nav-incomplete    band  48-62  total  68.2  w/e/l 65.5 / 98.3 / 77.9  eng: eff 98.3 a11y 100.0 clean 100.0 by efficiency  LENIENT by 6.2  (1241 ms)
      links: 6/20 found, score 30.0, broken 0, orphaned [basket.html, contact.html], dead factor 1.000  pages: index.html 97, basket.html 48, catalogue.html 98, contact.html 48, product.html 97
      - 14.3  Nothing links to the basket page, so visitors cannot reach it
      - 14.2  Nothing links to the contact page, so visitors cannot reach it
      -  0.4  The site is 1.2 times the size of the goal
      -  0.2  On the catalogue page: the text 'Basket' is missing
  near              band  90-98  total  99.5  w/e/l 99.7 / 100.0 / 98.8  eng: eff 100.0 a11y 100.0 clean 100.0 by efficiency  LENIENT by 1.5  (1254 ms)
      links: 20/20 found, score 100.0, broken 0, orphaned [], dead factor 1.000  pages: index.html 99, basket.html 100, catalogue.html 98, contact.html 99, product.html 100
      -  0.1  On the catalogue page: 4 things sit about 10 pixels too low
      -  0.1  On the contact page: the text 'Questions about an order or a tea? Se...' has different words from the goal's: missing 'one'; has 'a' where the goal does not
      -  0.1  On the home page: 3 boxes sit about 10 pixels too high
      -  0.1  On the home page: the heading 'Customer favourites' has different words from the goal's: missing 'favourites'; has 'favorites' where the goal does not
  one-page-wrong    band  72-85  total  93.1  w/e/l 93.7 / 100.0 / 91.3  eng: eff 100.0 a11y 100.0 clean 100.0 by efficiency  LENIENT by 8.1  (1486 ms)
      links: 20/20 found, score 100.0, broken 0, orphaned [], dead factor 1.000  pages: index.html 100, basket.html 100, catalogue.html 57, contact.html 100, product.html 100
      -  0.6  On the catalogue page: an extra image near the bottom that the goal does not have
      -  0.6  On the catalogue page: the dark green section near the bottom is missing
      -  0.6  On the catalogue page: the image near the middle is missing
      -  0.6  On the catalogue page: the image near the middle right is missing
  rebuild-detailed  band  88-97  total  99.5  w/e/l 100.0 / 100.0 / 97.9  eng: eff 100.0 a11y 100.0 clean 100.0 by efficiency  LENIENT by 2.5  (1252 ms)
      links: 20/20 found, score 100.0, broken 0, orphaned [], dead factor 1.000  pages: index.html 99, basket.html 99, catalogue.html 100, contact.html 98, product.html 99
      -  0.1  On the basket page: the button 'Basket' is taller than the goal's (about 31 pixels high instead of 25)
      -  0.1  On the basket page: the button 'Place order' is less tall than the goal's (about 42 pixels high instead of 48)
      -  0.1  On the contact page: the button 'Contact' is taller than the goal's (about 31 pixels high instead of 25)
      -  0.1  On the contact page: the button 'Send message' is less tall than the goal's (about 42 pixels high instead of 48)
  rebuild-vague     band  35-50  total  17.1  w/e/l 17.3 / 100.0 / 16.2  eng: eff 100.0 a11y 100.0 clean 100.0 by efficiency  HARSH by 17.9  (1475 ms)
      links: 5/20 found, score 25.0, broken 0, orphaned [], dead factor 1.000  pages: index.html 30, basket.html 0, catalogue.html 0, contact.html 24, product.html 23
      - 22.8  The basket page is missing: none of the pages looks enough like it
      - 22.8  The catalogue page is missing: none of the pages looks enough like it
      -  1.5  On the contact page: the dark green section near the bottom is missing
      -  1.4  On the product page: the text 'Bright, floral spring tea from the Ca...' has different words from the goal's: missing 'bright', 'from', 'the' and 15 more; has 'delicate', 'black', 'harvested' and 1 more where the goal does not
  sloppy            band  60-75  total  79.2  w/e/l 100.0 / 40.6 / 100.0  eng: eff 100.0 a11y 40.6 clean 47.1 by accessibility  LENIENT by 4.2  (1279 ms)
      links: 20/20 found, score 100.0, broken 0, orphaned [], dead factor 1.000  pages: index.html 100, basket.html 100, catalogue.html 100, contact.html 100, product.html 100
      -  1.4  On the basket page: 4 form fields have no label saying what to type: add a <label> for it or an aria-label (for example input#name, input#email, textarea#address)
      -  1.4  On the catalogue page: 5 form fields have no label saying what to type: add a <label> for it or an aria-label (for example input name=type, input name=type, input name=type)
      -  1.4  On the home page: the page does not say what language it is in: add a lang attribute to <html>, like lang="en"
      -  1.2  On the contact page: 3 form fields have no label saying what to type: add a <label> for it or an aria-label (for example input#cname, input#cemail, textarea#message)

order checks:
  docs: rebuild-detailed (99.3) > one-page-wrong (97.1)  ok
  docs: near (98.9) > one-page-wrong (97.1)  ok
  docs: near (98.9) > heavy (66.4)  ok
  docs: near (98.9) > sloppy (80.5)  ok
  docs: one-page-wrong (97.1) > nav-incomplete (73.1)  ok
  docs: one-page-wrong (97.1) > links-rotten (81.3)  ok
  docs: nav-incomplete (73.1) > half-built (25.3)  ok
  docs: links-rotten (81.3) > half-built (25.3)  ok
  docs: heavy (66.4) > half-built (25.3)  ok
  docs: sloppy (80.5) > half-built (25.3)  ok
  shop: rebuild-detailed (99.5) > one-page-wrong (93.1)  ok
  shop: near (99.5) > one-page-wrong (93.1)  ok
  shop: near (99.5) > heavy (66.1)  ok
  shop: near (99.5) > sloppy (79.2)  ok
  shop: one-page-wrong (93.1) > nav-incomplete (68.2)  ok
  shop: one-page-wrong (93.1) > links-rotten (83.1)  ok
  shop: nav-incomplete (68.2) > half-built (30.3)  ok
  shop: links-rotten (83.1) > half-built (30.3)  ok
  shop: heavy (66.1) > half-built (30.3)  ok
  shop: sloppy (79.2) > half-built (30.3)  ok
```

# Single-page grading review (grader 0.7.0)

Four new goal pages: a restaurant menu (`menu`, 1627 px), a sign-up screen that is mostly form controls (`signup`, 920 px), an invoice that is mostly data (`invoice`, 1219 px) and a product detail page (`product`, 1739 px). 28 honest attempts, 10 cheats, 32 consistency probes. Bands were written in `bands.json` after looking at the screenshots and before any grading, and were not changed. Rebuild with `node gen-*.mjs`, screenshots, then `node gen-cheats.mjs`, `node gen-probes.mjs`, `npx tsx calibration/review/pages/run.ts` (run from `grader/`). Screenshots and contact sheets are in `calibration/out/review/pages/`.

## Verdict

**NOT SATISFIED.**

Only 12 of 38 attempts land in their band. A careful rebuild with a few honest slips regularly scores 40 to 65, where a boss would say "nearly there": product 41.5, invoice 50.4, sign-up 65.2. Meanwhile pages that look right but say the wrong thing score well above those honest rebuilds (a shoe at the wrong price 86.0, an invoice with the wrong total 77.8), so a player would feel the scores are unfair and sometimes ranked the wrong way round. The "noticed faults" reading is the cause almost every time: it was the lower reading in every case that missed low, and the averaged reading alone would have put most of them inside their bands.

## Numbers

| | |
|---|---|
| Attempts inside band | 12 / 38 (cheats included) |
| Outside | 26: 12 harsh, 14 lenient |
| Mean distance outside | 9.5 points |
| Worst | `product/p_good` HARSH by 34.5 (41.5 against 76 to 88) |
| Order checks held | 23 / 30 |
| Cheats that worked | 1 clearly (`cheat_duplicated` 70.4). 2 partly (`cheat_boxes` 39.4, `cheat_shuffled` 42.0). The two picture cheats get a free 20 |
| Goal against itself | 100.00 for all four |
| Repeat grades that differed | 0 of 38 |
| Time per grade | median 434 ms, max 828 ms |

Harsh misses: p_good -34.5, i_good -31.6, i_roomy -14.8, m_mediocre -13.5, s_excellent -13.0, s_good -12.8, p_mirrored -8.2, i_mediocre -7.3, p_mediocre -5.4, i_excellent -2.9, m_good -2.7, p_excellent -1.1.
Lenient misses: p_wrong_product +16.0, cheat_duplicated +15.4, cheat_boxes +15.4, cheat_shuffled +12.0, m_prices_wrong +8.0, i_numbers_wrong +7.8, p_sold_out +5.7, both picture cheats +5.0, i_poor +3.7, s_other_blue +3.2, m_poor +1.9, top_only +0.9, lorem +0.3.

How I found the cause: I ran a temporary patched copy of `src` (now deleted) that reports both readings. For every harsh miss, the faults reading was the one that set the total. The averaged reading would have given p_good 81.9, i_good 90.0, s_excellent 98.7, s_good 87.1, i_roomy 90.3, p_mirrored 88.4 and m_mediocre 63.9.

## Problems

Ranked by how unfair they would feel to a player.

### 1. Good rebuilds sink through many small faults compounding

- **Cases and scores:**
  - `product/p_good`: band 76 to 88, scored 41.5 [c61 l35 s63 v37].
  - `invoice/i_good`: band 82 to 93, scored 50.4.
  - `signup/s_good`: band 78 to 90, scored 65.2.
  - `menu/m_good`: band 80 to 92, scored 77.3.
- **What a person sees:** the right page. A few small things differ: reviews shown as a list, three related cards instead of four, no heart button, slightly different greys, dates written 03/11/2026. "Nearly there."
- **Mechanism:** `readFaults` in `score.ts`. Each kind of fault saturates fast:
  - `missing` has k = 1, so a missing amount of 1.66 already costs 36 points.
  - `moved` has k = 1.2 and `legibility` has k = 1.
  - `colour` has a first-instance term worth 6 points.

  The kinds then compound toward the 75-point ceiling. Five or six kinds at 10 to 20 points each take about 50 points, although no single fault is serious. Three effects inside it make this worse:
  - **(a) Grey drift is charged on every text block.** `findFaults` charges colour for every paired text block, and `colourSeverity` starts at deltaE 1.5. A model choosing #666/#222/#888 instead of the goal's #52606d/#1f2933/#7b8794 sums to 6.3 over the invoice, and "Colours across the page are slightly off" costs 11.3. Nobody would notice those greys.
  - **(b) One cause still gets two charges when text is re-split.** In p_good the footer was written as one line instead of two spans. It is charged as changed words (7.2) and again as "'Shipping · Returns · Contact' is missing" (5.6), although those words are on screen. In i_good the date reformat is charged as "'3 December 2026' is missing" (10.8) plus changed words (8.7). `joinSplitText` does not join these.
  - **(c) Logo marks count as buttons.** Small coloured squares holding a letter are read as pills (`factsOf` pill, which raises `notice` by 0.35). "The button 'L' is noticeably larger" costs 6.2.
- **How common:** common. Almost every real rebuild has four to six kinds of small difference.

### 2. Right pixels with wrong meaning beat honest work

- **Cases and scores (all three order checks failed):**
  - `product/p_wrong_product`: band 55 to 70, scored 86.0, above p_good 41.5 and p_mirrored 63.8.
  - `invoice/i_numbers_wrong`: band 55 to 70, scored 77.8, above i_roomy 67.2.
  - `signup/s_no_password`: band 60 to 76, scored 72.8, above s_good 65.2.
  - Also lenient: `menu/m_prices_wrong` 76.0 (band 55 to 68) and `product/p_sold_out` 85.7 (band 64 to 80).
- **What a person sees:**
  - a shoe on a backpack page at $194 instead of $149;
  - an invoice whose total is wrong by $1,800;
  - six wrong prices on a menu;
  - a "Sold out" button.
- **Mechanism:**
  - **Pictures are compared only by their colours.** `pictureColours` and `pictureDistance` in `score.ts` look at the colour palette, so an orange shoe in place of an orange backpack costs 1.2 points ("white where the goal's is orange").
  - **Word faults diminish quickly.** The `words` kind uses cap 45, k 25 and first-instance term [15, 1.2]. The 1st wrong price costs 9.8 and the 6th about 2, so six wrong prices total 24. A wrong total due costs 11.2, the same as any other changed text: `notice` has no idea that it is the number that matters.
- **How common:** wrong numbers are common in real model output. A different drawing is occasional.

### 3. One spacing change is charged cell by cell and as a move

- **Case:** `invoice/i_roomy`: band 82 to 94, scored 67.2 [c100 l50 s87 v57]. Also visible in the invoice chain probe.
- **What a person sees:** the same invoice with roomier rows. They shrug.
- **Mechanism:** the size check in `findFaults` (`score.ts`) runs per paired box. All 40 table cells grew from one cause, the row padding, so `size` sums to 3.57 and costs 13.9. Everything below the table moved 120 px. `analyseMotion` does not treat that as drift, because the table itself is not a block, so no single neighbour "grew". That costs another 20 points ("The part with '$3,591.00' sits about 120 pixels too low", 9.7).
- **How common:** common. Padding differs in nearly every rebuild.

### 4. Placeholder-grey text on forms charged as illegible, and the goal's own glyphs read as extra

- **Case:** `signup/s_excellent`: band 91 to 100, scored 78.0.
- **What a person sees:** the goal again.
- **Mechanism, part 1 (legibility):** `legibility` in `findFaults` compares contrast ratios. The rebuild's placeholder text uses Tailwind slate-400 (contrast 2.56). The goal's `<input placeholder>` renders in Chromium's default (about 4.6). With k = 1 and cap 45, two such fields cost about 12 points ("hard to read against its background", 5.4 each).
- **Mechanism, part 2 (extra text):** the goal's password dots (an input value) and its `::before` check marks are not extracted as text, but the rebuild's real characters are. So "Extra text '•••••••••••'" and "3 list items such as '✓'" are charged, although both are on the goal's screen.
- **How common:** common for any form page. Models write fake inputs as divs, use Tailwind greys, and draw ticks as text.

### 5. A restyled page scores below an unstyled one

- **Case:** `menu/m_mediocre` 28.5 (band 42 to 57) against `menu/m_poor` 31.9 (band 15 to 30). The order check failed.
- **What a person sees:** m_mediocre is a styled two-column menu with nearly all the dishes. m_poor is a bare Times bullet list.
- **Mechanism:** the style kinds (`family`, `weight`, `fontSize`, `decoration`, `colour`) are charged only on matched pairs, each up to its own cap. A page that matches many blocks in a different style pays every one of those kinds. A page that matches little mostly pays `missing`, which is capped at 45. The comment in `readFaults` says this reading "is for pages that are mostly right", but it is applied to every page.
- **How common:** occasional. It happens when a model picks its own type scale and font.

### 6. Appended content is cheap

- **Case:** `signup/cheat_duplicated`: band 35 to 55, scored 70.4.
- **What a person sees:** the whole screen twice, obviously broken.
- **Mechanism:** the `extra` kind is capped at 30 in `config.ts` (`FAULTS.kinds.extra`), and `MATCH.extraPenalty` is 0.5 in the averaged reading. Anything appended below a correct page costs at most about 30.
- **How common:** rare by accident. It is a known exploit.

### 7. A mirrored hero is charged like a big structural fault

- **Case:** `product/p_mirrored`: band 72 to 86, scored 63.8. Three move lines cost 36 points.
- **What a person sees:** a boss would ask for the sides to be swapped back.
- **Mechanism:** this is defensible. The swap rule in `findFaults` (look-alike groups that traded places) does not apply, because the image and the buy box are not alike in size.
- **How common:** occasional.

## Cheats

| Attempt | Score | Acceptable? |
|---|---|---|
| `menu/cheat_hidden_text` (real menu covered by an overlay) | 8.3 | Yes: covered text is ignored |
| `menu/cheat_camouflage` (text in background colour plus decoy) | 11.2 | Yes |
| `menu/cheat_shuffled` (right look, names scrambled, prices reassigned) | 42.0 | No, 12 over. Nonsense content still earns "half right"; `words` saturates at cap 45 |
| `signup/cheat_duplicated` (page twice) | 70.4 | **No. This one worked.** See problem 6 |
| `signup/cheat_boxes` (grey bars instead of words) | 39.4 | No, 15 over. Layout 49 and visual 83 pay for an empty wireframe |
| `invoice/cheat_top_only` (header and addresses only) | 36.9 | Borderline (0.9 over) |
| `invoice/cheat_tiny_text` (2 px text) | 10.3 | Yes |
| `invoice/cheat_picture_text` (goal screenshot as background, words transparent) | 20.0 | Mostly. Visual reads 100, so 0.2 × 100 = 20 points for no work |
| `product/cheat_picture` (one image of the page) | 20.0 | Mostly, same reason |
| `product/cheat_lorem` (lorem ipsum in the right boxes) | 28.3 | Borderline (0.3 over) |

The faults reading on its own would have scored the picture cheats 49.7 and 65.3. Its 75-point ceiling means it can never go below 25, so only the averaged reading holds cheats down.

## Consistency

**The same fault on short and long pages: excellent.**

| Fault | Short | Full | Long |
|---|---|---|---|
| One wrong price | 9.8 | 9.8 | 9.8 (8 courses) |
| One missing dish | 16.7 | 16.7 | 16.7 |
| Missing "Add to cart" button | 22.9 | 22.9 | (no long version) |

**One, two, four and eight of the same fault: the cost rises and never falls.**

| Fault | 1 | 2 | 4 | 8 |
|---|---|---|---|---|
| Wrong prices | 9.8 | 15.2 | 20.7 | 33.6 |
| Name typos | 6.3 | 10.7 | 16.1 | 21.6 |
| Dish names in Arial | 2.1 | 3.8 | 6.3 | 9.4 |

The jump at eight wrong prices comes from a mismatch: Affogato's 9 became 12, which matched Tiramisù's 12, so the feedback says "'9' is missing" (9.7) instead of naming the changed price.

**Strictly worse chains: all four were monotone.**

| Chain | Scores |
|---|---|
| Menu | 90.2, 75.6, 62.2 |
| Invoice | 67.2, 59.8, 57.2 |
| Product | 63.8, 57.1, 45.2 |
| Sign-up | 65.2, 57.9, 53.3 |

Each step adds about the right amount.

**Ordering with different kinds of fault: fails.** An honest spacing change costs more than a wrong total; see problem 2.

## Feedback text

Lines that are untrue, misleading, not what a person would say first, or bad English:

- `count:font slips`: "Everything sits is slightly out of place". This is bad English, and it appears at all four counts.
- `signup/s_wrong_purpose`:
  - "The button 'Create account' sits about 150 pixels too low"
  - "The button says 'New to Ledgerly? Create an account' where the goal says 'Create account'"
  - "The button 'Create account' is blue where the goal's is white"

  The goal's button was paired with the footer link. The feedback never says the button reads "Sign in", which is what a person would say first.
- `signup/s_excellent`:
  - "Extra text the goal does not have: '•••••••••••'" and "Extra content the goal does not have: 3 list items such as '✓'". Both are on the goal's screen, so these are untrue.
  - "The form field 'Jane Cooper' is hard to read against its background". This is placeholder grey and misleading.
  - "The form field 'Jane Cooper' is blue where the goal's is grey". A nitpick.
- `signup/s_good`: "The button 'L' is noticeably larger than the goal's (24 px text instead of 18 px)". The 'L' is the logo mark, not a button.
- `invoice/i_good`: "The button 'N' uses a sans-serif font where the goal uses a serif one". Same issue: it is a logo.
- `invoice/i_good`:
  - "The part with '3 December 2026' is missing"
  - "The table cell '3 November 2026' has different words from the goal's: missing '3', 'november'; has 'issued', '03', '11' and 7 more where the goal does not"

  The dates are there in another format. A person would say "dates are written 03/11/2026 instead of 3 November 2026".
- `product/p_good`: "The text 'Shipping · Returns · Contact' is missing". Those words are on screen.
- `menu/m_course_order`: "The text '12' is missing" and "Extra text the goal does not have: '12'". Both are untrue. The real fault (courses in the wrong order) appears only as four separate "sits about N pixels too low/high" lines.
- `menu/m_good`: "The lines drawn around 15 boxes near the top are missing" (9.4 points). These are the dotted leaders between dish and price, spread down the whole page, so "near the top" is wrong and the wording is unclear.
- `invoice/i_excellent`: "The table cell 'BC-216' is wider than the goal's (about 752 pixels wide instead of 90)". The grid row was paired with a cell, so this is untrue.
- `product/p_excellent`: "The table cell '1.1 kg' is wider than the goal's (about 440 pixels wide instead of 280)". Same issue.
- `invoice/i_excellent`: "The lines drawn around 37 boxes near the top are missing". The table is mid-page.
- `invoice/cheat_top_only`: "(62.6) The box with 'INVOICE' is missing". A person would say "the line items, totals and payment notes are missing".
- `invoice/cheat_tiny_text`: "(74.5) The box with 'INVOICE' is missing" and "An extra white box near the top". Neither says the text is unreadably small.
- `invoice/i_mediocre`: "The box with 'INVOICE' is missing". This means the white sheet, and naming it by a word inside it confuses.
- `invoice/cheat_picture_text`: "(46) The page background is a lighter white than the goal's". Untrue: the page shows the goal's grey.
- `invoice/i_poor`: "The page background is a lighter white than the goal's". "Lighter white" is odd for a grey goal.
- `menu/cheat_hidden_text`: "The tag says 'Osteria Lume Menu coming soon' where the goal says 'MENU'". This is a mismatched pairing.
- `product/p_poor`:
  - "The heading says 'Backpack' where the goal says 'You may also like'"
  - "The text says 'Price: $149' where the goal says '$89'"

  Both are wrong pairings.
- `product/p_wrong_product`:
  - "The colours of the picture near the top left differ from the goal's (white where the goal's is orange)". It never says the picture shows a different thing.
  - "The heading says '$194.00'". The price is not a heading.
- `signup/s_no_password`: "(14.6) The part with 'At least 8 characters, with one numbe...' is missing". The hint leads; a person would say first "the password field is missing".
- `product/p_mediocre`: "The table cell 'Recycled 420D nylon, TPU coated' has different words from the goal's: has 'volume', '24', '28' and 12 more where the goal does not". Hard to act on.
- `menu/m_mediocre`: "The text '214 Harbour Street Portland, ME 04101' has different words from the goal's: has 'tuesday', 'sunday', '5' and 6 more where the goal does not". The footer was joined into one line; this is hard to act on.

**On the whole:** content lines are excellent and directly usable, for example "The text says '19' where the goal says '16'" and "The text says 'Sold out' where the goal says 'Add to cart'". Lines about missing boxes, re-split text and grid rows often name the wrong thing, or call a frame by a word inside it. A player would improve their prompt from about half the lines and be confused by the rest.

## What is good

Keep these working when the next change goes in:

- **Basics.** Every goal against itself scores exactly 100.00. Grades are deterministic. A grade takes about 0.4 s.
- **Length independence is exact.** The same fault costs the same on a 2-course, 4-course and 8-course menu.
- **Monotone costs.** Repeated faults rise and level off. Every strictly worse chain scores lower.
- **Hidden text is ignored.** Covered, transparent, background-coloured and 2 px text are all ignored (8.3, 11.2, 10.3).
- **Harmless pixel changes cost little:**
  - a 70 px page shift: `m_shifted` 90.3;
  - a different blue gradient on a large panel: `s_other_blue` 98.2;
  - swapped table columns: `i_cols_swapped` 83.6.
- **Excellent rebuilds land at 88 to 94**, apart from the form-page placeholder issue.
- **Changed-text feedback quotes both sides precisely.**

## Runner output

```
=== Self checks (goal vs itself must be exactly 100) ===
menu     100.00 ok
signup   100.00 ok
invoice  100.00 ok
product  100.00 ok

=== Banded attempts ===

menu/m_excellent             band 91-100  total 93.9  [c100.0 l 96.4 s 74.9 v 96.3]  ok
   why: Grid rebuild; only sub-pixel spacing and a few px of width differ.
   - (4.4) 4 pieces of text should be bold, such as the heading 'ANTIPASTI'
   - (0.5) Everything sits about 5 pixels too high and about 5 pixels too far right
   - (0.4) The dark green section near the bottom is less tall than the goal's (about 147 pixels high instead of 156)
   - (0.3) Extra lines drawn around 8 boxes near the top that the goal does not have
   - (0.2) The light yellow section near the top is about 10 pixels shorter than the goal's, so what is below it sits higher
   - (0.1) 3 pieces of text sit about 5 pixels too high

menu/m_good                  band 80-92  total 77.3  [c 84.1 l 69.3 s 84.7 v 77.0]  HARSH by 2.7
   why: Right page; dollar signs added, dotted leaders gone, logo a bit smaller, one dish description reworded.
   - (9.4) The lines drawn around 15 boxes near the top are missing
   - (3.6) The text says 'Roasted pumpkin ravioli, sage butter,...' where the goal says 'Roasted squash ravioli, brown butter,...'
   - (2.4) The heading 'Osteria Lume' is noticeably smaller than the goal's (48 px text instead of 52 px)
   - (1.2) The text '214 Harbour Street Portland, ME 04101' sits about 10 pixels too high and about 25 pixels too far right
   - (1.2) The text '(207) 555-0148 hello@osterialume.com' sits about 10 pixels too high and about 25 pixels too far left
   - (0.9) The part with 'Osteria Lume' sits about 15 pixels too high and about 5 pixels too far left

menu/m_mediocre              band 42-57  total 28.5  [c 50.1 l 25.7 s 21.1 v 25.2]  HARSH by 13.5
   why: Same menu but a green hero band, Arial, two-column dishes and big orange headings; two prices wrong and Affogato missing.
   - (8.6) The part with '18' and 2 more like it are missing
   - (7.7) Colours across the page differ from the goal's: white where the goal uses dark green, for example on the heading 'Osteria Lume'
   - (7.6) The text is generally smaller than the goal's (43 pieces of text)
   - (7) The part with 'Affogato' is missing
   - (5.9) The text '214 Harbour Street Portland, ME 04101' has different words from the goal's: has 'tuesday', 'sunday', '5' and 6 more where the goal does not
   - (4.6) Extra content the goal does not have: '$21'

menu/m_poor                  band 15-30  total 31.9  [c 40.8 l 33.5 s 26.3 v 25.4]  LENIENT by 1.9
   why: Default Times bullet list, half the prices missing, nothing of the look.
   - (7.1) The page is in shades of grey where the goal has colour
   - (7) The text is generally larger than the goal's (10 pieces of text)
   - (6.7) The light yellow section near the top is missing
   - (6.6) The section with 'Find us' is missing
   - (6.1) The part with 'Risotto ai funghi' and 1 more like it are missing
   - (5.5) The part with 'Burrata con pesche' is missing

menu/m_prices_wrong          band 55-68  total 76.0  [c 53.9 l 94.9 s 96.5 v 99.9]  LENIENT by 8.0
   why: Looks perfect but six of fifteen prices are wrong: a menu you cannot print.
   - (4) The text says '19' where the goal says '16'
   - (4) The text says '29' where the goal says '26'
   - (4) The text says '32' where the goal says '23'
   - (4) The text says '43' where the goal says '34'
   - (4) The text says '29' where the goal says '92'
   - (4) The text says '21' where the goal says '12'

menu/m_shifted               band 88-97  total 90.3  [c100.0 l 81.0 s100.0 v 54.2]  ok
   why: Identical except the header has 70px more top padding; a boss shrugs.
   - (7.9) The part with 'Osteria Lume' sits about 70 pixels too low
   - (1.8) The light yellow section near the top is taller than the goal's (about 287 pixels high instead of 217)

menu/m_course_order          band 64-78  total 66.5  [c 94.1 l 48.9 s 99.4 v 58.2]  ok
   why: Every dish right but desserts come first and starters last: one obvious flaw.
   - (9.4) The text '12' is missing
   - (5.1) The heading 'ANTIPASTI' sits about 820 pixels too low
   - (5.1) The heading 'DOLCI' sits about 520 pixels too high
   - (5) The heading 'SECONDI' sits about 350 pixels too high
   - (4.4) The heading 'PRIMI' sits about 230 pixels too low
   - (2.7) Extra text the goal does not have: '12'

menu/cheat_hidden_text       band 0-12  total 8.3  [c  6.8 l  5.3 s  5.4 v 17.6]  ok
   why: Visible page is a logo and 'Menu coming soon'; the real menu is covered.
   - (30.1) The tag says 'Osteria Lume Menu coming soon' where the goal says 'MENU'
   - (26.2) The part with 'Burrata con pesche' is missing
   - (17.8) The light yellow section near the top is missing
   - (17.7) The section with 'Find us' is missing

menu/cheat_shuffled          band 12-30  total 42.0  [c 47.7 l 36.7 s 97.7 v 46.4]  LENIENT by 12.0
   why: Right look but dish names scrambled, names and prices reassigned at random: nonsense content.
   - (18.5) Most of the text says something different from the goal (28 pieces of text, such as '24' where the goal says '12')
   - (10.1) 3 pieces of text are missing
   - (3.4) Extra content the goal does not have: 3 pieces of text such as '92'
   - (2.7) The text 'Affogato' sits about 1000 pixels too high
   - (2.7) The text 'Panna cotta' sits about 760 pixels too high
   - (2.7) The text 'Risotto ai funghi' sits about 460 pixels too low

menu/cheat_camouflage        band 3-16  total 11.2  [c  2.1 l  8.9 s  9.1 v 32.3]  ok
   why: Only the logo and a decoy line are visible; the menu is written in the background colour.
   - (40.1) The part with 'Burrata con pesche' is missing
   - (27.1) The section with 'Find us' is missing
   - (13.4) The part with 'Cucina di stagione · Est. 2011' is missing
   - (8.2) Extra text the goal does not have: 'Our seasonal menu is being printed. S...'

signup/s_excellent           band 91-100  total 78.0  [c 90.3 l 86.2 s 63.5 v 65.7]  HARSH by 13.0
   why: Indistinguishable apart from a hand-drawn checkbox and select arrow.
   - (5.4) The form field 'Jane Cooper' is hard to read against its background
   - (5.4) The form field 'jane@company.com' is hard to read against its background
   - (2.8) Extra text the goal does not have: '•••••••••••'
   - (2.7) Extra content the goal does not have: 3 list items such as '✓'
   - (2.2) The form field 'Jane Cooper' is blue where the goal's is grey
   - (2.2) The form field 'jane@company.com' is blue where the goal's is grey

signup/s_good                band 78-90  total 65.2  [c 83.4 l 60.1 s 58.3 v 58.9]  HARSH by 12.8
   why: Right screen; panel flat blue, quote and password hint gone, indigo button, taller inputs.
   - (10.3) The text '“We closed our books in a day instead...' is missing
   - (8.8) The text 'At least 8 characters, with one numbe...' is missing
   - (6.2) The button 'L' is noticeably larger than the goal's (24 px text instead of 18 px)
   - (5.7) Colours across the page are slightly off: for example, the button 'L' is a lighter blue than the goal's
   - (0.6) The part with 'Create account' sits about 10 pixels too high and about 10 pixels too far left
   - (0.6) The part with 'Create your account' sits about 10 pixels too far left

signup/s_mediocre            band 33-50  total 37.4  [c 51.6 l 36.0 s 33.8 v 18.1]  ok
   why: Generic centred card on grey; brand panel reduced to a bar, company size missing, '30-day' trial wrong.
   - (13.3) The box with 'Ledgerly' is missing
   - (7.4) The text is generally smaller than the goal's (8 pieces of text)
   - (6) The part with '1–10 employees' is missing
   - (5.8) Colours across the page differ from the goal's: grey where the goal uses light blue, for example on the list item 'Connect your bank in two minutes'
   - (5.6) The heading says 'Ledgerly — Bookkeeping that does itself.' where the goal says 'Bookkeeping that does itself.'
   - (4.5) The part with 'jane@company.com' is missing

signup/s_poor                band 6-20  total 10.9  [c 17.7 l  7.7 s  6.0 v  7.7]  ok
   why: Unstyled browser form with three inputs.
   - (15.4) The box with 'Ledgerly' is missing
   - (9.6) The heading says 'Sign Up' where the goal says 'Bookkeeping that does itself.'
   - (9.6) The part with '1–10 employees' is missing
   - (7.7) The part with 'Create account' is missing
   - (7.3) The text is generally larger than the goal's (6 pieces of text)
   - (7.1) Colours across the page differ from the goal's: black where the goal uses white, for example on the heading 'Ledgerly'

signup/s_wrong_purpose       band 56-72  total 59.3  [c 53.8 l 72.6 s 54.9 v 69.5]  ok
   why: Looks identical but it is a sign-in screen: heading, subtitle, button and footer link say the wrong thing.
   - (7.4) The button 'Create account' sits about 150 pixels too low
   - (7.2) The heading says 'Welcome back' where the goal says 'Create your account'
   - (7) The button says 'New to Ledgerly? Create an account' where the goal says 'Create account'
   - (4.5) The button 'Create account' is blue where the goal's is white
   - (3) The text 'Start your 14-day free trial. No cred...' has different words from the goal's: missing 'start', '14', 'day' and 6 more; has 'sign', 'in', 'to' and 3 more where the goal does not
   - (2.5) The text 'Already have an account? Sign in' sits about 150 pixels too high

signup/s_other_blue          band 83-95  total 98.2  [c100.0 l100.0 s 94.2 v 93.9]  LENIENT by 3.2
   why: Identical except the panel gradient is teal-to-navy the other way; a boss barely minds.
   - (1.3) The box with 'Ledgerly' is a different shade of blue from the goal's
   - (0.5) The button 'Create account' is a darker blue than the goal's

signup/s_no_password         band 60-76  total 72.8  [c 87.3 l 62.5 s 93.9 v 66.8]  ok
   why: Right screen with the password field missing: a sign-up form that cannot work.
   - (14.6) The part with 'At least 8 characters, with one numbe...' is missing
   - (8.7) The label 'Password' is missing
   - (3.9) The part with 'Create your account' sits about 50 pixels too low

signup/cheat_duplicated      band 35-55  total 70.4  [c 66.7 l 66.7 s100.0 v 60.4]  LENIENT by 15.4
   why: The whole screen shown twice, one below the other: obviously broken though the top half is perfect.
   - (16.4) Extra content the goal does not have: 'Ledgerly'
   - (13.1) Extra content the goal does not have: 'Create your account'

signup/cheat_boxes           band 8-24  total 39.4  [c  1.3 l 49.5 s 49.5 v 56.8]  LENIENT by 15.4
   why: Right colours and boxes, every word replaced by grey bars.
   - (15.7) The part with 'Create account' is missing
   - (14.8) The part with 'Create your account' is missing
   - (13) The part with 'Bookkeeping that does itself.' is missing
   - (9.3) The text '“We closed our books in a day instead...' is missing
   - (7.6) The heading 'Ledgerly' is missing
   - (0.2) 2 boxes are slightly out of place

invoice/i_excellent          band 91-100  total 88.1  [c 99.4 l 80.6 s 74.9 v 88.7]  HARSH by 2.9
   why: Grid rebuild of the table; indistinguishable at a glance.
   - (4.3) 4 pieces of text should be bold, such as the heading 'BILL TO'
   - (1.9) The lines drawn around 37 boxes near the top are missing
   - (1) The tag 'Awaiting payment' sits about 20 pixels too high and about 5 pixels too far right
   - (0.6) The table cell 'BC-216' is wider than the goal's (about 752 pixels wide instead of 90)
   - (0.6) The table cell 'BR-310' is wider than the goal's (about 752 pixels wide instead of 90)
   - (0.6) The table cell 'PB-085' is wider than the goal's (about 752 pixels wide instead of 90)

invoice/i_good               band 82-93  total 50.4  [c 57.4 l 56.5 s 43.6 v 44.8]  HARSH by 31.6
   why: Right invoice; numeric dates without labels column, 'Price' header, status pill gone, square logo.
   - (11.3) Colours across the page are slightly off: for example, the table cell 'DESCRIPTION' is a different shade of grey from the goal's
   - (10.8) The part with '3 December 2026' is missing
   - (8.7) The table cell '3 November 2026' has different words from the goal's: missing '3', 'november'; has 'issued', '03', '11' and 7 more where the goal does not
   - (3.6) The table cell says 'PRICE' where the goal says 'UNIT PRICE'
   - (2.6) The button 'N' uses a sans-serif font where the goal uses a serif one
   - (1.4) 9 table cells sit about 15 pixels too high and about 25 pixels too far right

invoice/i_mediocre           band 40-55  total 32.7  [c 48.1 l 30.6 s 24.4 v 30.3]  HARSH by 7.3
   why: Plain full-width page, teal header row, code column, ship-to and one line item gone.
   - (23.4) The box with 'INVOICE' is missing
   - (9.1) Colours across the page differ from the goal's: white where the goal uses grey, for example on the table cell 'DESCRIPTION'
   - (9.1) The text is generally larger than the goal's (36 pieces of text)
   - (4) The text 'Harbourlight Events Ltd Attn: Marcus ...' has different words from the goal's: has 'bill', 'to', 'issued' and 8 more where the goal does not
   - (3.7) Extra text the goal does not have: 'Subtotal: $3,600.00 Discount: −$180.0...'
   - (1.8) The text 'Bank transfer to Northwind Print Co. ...' has different words from the goal's: missing 'to', 'northwind', 'print' and 5 more; has 'payment', 'due', 'within' and 2 more where the goal does not

invoice/i_poor               band 6-20  total 23.7  [c 37.1 l 14.2 s 14.1 v 21.6]  LENIENT by 3.7
   why: Bare bordered table with five of eight lines and a total.
   - (28.3) The box with 'INVOICE' is missing
   - (9.4) The text is generally larger than the goal's (19 pieces of text)
   - (9.1) The page background is a lighter white than the goal's
   - (8.5) Colours across the page differ from the goal's: black where the goal uses dark teal, for example on the tag 'Total due'
   - (6.9) The heading says 'From: Northwind Print To: Harbourligh...' where the goal says 'Northwind Print Co.'
   - (4.4) The tag says 'Total' where the goal says 'Total due'

invoice/i_numbers_wrong      band 55-70  total 77.8  [c 57.4 l 97.0 s 99.3 v 98.0]  LENIENT by 7.8
   why: Looks perfect but two line amounts and the total due are wrong: the one thing an invoice must get right.
   - (11.2) The tag says '$5,391.00' where the goal says '$3,591.00'
   - (4.9) The table cell says '$390.00' where the goal says '$930.00'
   - (4.9) The table cell says '$1,810.00' where the goal says '$810.00'
   - (0.1) The table cell 'AMOUNT' is wider than the goal's (about 108 pixels wide instead of 99)
   - (0.1) The table cell '$180.00' is wider than the goal's (about 108 pixels wide instead of 99)
   - (0.1) The table cell '$930.00' is wider than the goal's (about 108 pixels wide instead of 99)

invoice/i_roomy              band 82-94  total 67.2  [c100.0 l 49.6 s 87.4 v 57.1]  HARSH by 14.8
   why: Same invoice with roomier rows and a mint header row; a boss shrugs.
   - (9.7) The part with '$3,591.00' sits about 120 pixels too low
   - (4.7) 20 table cells sit about 90 pixels too low
   - (1.2) 5 table cells sit about 50 pixels too low
   - (1) The box with 'INVOICE' is taller than the goal's (about 1259 pixels high instead of 1139)
   - (0.9) The table cell 'DESCRIPTION' is light teal where the goal's is white
   - (0.8) The part near the middle sits about 40 pixels too low

invoice/i_cols_swapped       band 80-92  total 83.6  [c100.0 l 69.6 s100.0 v 78.8]  ok
   why: Qty and Unit price columns swapped, values follow their headers; a small oddity.
   - (10) 9 table cells sit about 120 pixels too far right
   - (6.4) 9 table cells sit about 70 pixels too far left

invoice/cheat_top_only       band 18-36  total 36.9  [c 42.3 l 15.7 s 16.6 v 61.8]  LENIENT by 0.9
   why: Header and addresses only; table, totals and notes missing.
   - (62.6) The box with 'INVOICE' is missing
   - (0.5) Extra lines drawn around a box near the top that the goal does not have

invoice/cheat_tiny_text      band 2-14  total 10.3  [c  0.0 l  0.9 s  1.0 v 49.5]  ok
   why: Right frame and teal bar, every word 2px high and unreadable.
   - (74.5) The box with 'INVOICE' is missing
   - (15.2) An extra white box near the top that the goal does not have

invoice/cheat_picture_text   band 0-15  total 20.0  [c  0.0 l  0.0 s  0.0 v 61.2]  LENIENT by 5.0
   why: A screenshot of the goal as a background with the real words made transparent: no work done.
   - (46) The page background is a lighter white than the goal's
   - (34) The box with 'INVOICE' is missing

product/p_excellent          band 91-100  total 89.9  [c 99.9 l 79.9 s 96.4 v 86.4]  HARSH by 1.1
   why: Grid rebuild; indistinguishable at a glance.
   - (4.9) 4 pieces of text sit about 80 pixels too far left
   - (0.9) The section with 'Alder 28L Roll-Top Pack' sits about 10 pixels too high
   - (0.6) The table cell '1.1 kg' is wider than the goal's (about 440 pixels wide instead of 280)
   - (0.6) The table cell 'Recycled 420D nylon, TPU coated' is wider than the goal's (about 440 pixels wide instead of 280)
   - (0.6) The table cell 'Fits up to 16 inches' is wider than the goal's (about 440 pixels wide instead of 280)
   - (0.6) The table cell '52 × 30 × 17 cm' is wider than the goal's (about 440 pixels wide instead of 280)

product/p_good               band 76-88  total 41.5  [c 61.1 l 34.5 s 62.5 v 36.9]  HARSH by 34.5
   why: Right page; reviews as a list instead of cards, three related cards not four, no wishlist button or perks.
   - (9.7) The part with '$24' is missing
   - (8.6) The box with 'Free returns within 60 days Lifetime ...' is missing
   - (7.2) The text says '© 2026 Fernpeak Outfitters · Shipping...' where the goal says '© 2026 Fernpeak Outfitters'
   - (5.9) Colours across the page differ from the goal's: dark grey where the goal uses dark green, for example on the text 'In stock — ships in 1–2 business days'
   - (5.6) The text 'Shipping · Returns · Contact' is missing
   - (5.5) The tag '♡' is missing

product/p_mediocre           band 35-52  total 29.6  [c 41.4 l 27.1 s 25.4 v 27.3]  HARSH by 5.4
   why: Single centred column, tabs and related products gone, price and rating wrong, orange pill button.
   - (7) The text is generally larger than the goal's (14 pieces of text)
   - (5.5) The section with 'What customers say' is missing
   - (5.4) The table cell 'Recycled 420D nylon, TPU coated' has different words from the goal's: has 'volume', '24', '28' and 12 more where the goal does not
   - (5.3) Colours across the page differ from the goal's: white where the goal uses dark green, for example on the logo 'Fernpeak Outfitters'
   - (4.3) The part with 'Home / Packs / Daypacks / Alder 28L R...' is missing
   - (3.9) Extra content the goal does not have: 'Reviews'

product/p_poor               band 4-18  total 5.1  [c  3.8 l  1.4 s  1.7 v 15.4]  ok
   why: A grey square, 'Backpack', a price and a button.
   - (15.9) The heading says 'Backpack' where the goal says 'You may also like'
   - (15) The section with 'Alder 28L Roll-Top Pack' is missing
   - (13.7) The section with 'Fernpeak Outfitters' is missing
   - (9.8) The text says 'Price: $149' where the goal says '$89'
   - (8.6) The section with 'What customers say' is missing
   - (8) The section with '$45' is missing

product/p_wrong_product      band 55-70  total 86.0  [c 70.3 l100.0 s 96.1 v 91.9]  LENIENT by 16.0
   why: Looks right but the picture is a shoe and the price is $194 not $149.
   - (12.8) The heading says '$194.00' where the goal says '$149.00'
   - (1.2) The colours of the picture near the top left differ from the goal's (white where the goal's is orange)

product/p_sold_out           band 64-80  total 85.7  [c 68.0 l 96.8 s 97.8 v 99.7]  LENIENT by 5.7
   why: Looks right but the button says 'Sold out' and the stock line says unavailable.
   - (8.1) The text says 'Sold out' where the goal says 'Add to cart'
   - (6.2) The text says 'Currently unavailable — check back soon' where the goal says 'In stock — ships in 1–2 business days'

product/p_mirrored           band 72-86  total 63.8  [c100.0 l 47.8 s100.0 v 60.6]  HARSH by 8.2
   why: Image and buy box swapped sides; everything else right.
   - (13.3) The part with 'Alder 28L Roll-Top Pack' is on the left where the goal has it on the right
   - (12.8) The column is on the right where the goal has it on the left
   - (10.2) The part with '♡' is on the left where the goal has it on the right

product/cheat_lorem          band 12-28  total 28.3  [c  0.0 l 28.8 s 38.5 v 50.0]  LENIENT by 0.3
   why: Right look, every word replaced by lorem ipsum.
   - (39.8) Most of the text says something different from the goal (48 pieces of text, such as 'adipiscing elit sed do' where the goal says 'Alder 28L Roll-Top Pack')
   - (6.8) 4 pieces of text are missing
   - (5.5) 2 pieces of text are missing
   - (4.8) The text 'Cart (0)' is missing
   - (4.6) The text 'Sale' is missing
   - (2.1) Extra content the goal does not have: 3 pieces of text such as 'dolor'

product/cheat_picture        band 0-15  total 20.0  [c  0.0 l  0.0 s  0.0 v 44.3]  LENIENT by 5.0
   why: One screenshot of the goal as an image; no text, no build.
   - (19.4) The section with 'Alder 28L Roll-Top Pack' is missing
   - (19.3) An extra picture near the middle that the goal does not have
   - (17.6) The section with 'Fernpeak Outfitters' is missing
   - (15.7) The section with 'What customers say' is missing
   - (8) The dark green section near the bottom is missing

=== Order checks ===
ok   menu/m_excellent (93.9) > menu/m_good (77.3)
ok   menu/m_good (77.3) > menu/m_mediocre (28.5)
FAIL menu/m_mediocre (28.5) > menu/m_poor (31.9)
ok   menu/m_good (77.3) > menu/m_prices_wrong (76.0)
ok   menu/m_shifted (90.3) > menu/m_course_order (66.5)
ok   menu/m_shifted (90.3) > menu/m_prices_wrong (76.0)
ok   menu/m_poor (31.9) > menu/cheat_camouflage (11.2)
FAIL menu/m_mediocre (28.5) > menu/cheat_shuffled (42.0)
ok   signup/s_excellent (78.0) > signup/s_good (65.2)
ok   signup/s_good (65.2) > signup/s_mediocre (37.4)
ok   signup/s_mediocre (37.4) > signup/s_poor (10.9)
ok   signup/s_other_blue (98.2) > signup/s_wrong_purpose (59.3)
FAIL signup/s_good (65.2) > signup/s_no_password (72.8)
ok   signup/s_no_password (72.8) > signup/s_mediocre (37.4)
FAIL signup/s_mediocre (37.4) > signup/cheat_boxes (39.4)
ok   invoice/i_excellent (88.1) > invoice/i_good (50.4)
ok   invoice/i_good (50.4) > invoice/i_mediocre (32.7)
ok   invoice/i_mediocre (32.7) > invoice/i_poor (23.7)
FAIL invoice/i_roomy (67.2) > invoice/i_numbers_wrong (77.8)
ok   invoice/i_cols_swapped (83.6) > invoice/i_numbers_wrong (77.8)
ok   invoice/i_good (50.4) > invoice/cheat_top_only (36.9)
ok   invoice/i_mediocre (32.7) > invoice/cheat_picture_text (20.0)
ok   invoice/i_mediocre (32.7) > invoice/cheat_tiny_text (10.3)
ok   product/p_excellent (89.9) > product/p_good (41.5)
ok   product/p_good (41.5) > product/p_mediocre (29.6)
ok   product/p_mediocre (29.6) > product/p_poor (5.1)
FAIL product/p_mirrored (63.8) > product/p_wrong_product (86.0)
FAIL product/p_good (41.5) > product/p_wrong_product (86.0)
ok   product/p_mediocre (29.6) > product/cheat_picture (20.0)
ok   product/p_mediocre (29.6) > product/cheat_lorem (28.3)

=== Consistency probes ===

[length:one wrong price]
  short menu (2 courses)            90.2  cost   9.8  [c 76.3 l 98.8 s 99.2 v 99.9]
      - (9.8) The text says '81' where the goal says '18'
  full menu (4 courses)             90.2  cost   9.8  [c 76.3 l 99.1 s 99.4 v 99.9]
      - (9.8) The text says '81' where the goal says '18'
  long menu (8 courses)             90.2  cost   9.8  [c 76.3 l 99.5 s 99.7 v100.0]
      - (9.8) The text says '81' where the goal says '18'

[length:one missing dish]
  short menu                        83.3  cost  16.7  [c 91.1 l 76.2 s 94.5 v 60.7]
      - (16.7) The part with 'Cacio e pepe' is missing
  full menu                         83.3  cost  16.7  [c 91.1 l 76.2 s 96.1 v 70.9]
      - (16.7) The part with 'Cacio e pepe' is missing
  long menu                         83.3  cost  16.7  [c 91.1 l 76.2 s 97.7 v 74.2]
      - (16.7) The part with 'Cacio e pepe' is missing

[length:missing Add to cart]
  short product page                77.1  cost  22.9  [c 91.3 l 64.4 s 94.1 v 70.3]
      - (22.9) The box with 'Add to cart' is missing
  full product page                 77.1  cost  22.9  [c 91.3 l 64.4 s 95.7 v 70.3]
      - (22.9) The box with 'Add to cart' is missing

[count:wrong prices]
  1 wrong price(s)                  90.2  cost   9.8  [c 76.3 l 99.2 s 99.4 v100.0]
      - (9.8) The text says '19' where the goal says '16'
  2 wrong price(s)                  84.8  cost  15.2  [c 66.5 l 98.3 s 98.9 v 99.9]
      - (7.6) The text says '19' where the goal says '16'
      - (7.6) The text says '17' where the goal says '14'
  4 wrong price(s)                  79.3  cost  20.7  [c 58.2 l 96.6 s 97.7 v 99.9]
      - (5.2) The text says '19' where the goal says '16'
      - (5.2) The text says '17' where the goal says '14'
      - (5.2) The text says '27' where the goal says '24'
      - (5.2) The text says '29' where the goal says '26'
  8 wrong price(s)                  66.4  cost  33.6  [c 51.5 l 77.7 s 96.1 v 79.5]
      - (9.7) The text '9' is missing
      - (3.5) The text says '19' where the goal says '16'
      - (3.5) The text says '17' where the goal says '14'
      - (3.5) The text says '27' where the goal says '24'
      - (3.5) The text says '29' where the goal says '26'
      - (3.5) The text says '37' where the goal says '34'

[count:name typos]
  1 typo(s) in dish names           93.7  cost   6.3  [c 83.9 l100.0 s100.0 v 99.8]
      - (6.3) The text says 'Brrata con pesche' where the goal says 'Burrata con pesche'
  2 typo(s) in dish names           89.3  cost  10.7  [c 74.7 l100.0 s100.0 v 99.7]
      - (5.3) The text says 'Brrata con pesche' where the goal says 'Burrata con pesche'
      - (5.3) The text says 'Aancini al tartufo' where the goal says 'Arancini al tartufo'
  4 typo(s) in dish names           83.9  cost  16.1  [c 65.0 l100.0 s100.0 v 99.3]
      - (4) The text says 'Brrata con pesche' where the goal says 'Burrata con pesche'
      - (4) The text says 'Aancini al tartufo' where the goal says 'Arancini al tartufo'
      - (4) The text says 'Tgliatelle al ragù' where the goal says 'Tagliatelle al ragù'
      - (4) The text says 'Rsotto ai funghi' where the goal says 'Risotto ai funghi'
  8 typo(s) in dish names           78.4  cost  21.6  [c 57.0 l 96.8 s 97.8 v 98.9]
      - (2.7) The text says 'Brrata con pesche' where the goal says 'Burrata con pesche'
      - (2.7) The text says 'Aancini al tartufo' where the goal says 'Arancini al tartufo'
      - (2.7) The text says 'Tgliatelle al ragù' where the goal says 'Tagliatelle al ragù'
      - (2.7) The text says 'Rsotto ai funghi' where the goal says 'Risotto ai funghi'
      - (2.7) The text says 'Banzino al forno' where the goal says 'Branzino al forno'
      - (2.7) The text says 'Bstecca alla fiorentina' where the goal says 'Bistecca alla fiorentina'

[count:font slips]
  1 dish name(s) in Arial           97.9  cost   2.1  [c100.0 l 99.9 s 91.1 v 96.9]
      - (2) The text 'Burrata con pesche' uses a sans-serif font where the goal uses a serif one
      - (0.1) Everything sits is slightly out of place
  2 dish name(s) in Arial           96.2  cost   3.8  [c100.0 l 99.9 s 84.4 v 94.5]
      - (1.9) The text 'Burrata con pesche' uses a sans-serif font where the goal uses a serif one
      - (1.9) The text 'Arancini al tartufo' uses a sans-serif font where the goal uses a serif one
      - (0.1) Everything sits is slightly out of place
  4 dish name(s) in Arial           93.7  cost   6.3  [c100.0 l 99.9 s 75.5 v 91.0]
      - (6.3) The text uses a sans-serif font where the goal uses a serif one (4 pieces of text)
      - (0.1) Everything sits is slightly out of place
  8 dish name(s) in Arial           90.6  cost   9.4  [c100.0 l 99.8 s 66.6 v 87.1]
      - (9.3) The text uses a sans-serif font where the goal uses a serif one (8 pieces of text)
      - (0.1) The section with 'Osteria Lume' is slightly out of place

[chain:menu]
  1 wrong price                     90.2  cost   9.8  [c 76.3 l 99.1 s 99.4 v 99.9]
      - (9.8) The text says '81' where the goal says '18'
  + missing dish                    75.6  cost  24.4  [c 70.0 l 76.2 s 95.5 v 70.9]
      - (15.4) The part with 'Cacio e pepe' is missing
      - (9) The text says '81' where the goal says '18'
  + footer gone                     62.2  cost  37.8  [c 64.6 l 60.7 s 75.5 v 61.0]
      - (18.3) The dark green section near the bottom is missing
      - (10.6) The part with 'Cacio e pepe' is missing
      - (8.9) The text says '81' where the goal says '18'

[chain:invoice]
  roomy rows                        67.2  cost  32.8  [c100.0 l 49.6 s 87.4 v 57.1]
      - (9.7) The part with '$3,591.00' sits about 120 pixels too low
      - (4.7) 20 table cells sit about 90 pixels too low
      - (1.2) 5 table cells sit about 50 pixels too low
      - (1) The box with 'INVOICE' is taller than the goal's (about 1259 pixels high instead of 1139)
      - (0.9) The table cell 'DESCRIPTION' is light teal where the goal's is white
      - (0.8) The part near the middle sits about 40 pixels too low
  + total due wrong                 59.8  cost  40.2  [c 70.3 l 49.6 s 87.4 v 57.1]
      - (10.2) The tag says '$3,951.00' where the goal says '$3,591.00'
      - (8.8) The part with '$3,591.00' sits about 120 pixels too low
      - (4.3) 20 table cells sit about 90 pixels too low
      - (1.1) 5 table cells sit about 50 pixels too low
      - (0.9) The box with 'INVOICE' is taller than the goal's (about 1259 pixels high instead of 1139)
      - (0.8) The table cell 'DESCRIPTION' is light teal where the goal's is white
  + one line item gone              57.2  cost  42.8  [c 64.7 l 48.1 s 87.4 v 52.9]
      - (12.6) 5 table cells are missing
      - (9.7) The tag says '$3,951.00' where the goal says '$3,591.00'
      - (5) The part with '$3,591.00' sits about 70 pixels too low
      - (1.1) 5 table cells sit about 50 pixels too low
      - (0.8) The table cell 'DESCRIPTION' is light teal where the goal's is white
      - (0.8) The part near the middle sits about 40 pixels too low

[chain:product]
  mirrored                          63.8  cost  36.2  [c100.0 l 47.8 s100.0 v 60.6]
      - (13.3) The part with 'Alder 28L Roll-Top Pack' is on the left where the goal has it on the right
      - (12.8) The column is on the right where the goal has it on the left
      - (10.2) The part with '♡' is on the left where the goal has it on the right
  + price wrong                     57.1  cost  42.9  [c 70.3 l 47.8 s100.0 v 60.6]
      - (11.6) The part with 'Alder 28L Roll-Top Pack' is on the left where the goal has it on the right
      - (11.3) The heading says '$194.00' where the goal says '$149.00'
      - (11.2) The column is on the right where the goal has it on the left
      - (8.9) The part with '♡' is on the left where the goal has it on the right
  + related products gone           45.2  cost  54.8  [c 61.4 l 35.5 s 92.3 v 44.1]
      - (20.4) The section with 'You may also like' is missing
      - (9.3) The heading says '$194.00' where the goal says '$149.00'
      - (9.2) The part with 'Alder 28L Roll-Top Pack' is on the left where the goal has it on the right
      - (8.9) The column is on the right where the goal has it on the left
      - (7.1) The part with '♡' is on the left where the goal has it on the right

[chain:signup]
  s_good                            65.2  cost  34.8  [c 83.4 l 60.1 s 58.3 v 58.9]
      - (10.3) The text '“We closed our books in a day instead...' is missing
      - (8.8) The text 'At least 8 characters, with one numbe...' is missing
      - (6.2) The button 'L' is noticeably larger than the goal's (24 px text instead of 18 px)
      - (5.7) Colours across the page are slightly off: for example, the button 'L' is a lighter blue than the goal's
      - (0.6) The part with 'Create account' sits about 10 pixels too high and about 10 pixels too far left
      - (0.6) The part with 'Create your account' sits about 10 pixels too far left
  + password field gone             57.9  cost  42.1  [c 83.0 l 51.5 s 58.5 v 52.0]
      - (10.6) The part with 'At least 8 characters, with one numbe...' is missing
      - (8.3) The text '“We closed our books in a day instead...' is missing
      - (6.3) The label 'Password' is missing
      - (6) The button 'L' is noticeably larger than the goal's (24 px text instead of 18 px)
      - (5.5) Colours across the page are slightly off: for example, the button 'L' is a lighter blue than the goal's
      - (2.7) The part with 'Create your account' sits about 40 pixels too low and about 10 pixels too far left
  + Google button gone              53.3  cost  46.7  [c 80.9 l 46.5 s 58.6 v 47.9]
      - (8.7) The part with 'At least 8 characters, with one numbe...' is missing
      - (7.4) The tag 'Continue with Google' is missing
      - (6.9) The text '“We closed our books in a day instead...' is missing
      - (5.9) The button 'L' is noticeably larger than the goal's (24 px text instead of 18 px)
      - (5.3) Colours across the page are slightly off: for example, the button 'L' is a lighter blue than the goal's
      - (5.2) The label 'Password' is missing

=== Summary ===
inside band 12/38; outside 26, mean distance 9.5, worst 34.5
order checks held 23/30
repeat grades differing: 0
time per grade: median 434 ms, max 828 ms, n=112
```

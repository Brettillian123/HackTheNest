# Audit: advanced single pages (grader 0.6.0)

Three harder goals (`calibration/sets/dashboard`, `article`, `checkout`), 8 attempts each. Human bands were written to `pages-advanced.json` after looking at every screenshot and before any grade was run. Runner: `npx tsx calibration/audit/run-pages-advanced.mts`.

**Result: 5 of 24 inside the human band, 0 order failures, each goal scores exactly 100 against itself.** The grader ranks well; it is mostly too generous. Three kinds of attempt are graded far too kindly: wrong data (+10 to +15), placeholder text (+5 to +17) and a full restyle (+8 to +16). The rebuilds and the near copies come out about where a person would put them.

## Disagreements (worst first)

1. **checkout/lorem**: band 45-60, grader **76.8** (content 49.8, layout 78.1, style 84.5, visual 96.0). LENIENT by 16.8.
   A person sees the subtitle, every plan description, every feature and every table row label in Latin: the page tells you nothing. The grader takes off for the words but still gives 75% of the score for the look. Visual (96) cannot tell Latin from English, because `compareVisual` in `visual.ts` compares brightness texture on a screenshot shrunk 4x, and lines of text the same length make the same texture. Layout and style also keep most of their credit, because unmatched text blocks count only as missing plus half-weight extra (`score()` in `score.ts`, `MATCH.extraPenalty`), and the blocks that still match (headings, prices, buttons) carry most of the weight.
2. **dashboard/restyled**: band 68-80, grader **95.6** (100 / 100 / 94.1 / 87.3). LENIENT by 15.6.
   A person sees serif type everywhere, a red theme and square corners: a different design system. The grader: font family is a 0/1 credit worth 0.1 of each text block's style (`textStyleParts`, `STYLE.text.family`), so a typeface change across the whole page costs at most about 1.7 points of the total. The accent shows mostly on the bar chart, an inline SVG that the grader treats as an image with no style (`styleParts` returns null), so the chart turning red costs nothing in style. Corner radius is measured as a share of half the shorter side (`TOL.radius`), so 10 px corners on big cards read as nearly square already. Layout is 100 because Georgia and Arial wrap the same way here.
3. **checkout/wrong-data**: band 65-80, grader **95.3** (87.8 / 96.5 / 98.3 / 99.1). LENIENT by 15.3.
   On a pricing page all three prices, the trial length and the storage limits are wrong. A boss rejects it. Content is one bag of words for the whole page (`wordOverlap` in `score()`), so each price is 1 word out of about 200, the same as "the". Layout, style and visual have no way to see a wrong number, so at least 75% of the score is untouched by wrong data. Wrong numbers that come out the same width still pair by position, so most of them never even count as missing.
4. **article/lorem**: band 35-52, grader **66.4** (35.5 / 64.7 / 73.4 / 93.7). LENIENT by 14.4. Same cause as 1. Here the Latin is every paragraph, the quote and the list, which is most of what an article is, and visual still gives 93.7.
5. **article/restyled**: band 65-78, grader **91.1** (100 / 93.7 / 95.6 / 75.6). LENIENT by 13.1. Same cause as 2. Serif to sans-serif across all body text is the first thing a reader of a long article notices, yet none of the six feedback lines mentions it (see Feedback text).
6. **article/wrong-data**: band 68-82, grader **94.8**, LENIENT by 12.8; and **dashboard/wrong-data**: band 70-82, grader **92.5**, LENIENT by 10.5. Same cause as 3.

Smaller ones, possibly partly mine:
- **article/rearranged**: 62-76, grader 85.8 (+9.8). The list and the figure (7 of 70 blocks) moved about 850 px. Each block's position credit only loses in proportion to that block's weight, so moving two sections costs little in layout (81). Visual (65.7) does see it. My band may be harsh; a person would still call it "rearranged" and send it back.
- **checkout/restyled** 87.8 vs 66-80 (+7.8), **dashboard/lorem** 64.9 vs 45-60 (+4.9): same causes as 2 and 1.
- **near** pages scored 98.5 to 99.8 against bands topping out at 97-98 (+1.5 to +1.8). Headings losing their bold, plus 4 px shifts and a shade change, cost 0.2 to 0.4 points. Shifts of 4 px or less cost exactly nothing by design (`sizeRatio` treats ±4 px as equal, `TOL.position.full` = 8 px, and visual forgives a page-wide shift). The owner asked that small pixel differences cost "a little, not nothing".
- **rebuild-vague** pages were 0.1 to 2.3 under their bands (HARSH), which is inside the noise of my own bands.

## Agreements

- dashboard/rebuild-detailed 88.5 (87-96): a 34 px wider sidebar shifts everything, and it is charged mildly.
- dashboard/missing-section 69.1 (55-70): the missing chart is the top feedback line.
- dashboard/rearranged 72.2 (60-74): the sidebar on the right is caught by visual (31.1).
- checkout/rebuild-detailed 88.1 (85-95).
- checkout/missing-section 69.5 (55-70).
- Near misses at the edges: article/rebuild-detailed 98.2 (90-98), article/missing-section 75.2 (60-74), checkout/rearranged 77.6 (62-76), article/rebuild-vague 24.9 (25-42).
- All 23 order checks hold: near beats restyled, missing and lorem; detailed rebuild beats vague; every attempt beats the vague rebuild.

## Feedback text

- Table cells and status pills are called "buttons" and reported missing when they are on screen. dashboard/rebuild-detailed, where `details.missingText` is empty: "The button 'Paid' is missing", "The button 'CUSTOMER' is missing", "The button 'STATUS' is missing", "The button 'AMOUNT' is missing", "The button 'ORDER' is missing", "The button 'Pending' is missing". The thing that is actually missing is the goal's bordered `<td>`/`<th>` box (the rebuild draws one border per row); `nameOf` names it after the text inside it and calls it a button. Untrue as written.
- Run-together text from the goal. checkout/rebuild-detailed: "The text 'PrivacyTermsStatusContact' is missing" and "The text 'ProductPricingCustomersDocsStart free' sits about 170 pixels too far right". **This is a real bug, not only bad wording.** `extract-source.ts` (around line 493) joins a container's text parts with `''`, so links with no whitespace between them in the source become one word. The correct rebuild loses content (96.9 with every word right), and its separate links count as 8 "extra" texts.
- A changed value is reported as gone, not as changed. dashboard/wrong-data: "The heading '$48,250' is missing". A person would say it shows $52,910 instead.
- Numbers split into words. dashboard/wrong-data: "The button '$1,240.00' has different words from the goal's: missing '1', '240'; has '2', '015' where the goal does not". It is also a table cell, not a button.
- Bad grammar. dashboard/rearranged: "1 boxes sit about 1070 pixels too far right".
- Not what a person mentions first:
  - dashboard/rearranged: "15 things sit about 210 pixels too far left". A person would say the sidebar is on the wrong side.
  - article/restyled: the six lines are all about positions ("4 buttons sit about 190 pixels too low", "4 pieces of text sit about 40 pixels too low and about 40 pixels too far right", ...). The serif to sans-serif change across the whole article is never mentioned.
  - dashboard/restyled: the font appears only at 0.1 points, as lines 5 and 6.
  - checkout/missing-section: "The button '✓' is missing" and "The button '✗' is missing". A person would say "the comparison table is missing".
  - article/lorem: "The heading '\"You go to sleep in one country and w...' is missing". It is a pull quote, not a heading.
- Vague "things". dashboard/missing-section: "2 things sit about 170 pixels too high and about 15 pixels too far right".

## Inside the band but felt unfair

- checkout/rebuild-detailed scores content 96.9 with every word right, because of the run-together text bug above. Any page whose goal has adjacent inline links without spaces will punish a correct rebuild that spaces them.
- dashboard/rebuild-detailed: 5 of its 6 feedback lines say table pieces are missing when the table is complete. A player would distrust the grader.
- dashboard/rebuild-vague: the top lines are "The button 'Paid' is missing" and "The button 'Nov 8, 2026' is missing". The real story is a light theme, three cards instead of four and different data.

## Test run (step 7)

`npx vitest run test/grader.test.ts`: **1 failed, 45 passed.** The failure is "agreement with the human ranking > covers every attempt with an expectation". That test requires every folder under `calibration/sets` to have bands in `calibration/expected.json`. The three new sets are not in it, because this audit may not edit that file. The test was not changed. It needs one of two fixes: add the bands from `pages-advanced.json` to `expected.json`, or move the audit sets out of `calibration/sets`. "Puts every calibration attempt in its expected band and order" passed.

## Proof: runner output

```

== dashboard   goal vs itself: 100.00 ok
dashboard rebuild-detailed band 87-96  total  88.5 | content 100.0 layout  86.3 style  90.3 visual  78.2 | ok
      - (1.1) The button 'Paid' is missing
      - (0.5) The button 'CUSTOMER' is missing
      - (0.5) The button 'STATUS' is missing
dashboard rebuild-vague    band 35-50  total  32.7 | content  10.4 layout  43.1 style  47.8 visual  30.6 | HARSH by 2.3
      - (2.5) The button 'Paid' is missing
      - (1.8) The button 'Nov 8, 2026' is missing
      - (1.7) The button 'Nov 12, 2026' is missing
dashboard near             band 90-98  total  99.8 | content 100.0 layout 100.0 style  99.8 visual  99.5 | LENIENT by 1.8
      - (0.1) The text 'Monthly revenue' should be bold
      - (0.1) The text 'Recent orders' should be bold
dashboard wrong-data       band 70-82  total  92.5 | content  84.7 layout  91.8 style  94.3 visual  99.5 | LENIENT by 10.5
      - (0.8) The heading '$48,250' is missing
      - (0.8) The button '$1,240.00' has different words from the goal's: missing '1', '240'; has '2', '015' where the goal does not
      - (0.6) The button 'Oliver Brown' is missing
dashboard missing-section  band 55-70  total  69.1 | content  99.3 layout  53.9 style  86.5 visual  43.2 | ok
      - (9.6) The image near the middle is missing
      - (2.7) 2 things sit about 170 pixels too high and about 15 pixels too far right
      - (2.6) 23 things sit about 360 pixels too high and about 30 pixels too far right
dashboard restyled         band 68-80  total  95.6 | content 100.0 layout 100.0 style  94.1 visual  87.3 | LENIENT by 15.6
      - (0.5) The button 'Overview' is red where the goal's is blue
      - (0.2) The corners of the button 'Overview' are sharper than the goal's
      - (0.1) The corners of the button 'Search orders, customers...' are sharper than the goal's
dashboard rearranged       band 60-74  total  72.2 | content 100.0 layout  65.7 style  98.8 visual  31.1 | ok
      - (13.2) 15 things sit about 210 pixels too far left
      - (8.5) 1 boxes sit about 1070 pixels too far right
      - (1.2) 11 buttons sit about 1000 pixels too far left
dashboard lorem            band 45-60  total  64.9 | content  35.3 layout  64.0 style  72.5 visual  89.6 | LENIENT by 4.9
      - (1.4) The button 'Nov 12, 2026' is missing
      - (1.4) The button 'Nov 10, 2026' is missing
      - (1.4) The button 'Nov 11, 2026' is missing

== article   goal vs itself: 100.00 ok
article   rebuild-detailed band 90-98  total  98.2 | content 100.0 layout  98.6 style  99.9 visual  94.6 | LENIENT by 0.2
      - (0.6) 5 buttons sit about 40 pixels too far left
      - (0.5) An extra light grey box near the middle that the goal does not have
      - (0.1) The border of the light grey section near the bottom is fainter or stronger than the goal's
article   rebuild-vague    band 25-42  total  24.9 | content  22.5 layout  22.2 style  31.3 visual  25.5 | HARSH by 0.1
      - (6.0) The text 'What changed was not the trains thems...' has different words from the goal's: missing 'what', 'changed', 'was' and 21 more; has 'something', 'unexpected', 'has' and 23 more where the goal does not
      - (4.7) The heading 'The Quiet Return of the Night Train' has different words from the goal's: missing 'quiet', 'return'; has 'for', 'decades', 'seemed' and 28 more where the goal does not
      - (4.5) The text 'Ten years ago, the sleeper train look...' is missing
article   near             band 88-97  total  98.5 | content 100.0 layout  99.6 style  99.4 visual  95.0 | LENIENT by 1.5
      - (0.4) 2 headings sit about 30 pixels too far left
      - (0.2) The heading 'Checking the timetable yourself' should be bold
      - (0.2) The heading 'How to book a good berth' should be bold
article   wrong-data       band 68-82  total  94.8 | content  91.7 layout  94.3 style  96.6 visual  96.9 | LENIENT by 12.8
      - (0.8) The text 'By Hannah Okafor · November 9, 2026 ·...' has different words from the goal's: missing 'hannah', 'okafor', 'november' and 2 more; has 'daniel', 'moreau', 'october' and 2 more where the goal does not
      - (0.7) The button 'European Sleeper' is missing
      - (0.6) The button 'SJ Euronight' is missing
article   missing-section  band 60-74  total  75.2 | content  97.2 layout  62.5 style  90.6 visual  56.1 | LENIENT by 1.2
      - (8.6) 28 things sit about 300 pixels too high
      - (7.3) The image near the middle is missing
      - (2.0) The text 'Figure 1. Night train routes in Europ...' is missing
article   restyled         band 65-78  total  91.1 | content 100.0 layout  93.7 style  95.6 visual  75.6 | LENIENT by 13.1
      - (1.0) 4 buttons sit about 190 pixels too low
      - (0.9) 4 pieces of text sit about 40 pixels too low and about 40 pixels too far right
      - (0.6) The heading 'The Quiet Return of the Night Train' sits about 40 pixels too far left
article   rearranged       band 62-76  total  85.8 | content 100.0 layout  81.2 style  99.9 visual  65.7 | LENIENT by 9.8
      - (4.4) 5 things sit about 870 pixels too high
      - (4.2) 2 things sit about 800 pixels too low
      - (1.0) 5 things sit about 60 pixels too high
article   lorem            band 35-52  total  66.4 | content  35.5 layout  64.7 style  73.4 visual  93.7 | LENIENT by 14.4
      - (4.4) The text 'Ten years ago, the sleeper train look...' is missing
      - (4.2) The text 'What changed was not the trains thems...' is missing
      - (3.9) Extra text the goal does not have: 'Lorem ipsum dolor sit amet consectetu...'

== checkout   goal vs itself: 100.00 ok
checkout  rebuild-detailed band 85-95  total  88.1 | content  96.9 layout  90.8 style  97.4 visual  68.8 | ok
      - (1.9) The text 'PrivacyTermsStatusContact' is missing
      - (1.2) 4 things sit about 30 pixels too low
      - (0.6) 2 buttons sit about 310 pixels too low and about 30 pixels too far right
checkout  rebuild-vague    band 28-45  total  27.0 | content  23.6 layout  26.1 style  50.8 visual  12.6 | HARSH by 1.0
      - (2.6) The heading 'Simple pricing for growing teams' is missing
      - (2.5) The text 'Start free for 14 days. No credit car...' is missing
      - (1.8) The button 'Choose Business' is missing
checkout  near             band 90-98  total  99.6 | content 100.0 layout 100.0 style  99.8 visual  98.6 | LENIENT by 1.6
      - (0.1) The text 'Business' should be bold
      - (0.1) The text 'Starter' should be bold
      - (0.1) The text 'Team' should be bold
checkout  wrong-data       band 65-80  total  95.3 | content  87.8 layout  96.5 style  98.3 visual  99.1 | LENIENT by 15.3
      - (0.8) The text '1 TB storage' has different words from the goal's: missing '1', 'tb'; has '500', 'gb' where the goal does not
      - (0.6) The text 'Jordan Lee' is missing
      - (0.3) The text 'Start free for 14 days. No credit car...' has different words from the goal's: missing '14'; has '30' where the goal does not
checkout  missing-section  band 55-70  total  69.5 | content  90.1 layout  57.6 style  70.9 visual  62.0 | ok
      - (5.9) 3 things sit about 450 pixels too high
      - (3.7) The button '✓' is missing
      - (1.6) The button '✗' is missing
checkout  restyled         band 66-80  total  87.8 | content 100.0 layout  99.1 style  86.5 visual  63.2 | LENIENT by 7.8
      - (2.7) The blue section near the top is red where the goal's is blue
      - (0.8) The box with 'Start my free trial' is orange where the goal's is teal
      - (0.6) The button 'Choose Team' is orange where the goal's is teal
checkout  rearranged       band 62-76  total  77.6 | content 100.0 layout  74.7 style  99.2 visual  41.5 | LENIENT by 1.6
      - (12.5) 29 things sit about 540 pixels too low
      - (6.3) 2 things sit about 450 pixels too high
      - (0.6) 2 buttons sit about 540 pixels too low and about 200 pixels too far left
checkout  lorem            band 45-60  total  76.8 | content  49.8 layout  78.1 style  84.5 visual  96.0 | LENIENT by 16.8
      - (2.0) The text 'Start free for 14 days. No credit car...' is missing
      - (1.3) Extra text the goal does not have: 'Lorem ipsum dolor sit amet consectetu...'
      - (1.2) The text 'Unlimited projects' is missing

5/24 attempts inside the human band; 0 order failures
```

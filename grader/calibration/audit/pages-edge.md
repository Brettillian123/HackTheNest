# Single-page edge cases: grader vs a fair human

39 cases, 52 attempts (`calibration/edge/pages/`), bands in `pages-edge.json` written before any grading. Grader 0.6.0.
Result: **21 of 52 inside the band**. 0 HARSH, 31 LENIENT. Every goal scores exactly 100 against itself; every attempt scored identically twice. All four rank orders held.

The pattern: the grader never runs harsh, and it is too lenient on anything a person judges by *meaning or role* (a price, the logo, the CTA, readability, the brand colour, centring). All "same look, different build" cases scored 99.3 to 100, as they should.

## Disagreements

Worst first. Breakdown is content / layout / style / visual.

1. **colour-contrast / pale-text**: band 50-68, grader **95.0** (100 / 100 / 90.0 / 88.2), lenient by 27.
   A person sees pale grey text (#c8ccd2 on white) that is hard to read: a page they would reject. The grader charged 5 points.
   Cause: nothing measures legibility. In `score.ts` `textStyleParts`, text colour is 0.3 of one style attribute set, so a total colour miss costs about 30% of style on text blocks only. In `visual.ts` `compareVisual`, the SSIM structure term is contrast-normalised, so faded text keeps its shape, and `colorScore` averages each cell, so thin glyphs barely move a cell's colour. Content and layout pay in full for text nobody can comfortably read.

2. **content-logo / other-company**: band 68-82, grader **99.4** (99.7 / 98.8 / 99.2 / 99.9), lenient by 17.4.
   A person sees another company's name in the logo and stops there. The grader charged 0.6.
3. **content-price / team-94**: band 75-88, grader **99.8** (99.5 / 100 / 100 / 99.9), lenient by 11.8.
4. **content-cta / cta-learn-more**: band 75-88, grader **99.4** (98.9 / 99.2 / 99.5 / 99.8), lenient by 11.4.
5. **content-cards / missing-one**: band 75-87, grader **97.4** (97.3 / 96.7 / 96.7 / 99.2), lenient by 10.4.
   (Also lenient by about 9 to 10: headline-typo 99.9, missing-field 99.1, four-links 99.1.)
   Cause, shared by 2 to 5: every score is an average over the whole page, weighted by area or word count, never by role. `score.ts` `score()` computes content as `wordOverlap` over every word on the page (one wrong word in about 250 is 0.4% of content). `importance()` weighs a block by `sqrt(w*h)` times contrast, so the logo, a price or a button label are tiny next to paragraphs and cards. `visual.ts` structure and colour are averaged across the whole 2116 px screenshot, so a card-sized hole is about 2% of it. A person reads the headline, logo, prices and button first; the grader has no notion of that. A side effect is inconsistency across goal sizes: the same-sized defect costs about 12 points on the one-sentence page (`layout-short`) and under 1 point on the landing page.

6. **colour-theme / greyscale**: band 55-72, grader **88.7** (100 / 88.5 / 86.3 / 79.4), lenient by 16.7.
   A person sees the green brand gone, the whole page grey. The grader charged 11, and part of that went to layout for the wrong reason (see feedback).
   Cause: `visual.ts` `colorScore` gives flat cells (the big green hero band, the dark footer) `VISUAL.backgroundWeight` = 0.05 of a foreground cell, so recolouring the largest colour areas on the page barely counts; `structureScore` is luminance only. In `score.ts`, colour is one attribute among several in `textStyleParts`/`boxStyleParts`. Some boxes whose fill changed failed `matchBlocks` (0.4 of box similarity is colour) and were charged as missing in layout instead of as a colour error in style.

7. **layout-width / left-aligned**: band 65-80, grader **94.7** (100 / 91.2 / 99.9 / 89.2), lenient by 14.7.
   A person sees the whole content column hugging the left edge with a 200 px empty strip on the right. The grader charged 5.
   Cause: `score.ts` `score()` takes the median shift of all sure pairs (`dx` = -80) and forgives it: `relative` geometry gets full credit, and the visual comparison is slid back by `forgiven` (about 0.66 at 80 px; `TOL.position` falls from 8 to 240 px). That forgiveness is meant for "the page sits a little low", but here the shift *is* the error: the page lost its centring. The same applies, more mildly, to `no-max-width` (89.7, lenient by 3.7).

8. **layout-overlap / chip-behind-image**: band 76-88, grader **99.8** (100 / 100 / 99.9 / 99.2), lenient by 11.8.
   A person sees the rating chip's text hidden behind the hero picture. The grader says the text is all there.
   Cause: `blocks.ts` `inspectText` decides text is visible if the patch where it should be is not one flat colour. Covered by a picture (mountain edges, two greens), the patch is not flat, so hidden text counts as present, matched and correctly placed. The earlier fix catches a flat white cover, not a picture or any busy cover.

Next in size, not analysed further: colour-theme/dark 68.4 (band 42-60; content and layout give 55 points in full to a page that does not look like the goal; same `colorScore` cause), colour-hue/hue-20 98.2 (band 80-92), layout-tall/diff-below-cut 100 (band 82-94: anything below the 2400 px cut is not seen at all; `MAX_PAGE_HEIGHT`, by design but worth knowing).

## Agreements

- build-bg/wrapper-bg 100, build-border/inset-shadow 99.3, build-button/as-button 100, as-div 100, build-caps/typed-caps 100, build-grid/table 100, flex 100, build-icon/data-img 100, build-text/b-tag 100, three-spans 100, build-units/rem 100: the same look built differently scores as identical.
- small-font/helvetica 100 (it falls back to Arial, so pixel-identical), small-grey/body-grey 99.9, small-quotes/straight-quotes 100.
- colour-tint/black-10 88.6 (82-93).
- layout-columns/hero-one-column 72.8 (62-78); layout-scale/zoom-90 76.2 (72-86); layout-sticky 100.
- less-extras/extra-testimonial 92.4 (86-95).
- own-whole/lorem 45.2 (30-48); own-whole/no-icons 84.7 (84-93).
- Near misses, lenient by 3 or less: small-offset/down-6px 100 (92-99; the "slightly harsh" cost for 6 px is zero), small-narrow 98.9, small-lineheight 95.5, layout-short/off-centre 88.1, less-extras/cookie-banner 96.7, back-to-top 99.5, own-whole/unstyled 44.1, content-language/spanish 51.6, layout-tall/diff-above-cut 95.0.
- Less-than-pixels cases all scored high but above their bands (other-photo 98.5, bars-differ 99.9, rows-swapped 99.9, badge-30px 99.9, gradient reversed 99.0); the direction is right, the grader is simply more forgiving than my bands.

## Feedback text

- greyscale: "The dark teal section near the bottom is missing (4.2)" and "The button 'Choose Starter' is missing (1.3)". Untrue: both are there, grey. Top line should be that the colours are gone.
- black-10: "The box with 'Most popular' is missing (2.2)" and "The box with '“Brightleaf cut our Monday planning m...' is missing (2.1)". Untrue: they are there, 10% darker. Nothing says the page is tinted.
- content-nav: "The text 'FeaturesPricingCustomersBlogContact' is missing (0.7)" and "Extra text the goal does not have: 'FeaturesPricingCustomersContact' (0.2)". The words are run together, and the message should be that the Blog link is missing.
- back-to-top: "The text 'PrivacyTerms' has different words from the goal's: has 'back', 'to', 'top' where the goal does not (0.4)". Words run together.
- chip-behind-image: "The background behind the text '★ 4.9 from 2,000 teams' is dark green where the goal's is white (0.2)". Misleading: the text is hidden behind the picture.
- content-logo: "The heading 'Brightleaf' is missing (0.4)" + "Extra text the goal does not have: 'Greenfield' (0.2)". It is the logo, not a heading. One line ("the logo says Greenfield, not Brightleaf") is what a person would say.
- content-cards/swapped-two: "2 pieces of text sit about 370 pixels too far right (0.5)" / "...too far left". A person would say the first two cards are swapped.
- layout-scale/zoom-90: "The box with 'Name' sits about 550 pixels too high (2)". The form moved about 190 px, not 550. Nothing says the whole page is 10% smaller.
- layout-width/left-aligned: "The green section near the top is slightly out of place (0.3)". The hero band is full width and has not moved; and "21 things sit about 80 pixels too far left" does not say the column should be centred.
- own-whole/no-pricing: "16 things sit about 420 pixels too high (5.3)" comes first. It should say the pricing section is missing; the move is a consequence.
- own-whole/no-icons: "18 things sit about 110 pixels too high (4.7)". It should say the six icons are missing.
- small-lineheight/lh-1-6: "An extra white box near the bottom that the goal does not have (0.6)". Misleading: nothing was added; the text is taller.
- build-border/inset-shadow: "The box with 'Shared calendars' is missing the goal's border (0.1)". On screen the border is there (drawn as a shadow).
- content-price: "has '94' where the goal does not (0.1)". True, but 0.1 points tells the player a wrong price barely matters.

## Inside the band but felt unfair

- **Missing icons versus a missing card.** no-icons scored 84.7, missing-one 97.4. Losing six decorative icons costs 13 points, but losing a whole card with its words costs 3. Most of no-icons' loss is layout charging every block below for moving up 110 px (`score.ts`: position credit per pair, with the median `dy` dominated by the unmoved top half). One missing thing gets charged again for each thing that drifted after it. A person ranks these the other way.
- **colour-tint/black-10** (88.6): layout fell to 79.8 because tinted boxes failed `matchBlocks` on colour. A tint is a colour fault, but it was charged as boxes missing from the layout.
- **colour-theme/greyscale**: same leak, layout 88.5 for a page whose layout is perfect.
- **content-language/spanish** (51.6) and **own-whole/lorem** (45.2): about 50 for a page whose every word is wrong. Defensible on this scale, but visual 88 to 92 and style 52 to 58 carry it. A boss would call both unusable.
- **layout-tall**: above-cut 95.0, below-cut 100. The same edit gets two different scores depending on where it falls.

## Full output of `run-pages-edge.mts`

```
build-bg          wrapper-bg         [94-100] total 100.0 | C 100.0 L 100.0 S 100.0 V 100.0 | ok
build-border      inset-shadow       [93-100] total  99.3 | C 100.0 L 100.0 S  98.7 V  98.4 | ok
      - The box with 'Shared calendars' is missing the goal's border (0.1)
      - The box with 'Smart reminders' is missing the goal's border (0.1)
build-button      as-button          [94-100] total 100.0 | C 100.0 L 100.0 S 100.0 V 100.0 | ok
build-button      as-div             [94-100] total 100.0 | C 100.0 L 100.0 S 100.0 V 100.0 | ok
build-caps        typed-caps         [94-100] total 100.0 | C 100.0 L 100.0 S 100.0 V 100.0 | ok
build-grid        table              [94-100] total 100.0 | C 100.0 L 100.0 S 100.0 V 100.0 | ok
build-grid        flex               [94-100] total 100.0 | C 100.0 L 100.0 S 100.0 V 100.0 | ok
build-icon        data-img           [94-100] total 100.0 | C 100.0 L 100.0 S 100.0 V 100.0 | ok
build-text        b-tag              [94-100] total 100.0 | C 100.0 L 100.0 S 100.0 V 100.0 | ok
build-text        three-spans        [94-100] total 100.0 | C 100.0 L 100.0 S 100.0 V 100.0 | ok
build-units       rem                [94-100] total 100.0 | C 100.0 L 100.0 S 100.0 V 100.0 | ok
colour-contrast   pale-text          [50-68] total  95.0 | C 100.0 L 100.0 S  90.0 V  88.2 | LENIENT by 27.0
      - The heading 'Plan your week in five minutes' is light grey where the goal's is dark teal (0.4)
      - The text 'Brightleaf turns scattered tasks, mee...' is light grey where the goal's is grey (0.3)
colour-gradient   reversed           [86-95] total  99.0 | C 100.0 L 100.0 S  99.9 V  96.1 | LENIENT by 4.0
      - The background behind the heading 'Plan your week in five minutes' is a different shade of light green from the goal's (0.7)
      - The background behind the text 'Brightleaf turns scattered tasks, mee...' is a different shade of light green from the goal's (0.3)
colour-hue        hue-20             [80-92] total  98.2 | C 100.0 L 100.0 S  96.7 V  95.4 | LENIENT by 6.2
      - The dark teal section near the bottom is a different shade of dark teal from the goal's (0.3)
      - The green section near the top is teal where the goal's is green (0.1)
colour-theme      dark               [42-60] total  68.4 | C 100.0 L 100.0 S  49.1 V  14.4 | LENIENT by 8.4
      - The page background is dark where the goal's is light (9.3)
      - The green section near the top is dark green where the goal's is green (1.7)
colour-theme      greyscale          [55-72] total  88.7 | C 100.0 L  88.5 S  86.3 V  79.4 | LENIENT by 16.7
      - The dark teal section near the bottom is missing (4.2)
      - The button 'Choose Starter' is missing (1.3)
colour-tint       black-10           [82-93] total  88.6 | C 100.0 L  79.8 S  78.9 V  95.7 | ok
      - The box with 'Most popular' is missing (2.2)
      - The box with '“Brightleaf cut our Monday planning m...' is missing (2.1)
content-cards     missing-one        [75-87] total  97.4 | C  97.3 L  96.7 S  96.7 V  99.2 | LENIENT by 10.4
      - The text 'Spot overloaded teammates early with ...' is missing (1.5)
      - The box with 'Reports' is missing (0.4)
content-cards     swapped-two        [84-94] total  99.0 | C 100.0 L  97.1 S 100.0 V  99.5 | LENIENT by 5.0
      - 2 pieces of text sit about 370 pixels too far right (0.5)
      - 2 pieces of text sit about 370 pixels too far left (0.5)
content-cta       cta-learn-more     [75-88] total  99.4 | C  98.9 L  99.2 S  99.5 V  99.8 | LENIENT by 11.4
      - The button 'Start free trial' is missing (0.5)
      - Extra text the goal does not have: 'Learn more' (0.2)
content-form      missing-field      [78-90] total  99.1 | C  99.9 L  98.4 S  98.7 V  99.8 | LENIENT by 9.1
      - The white box near the bottom right is missing (0.5)
      - The text 'Company' is missing (0.3)
content-language  spanish            [30-48] total  51.6 | C  10.9 L  47.5 S  58.2 V  91.9 | LENIENT by 3.6
      - The text 'Brightleaf turns scattered tasks, mee...' is missing (2.1)
      - The heading 'Plan your week in five minutes' is missing (1.9)
content-logo      other-company      [68-82] total  99.4 | C  99.7 L  98.8 S  99.2 V  99.9 | LENIENT by 17.4
      - The heading 'Brightleaf' is missing (0.4)
      - Extra text the goal does not have: 'Greenfield' (0.2)
content-nav       four-links         [83-93] total  99.1 | C  99.7 L  98.3 S  98.8 V  99.8 | LENIENT by 6.1
      - The text 'FeaturesPricingCustomersBlogContact' is missing (0.7)
      - Extra text the goal does not have: 'FeaturesPricingCustomersContact' (0.2)
content-price     team-94            [75-88] total  99.8 | C  99.5 L 100.0 S 100.0 V  99.9 | LENIENT by 11.8
      - The text '$49/month' has different words from the goal's: missing '49'; has '94' where the goal does not (0.1)
content-typo      headline-typo      [78-90] total  99.9 | C  99.5 L 100.0 S 100.0 V  99.9 | LENIENT by 9.9
      - The heading 'Plan your week in five minutes' has different words from the goal's: missing 'minutes'; has 'mintues' where the goal does not (0.1)
layout-columns    hero-one-column    [62-78] total  72.8 | C 100.0 L  60.0 S  97.9 V  40.9 | ok
      - 46 things sit about 220 pixels too low (8.3)
      - 2 things sit about 220 pixels too low and about 680 pixels too far left (2.5)
layout-overlap    badge-30px         [88-96] total  99.9 | C 100.0 L  99.9 S 100.0 V  99.7 | LENIENT by 3.9
layout-overlap    chip-behind-image  [76-88] total  99.8 | C 100.0 L 100.0 S  99.9 V  99.2 | LENIENT by 11.8
      - The background behind the text '★ 4.9 from 2,000 teams' is dark green where the goal's is white (0.2)
layout-scale      zoom-90            [72-86] total  76.2 | C 100.0 L  76.7 S  98.9 V  33.8 | ok
      - The box with 'Name' sits about 550 pixels too high (2)
      - 2 things sit about 200 pixels too high (1.8)
layout-short      off-centre         [72-86] total  88.1 | C 100.0 L  80.3 S 100.0 V  76.0 | LENIENT by 2.1
      - The text 'Thanks — your order is on its way.' sits about 160 pixels too far right (11.9)
layout-sticky     sticky-header      [95-100] total 100.0 | C 100.0 L 100.0 S 100.0 V 100.0 | ok
layout-tall       diff-below-cut     [82-94] total 100.0 | C 100.0 L 100.0 S 100.0 V 100.0 | LENIENT by 6.0
layout-tall       diff-above-cut     [82-94] total  95.0 | C  91.4 L  94.1 S  96.0 V  99.0 | LENIENT by 1.0
      - The text 'This release improves sync speed for ...' is missing (3.2)
      - Extra text the goal does not have: 'We removed the old desktop widget, wh...' (1.7)
layout-width      no-max-width       [72-86] total  89.7 | C 100.0 L  90.1 S  99.9 V  70.7 | LENIENT by 3.7
      - 23 things sit about 80 pixels too far left (3)
      - 4 things sit about 80 pixels too far right (1.8)
layout-width      left-aligned       [65-80] total  94.7 | C 100.0 L  91.2 S  99.9 V  89.2 | LENIENT by 14.7
      - 21 things sit about 80 pixels too far left (2.6)
      - The green section near the top is slightly out of place (0.3)
less-chart        bars-differ        [88-96] total  99.9 | C 100.0 L 100.0 S 100.0 V  99.6 | LENIENT by 3.9
      - Something looks different near the middle of the page (0.1)
less-extras       cookie-banner      [85-95] total  96.7 | C  97.4 L  96.9 S 100.0 V  93.3 | LENIENT by 1.7
      - An extra dark blue box near the bottom that the goal does not have (1.7)
      - Extra text the goal does not have: 'We use cookies to improve your experi...' (1)
less-extras       back-to-top        [90-98] total  99.5 | C  99.2 L  99.4 S  99.7 V  99.9 | LENIENT by 1.5
      - The text 'PrivacyTerms' has different words from the goal's: has 'back', 'to', 'top' where the goal does not (0.4)
less-extras       extra-testimonial  [86-95] total  92.4 | C  96.5 L  93.4 S 100.0 V  81.3 | ok
      - 3 things sit about 100 pixels too low (2.9)
      - An extra white box near the bottom that the goal does not have (1.9)
less-picture      other-photo        [85-94] total  98.5 | C 100.0 L 100.0 S 100.0 V  93.8 | LENIENT by 4.5
      - Something looks different near the top right of the page (1.5)
less-table        rows-swapped       [88-96] total  99.9 | C 100.0 L  99.8 S 100.0 V  99.9 | LENIENT by 3.9
own-whole         unstyled           [22-42] total  44.1 | C  98.8 L  18.0 S  42.0 V  22.3 | LENIENT by 2.1
      - The green section near the top is missing (4.1)
      - The dark teal section near the bottom is missing (3.3)
own-whole         lorem              [30-48] total  45.2 | C   1.1 L  41.6 S  51.5 V  88.6 | ok
      - Extra text the goal does not have: 'Amet consectetur adipiscing elit sed ...' (2.9)
      - Extra text the goal does not have: 'Sit amet consectetur adipiscing elit ...' (2.2)
own-whole         no-pricing         [52-68] total  71.3 | C  90.3 L  58.0 S  74.8 V  65.3 | LENIENT by 3.3
      - 16 things sit about 420 pixels too high (5.3)
      - The box with 'Most popular' is missing (3)
own-whole         no-icons           [84-93] total  84.7 | C 100.0 L  81.9 S  96.4 V  63.5 | ok
      - 18 things sit about 110 pixels too high (4.7)
      - 3 boxes sit about 200 pixels too high (1.5)
small-font        helvetica          [94-100] total 100.0 | C 100.0 L 100.0 S 100.0 V 100.0 | ok
small-grey        body-grey          [94-100] total  99.9 | C 100.0 L 100.0 S  99.8 V 100.0 | ok
small-lineheight  lh-1-6             [85-95] total  95.5 | C 100.0 L  97.4 S 100.0 V  85.0 | LENIENT by 0.5
      - An extra white box near the bottom that the goal does not have (0.6)
      - An extra white box near the bottom right that the goal does not have (0.5)
small-narrow      narrower-20px      [91-98] total  98.9 | C 100.0 L  99.8 S 100.0 V  95.9 | LENIENT by 0.9
      - 3 things sit about 10 pixels too far left (0.4)
      - The heading 'Plan your week in five minutes' sits about 10 pixels too far right (0.1)
small-offset      down-6px           [92-99] total 100.0 | C 100.0 L 100.0 S 100.0 V 100.0 | LENIENT by 1.0
small-quotes      straight-quotes    [93-100] total 100.0 | C 100.0 L 100.0 S 100.0 V  99.9 | ok
RANK content-cards: swapped-two 99 > missing-one 97.4 ok
RANK own-whole: no-icons 84.7 > no-pricing 71.3 ok
RANK own-whole: no-pricing 71.3 > lorem 45.2 ok
RANK own-whole: no-pricing 71.3 > unstyled 44.1 ok
RANK layout-tall: above 95 ~ below 100 (gap 5.0)

21/52 inside band; self/determinism problems: 0
```

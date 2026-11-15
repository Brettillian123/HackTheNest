# Criteria sanity table (pages)

From `pages-bench.json` (the bench run after the last change; the total is unchanged by design, 57 of 114 in band).
Each value is 0 to 1; 1 is "as the goal"; – means the goal has nothing the criterion applies to.
Columns: cmp completeness, key key facts, wrd wording, str structure, ext nothing extra, plc placement and size,
spc spacing inside components, col colour, typ typography, shp corners/borders/shadows, pic pictures, lik likeness.

Page criteria are importance-weighted means over the goal's components, so one fault on a page with many
components moves its criterion only a little (e.g. one wrong price of 3 in one card of 12 components: keyFacts 0.95).
How much each criterion counts in the total is for the fitting step, not this table.

| set | attempt | band | total | cmp | key | wrd | str | ext | plc | spc | col | typ | shp | pic | lik | do the numbers say what is wrong? |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| advanced | dashboard/wrong-data | 70–82 | 44.6 | 1.00 | 0.81 | 0.91 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | Yes: only key facts (stat figures) and wording (names) move; it looks exactly right. |
| advanced | dashboard/missing-section | 55–70 | 79.5 | 0.95 | 1.00 | 1.00 | 1.00 | 1.00 | 0.98 | 1.00 | 1.00 | 1.00 | 1.00 | – | 0.45 | Mostly: completeness names the missing chart; placement 0.98 is a leak (the full-height sidebar got shorter with the page). |
| advanced | dashboard/rearranged | 60–74 | 81.3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0.74 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0.27 | Yes: "the sidebar is on the right; the goal has it on the left" lands in placement only. |
| advanced | dashboard/restyled | 68–80 | 82.4 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0.50 | 0.85 | 0.56 | 0.89 | Mostly: serif typeface, square corners and recoloured chart are found; the changed accent colour (red buttons) barely moves colour (weak, see below). |
| advanced | article/lorem | 35–52 | 41.4 | 1.00 | 1.00 | 0.69 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0.95 | Yes: body text replaced, headings kept: wording only. |
| advanced | checkout/rebuild-vague | 28–45 | 29 | 0.61 | 0.22 | 0.53 | 0.75 | 0.00 | 0.83 | 0.64 | 0.68 | 0.89 | 0.76 | – | 0.13 | Yes: a different page built from a vague prompt; everything is low, extras and key facts most. |
| edge | build-border/inset-shadow | 93–100 | 99 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | Yes: same look built with inset shadows; fixed (border drawn as a shadow was charged to shape until the edge pixels were compared). |
| edge | content-price/team-94 | 75–88 | 94.3 | 1.00 | 0.95 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | Yes: one wrong price, key facts only; note names the Team card, $94 against $49. |
| edge | content-cards/missing-one | 75–87 | 89.9 | 0.95 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | Yes: completeness only ("the 'Reports' card is missing"); the cards that closed the gap are not charged. |
| edge | layout-columns/hero-one-column | 62–78 | 84.7 | 1.00 | 1.00 | 1.00 | 0.97 | 1.00 | 0.96 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0.37 | Mostly: structure says the hero's parts are stacked; placement also drops because the hero got taller as a result (one cause, two criteria). |
| edge | layout-width/left-aligned | 65–80 | 81 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0.83 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0.68 | Yes: lost centring is placement only, nothing inside components. |
| edge | less-extras/cookie-banner | 85–95 | 88.2 | 1.00 | 1.00 | 1.00 | 1.00 | 0.56 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0.95 | Yes: nothing extra only. |
| edge | colour-contrast/pale-text | 50–68 | 48.3 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0.54 | 1.00 | 1.00 | 1.00 | 0.90 | Yes: unreadable pale text is colour (readability) only. |
| edge | own-whole/unstyled | 22–42 | 37.1 | 0.86 | 1.00 | 0.98 | 0.91 | 0.72 | 0.71 | 0.87 | 0.63 | 0.32 | 0.17 | 1.00 | 0.23 | Yes: browser defaults: typeface, colours, borders, layout all off, words right. |
| review | invoice/i_numbers_wrong | 55–70 | 64.4 | 1.00 | 0.91 | 1.00 | 1.00 | 1.00 | 1.00 | 0.99 | 1.00 | 1.00 | 1.00 | – | 1.00 | Yes: wrong totals are key facts; fixed a false structure note (wider numbers nudged cells; order flips now need 8 px). |
| review | invoice/i_cols_swapped | 80–92 | 95.5 | 1.00 | 1.00 | 1.00 | 0.91 | 1.00 | 1.00 | 0.89 | 1.00 | 1.00 | 1.00 | – | 0.99 | Partly: structure finds the swapped columns, but spacing also charges the moved cells (double count). |
| review | menu/m_course_order | 64–78 | 79 | 1.00 | 1.00 | 1.00 | 0.85 | 1.00 | 0.73 | 0.96 | 1.00 | 1.00 | 1.00 | – | 0.86 | Partly: courses in another order show in structure, but mostly in placement (lists "820 px too low"); repeated prices pair across courses and add structure noise. |
| review | product/p_mirrored | 72–86 | 82.5 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0.90 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0.66 | Yes: picture and text swapped sides: placement only. |
| review | signup/s_no_password | 60–76 | 89.4 | 0.95 | 1.00 | 1.00 | 1.00 | 1.00 | 0.98 | 1.00 | 1.00 | 1.00 | 1.00 | – | 0.75 | Mostly: completeness names the missing password field; placement 0.98 is a leak from what moved up into its space. |
| review | product/p_wrong_product | 55–70 | 77.5 | 1.00 | 0.96 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | 0.18 | 0.93 | Yes: another product's photo (pictures) and price (key facts). |

## Measured well
completeness, keyFacts, wording, noExtras, colour (readability and page-wide changes), typography, shape, pictures,
likeness; placement for whole components that moved, lost centring or swapped sides.

## Weak
- structure versus placement/spacing: reordered sections (m_course_order) and swapped columns (i_cols_swapped) are
  charged in both. Reordering is detected, but what moved because of it is only partly exempted.
- Leaks into placement: a component that shrinks or moves because something inside or above it is missing
  (dashboard sidebar, s_no_password) still loses a little placement.
- colour is a mean over every block, so a changed accent (a few buttons) moves it very little on a large page.
- The matching underneath sometimes pairs repeated texts (the same price in two courses, the same icon in two
  cards) across components; that shows as spacing or structure noise.

## Fixed while making this table
- A border drawn as an inset shadow counted as a shape fault: border and shadow changes are now ignored when the
  pixels along the box's edges look the same.
- A border that only showed more or less because colours around it changed (dark theme) counted as shape: now colour.
- Spacing charged pieces of a component that was drawn wider or zoomed: pieces are now judged against the box held
  at either end or stretched.
- Placement charged cards whose icons were missing (they got shorter): size may now differ by what is missing or extra inside.
- One piece paired far away dragged its whole component: a component's move is now the middle move of its pieces.
- The same slip in several look-alike components (six cards) is one note, and a palette change in most components is one note.

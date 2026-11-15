# Typography research for promptdyno

**Summary.** Well-regarded interfaces use few families (one text face, one mono), few weights (two or three) and a short scale. Hierarchy comes mostly from weight and colour, not from many sizes. The sources do not say how many sizes may appear on one screen, so the budget below is my own inference from the scales I found. The rejected templates broke every one of these habits: roughly ten sizes, mono on labels, three weights, many grey captions. No source shows that a "distinctive" free font makes a product look designed. Quiet faces with careful use win. **Recommendation: setup (e), IBM Plex Sans for text plus IBM Plex Mono for the prompt, code and score only, at six sizes site-wide and at most four on any one screen.**

## What real products do

| Source | What it states or shows | How I got it |
|---|---|---|
| Tailwind defaults | 13 sizes: 12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72, 96, 128 px, each with a paired line height | Fetched docs page. https://tailwindcss.com/docs/font-size |
| GitHub Primer | Tokens in rem, unitless line heights on a 4px grid, weights via CSS variables, lines about 80 characters or fewer, do not rely on colour alone for emphasis. A draft page lists 12, 14, 16, 20, 24, 32, 40, 48 (64 for marketing); that list is from a preview URL, so provisional | Fetched https://primer.style/foundations/typography; scale from a search snippet of a draft page |
| IBM Carbon | Plex Sans, Serif, Mono. Scale has 17 sizes from 12 to 92 px. Digital weights: 300, 400, 600. Productive set (tools) has fixed heading sizes; expressive set (marketing) has responsive headings | Fetched https://carbondesignsystem.com/elements/typography/overview/ |
| Linear | Inter for body, Inter Display for headings; redesign aimed to "reduce visual noise" | Fetched https://linear.app/now/how-we-redesigned-the-linear-ui |
| Stripe (live CSS) | Font family `sohne-var` (commercial, not free). One marketing stylesheet showed weights 300, 400, 500, 600 | I fetched stripe.com CSS and counted. Partial sample only |
| Vercel (live CSS) | Geist Sans and Geist Mono. Marketing CSS declares 12, 13, 14, 16, 18, 20, 24, 32, 36, 40, 48, 56, 64, 72 px (14 sizes across the whole site, not one screen). Weights 400, 450, 550, 600, 700 | I fetched vercel.com CSS and counted. Declarations, not screens |
| Butterick | Web body text about 15 to 25 px; shrink line spacing and line length when size shrinks; all caps only for short labels, always letterspaced; system fonts are overused | https://practicaltypography.com/point-size.html, /all-caps.html, /system-fonts.html |
| Refactoring UI | Hierarchy from size, weight and colour together; two weights (about 400/500 and 600/700); de-emphasise with lighter colour, not lighter weight | Only via third-party summaries, so unconfirmed against the book. https://rjseymour66.github.io/webdev/refactoring-ui/ |
| Apple HIG | Text styles from 11 to 34 pt, one system font, few weights | Page would not load. From memory, unconfirmed |
| Material 3, Polaris, Radix | Not retrieved. Unconfirmed | Fetch failed or redirected |
| Splunk style guide | Avoid monospace, bold or italics in labels, buttons, tooltips, errors | https://help.splunk.com/splunk-style-guide/ui-text-guidelines/formatting-text-in-the-ui |

Read together: a tool UI has about 6 to 8 sizes in its whole system (Primer's draft 8 plus marketing, Tailwind's first 8 cover 12 to 36). Big systems with 13 to 17 sizes are catalogues. Nobody states a per-screen limit.

## Principles

**T1. Use a short fixed scale, and use few steps per screen.** Sizes come from a list, never ad hoc. Source: Tailwind, Primer, Carbon above. Confidence: sourced for the scales; the "few per screen" part is my own inference.

**T2. Hierarchy from weight and colour before size.** Size alone makes primary text too big and secondary text too small. Source: Refactoring UI summaries (https://rjseymour66.github.io/webdev/refactoring-ui/); Primer says not to lean on colour alone. Confidence: widely repeated opinion.

**T3. Two weights in the UI, one more at most for display.** Carbon recommends 300, 400, 600; Refactoring UI summaries say two. Source: Carbon page above. Confidence: sourced (Carbon), widely repeated opinion (two).

**T4. De-emphasise with lighter colour, not lighter weight or tiny size.** Light weights hurt legibility at small sizes. Source: Refactoring UI summary above; Primer utility docs on light weights. Confidence: widely repeated opinion.

**T5. One consistent line height rule.** Unitless, tied to size, on a 4px grid. Source: Primer (https://primer.style/foundations/typography). Confidence: sourced.

**T6. Body text near 16 px; below 12 px is a smell.** Butterick says 15 to 25 px for web body; Tailwind's smallest step is 12. Source: https://practicaltypography.com/point-size.html. Confidence: sourced for body; 12 px floor is my own inference.

**T7. All caps only for very short labels, with letterspacing.** Butterick says caps suit short labels and need letterspacing. Source: https://practicaltypography.com/all-caps.html. Confidence: sourced. That a page full of tiny caps labels looks generated is my own inference.

**T8. Restrain muted captions.** Grey small text everywhere reads as noise. Linear states the aim to cut visual noise and made text darker for contrast. Source: https://linear.app/now/how-we-redesigned-the-linear-ui. Confidence: sourced for Linear; the caption count limit is my own inference.

**T9. Use real tabular figures for numbers.** `font-variant-numeric: tabular-nums` aligns columns and is widely available since 2022. A proportional face with tabular figures beats a mixed-font workaround. Source: https://caniuse.com/mdn-css_properties_font-variant-numeric_tabular-nums; Bitcoin Core GUI thread https://mirror.b10c.me/bitcoin-core-gui/267/. Confidence: sourced (support), widely repeated opinion (preference).

**T10. Monospace for code, prompts and aligned data only, not labels.** Splunk says avoid it in labels and buttons. One foundry guide (Tokotype) argues for mono on metadata; I could not read its text, so that dissent is only from a search summary. Mono also looks denser and heavier than proportional type. Source: Splunk URL above. Confidence: widely repeated opinion, with a dissent.

**T11. One text family plus one mono is the norm.** Carbon (Plex trio), Vercel (Geist pair), Linear (Inter plus its display cut). Heading and body cuts of the same family count as one voice. Confidence: sourced.

**T12. Identity comes from colour, spacing and copy more than from the font.** Linear, Vercel and GitHub use quiet or system-like faces. This is my own inference from the examples; I found no study. Stripe's face is a paid font, which shows the other side: some brands do buy character.

## Five type setups

Licences confirmed on the Fontsource API (OFL-1.1) unless stated. Tabular figures: I did not verify glyph features for any face; test each with `font-variant-numeric: tabular-nums` before choosing. All are unconfirmed on that point.

| | Families | Licence | Feels like | Used by | Risk |
|---|---|---|---|---|---|
| (a) System only | `system-ui` for text, `ui-monospace` for code | Free, no download | Native, fast, anonymous | GitHub uses system fonts per a search summary, unconfirmed | Looks different on each OS; Butterick calls system fonts overused; Windows mono is Consolas |
| (b) Quiet grotesque | Public Sans, plus Plex Mono or system mono | OFL-1.1 | Plain, neutral, civic | Not confirmed | Can look bland on a red and black page; tnum unconfirmed |
| (c) More character | Archivo (has a width axis, variable), plus JetBrains Mono for code | OFL-1.1 both | Sturdy, slightly condensed grotesque, sporty | Not confirmed | Character can drift into the "tech vibe" tell if overused; tnum unconfirmed |
| (d) Serif headings, sans UI | Source Serif 4 for landing headings only, Hanken Grotesk for UI, mono for code | OFL-1.1 all | Editorial, calm, human | Not confirmed | Three families; serif fights a hacker mood; keep serif off the tool screens |
| (e) My pick | IBM Plex Sans (text and headings) plus IBM Plex Mono (code, prompt, score) | OFL-1.1 | Engineered, a little humane, reads as one system | Carbon (IBM), confirmed above | Plex is known, so identity must come from colour; Plex Mono is static, not variable on Fontsource; tnum unconfirmed |

Why (e): one superfamily means sizes and weights match, Carbon proves it works in a tool UI, and it avoids the faces the team flagged.

## Type budget

- Families: 2 (Plex Sans, Plex Mono). Nothing else loads.
- Scale, total six sizes only: **12, 14, 16, 20, 28, 48 px.** 48 is landing hero only.
- Per screen: at most **4 distinct sizes** inside the tool, at most 5 on the landing page.
- Weights: **400 and 600** only. No 300, 500 or 700.
- Line heights: 1.5 for 14 and 16 px body; 1.4 for 12 px; 1.25 for 20 and 28; 1.1 for 48. All results land on 4px multiples or close; round to the grid.
- Hierarchy order: change colour or weight first, size last.
- Colours for text: 2 only (main, muted). No third grey.
- Muted captions: at most **3 elements per screen**. Everything else uses main colour.
- Mono allowed: prompt box, code, the score number and point-cost values, rank numbers. Never labels, tags, table headers, nav, buttons.
- All caps: at most 1 element per screen, 12 px, letterspaced 0.06em. Prefer none.
- Numbers in tables and the leaderboard: `font-variant-numeric: tabular-nums` always.
- Tool screens: headings 20 px (page) and 16 px 600 (panel). No heading above 28 px.
- Landing: hero 48 px 600, section headings 28 px, body 16 px. No fluid sizes beyond the hero.
- Minimum size 12 px. Body 14 px in the tool, 16 px on text pages.

Counting rule an agent can check: list every distinct font-size in the built CSS. More than six, or more than four on one screen, fails.

## What was wrong with the rejected templates

- Eight to ten sizes (11 to 64 px) where six would do (inference from the budget).
- Mono on labels, tags, captions and headers, which Splunk-style guidance advises against (T10).
- Three weights and many tiny grey captions, so no clear first, second and third read (T2, T3, T8).
- Faces on the "AI tell" list, so no identity came from the type (T12).

## Not confirmed

Apple HIG, Material 3, Polaris, Radix pages did not load. Refactoring UI only via summaries. Tabular figures for every candidate font. Who else uses the candidate faces. Per-screen size counts for live sites (I counted CSS declarations, not screens).

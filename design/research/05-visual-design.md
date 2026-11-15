# Visual design research: colour, fonts, UI elements

Research pass, 2026-11-14. About 25 tool calls. Colour values are my own proposals. Contrast ratios were calculated by me (WCAG relative luminance formula) for the proposed hex values, not taken from a source.

## Summary

Well-regarded product sites keep the palette small: one neutral scale, one accent, and a few state colours, and they build surfaces from slightly different neutral steps rather than shadows. Our workspace shows two foreign web pages, so the site chrome should be quiet and nearly colourless, and the accent should be rare. A dark-first, monochrome-accent design makes the previewed pages the loudest thing on screen. Fonts: any OFL grotesque plus JetBrains Mono works; all four pairings below have a confirmed OFL or Apache licence except where marked. Dense tables need tabular numbers and right-aligned scores. **Recommended combination: colourway B "Graphite Mono" (dark default, light available), pairing 1 (Hanken Grotesk + JetBrains Mono), 14px base UI text, 4 px grid, 6 px radius.**

## Colour principles

**D1. Use a small token set.** Linear says it cut theme generation from 98 variables to three: base colour, accent, and contrast. Source: https://linear.app/now/how-we-redesigned-the-linear-ui . Confidence: sourced. Take-away: define about 10 tokens, derive the rest.

**D2. Use a perceptual colour space.** Linear moved theme generation to LCH because it tracks human perception, which helps separate surface levels. shadcn now writes tokens in OKLCH. Sources: Linear post above; https://ui.shadcn.com/docs/theming . Confidence: sourced.

**D3. shadcn theming in Tailwind v4.** Tokens live in `:root` and `.dark`, are exposed with `@theme inline`, and come in pairs (`--card` and `--card-foreground`). One `--radius` variable drives the whole radius scale. Source: shadcn theming page above. Confidence: sourced. Cost: S. Our hex values can be converted to OKLCH at build time; I did not convert them.

**D4. Neutral choice.** Linear reportedly limited blue in its neutrals for a more neutral look (secondary coverage only, unconfirmed from the primary post). My inference: a barely warm or barely cool tint reads as designed; pure grey reads as default. Confidence: my own inference.

**D5. Fixed role per step.** Vercel Geist assigns each step in a 10-step scale a job: 100 to 300 backgrounds (default, hover, active), 400 to 600 borders, 700 to 800 solid fills, 900 to 1000 text. Solid grey for borders, alpha only where the edge must blend. Source: https://vercel.com/geist/colors . Confidence: sourced. Copy the idea, not the Geist name or font.

**D6. WCAG 2.2 AA numbers.** Normal text 4.5:1, large text 3:1, UI component edges and meaningful graphics 3:1, pointer targets at least 24 by 24 CSS px. Sources: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html , https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html , https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html . Confidence: sourced. Note: decorative card or row borders may be faint (the tables below show 1.2 to 1.4), but input borders and focus rings must reach 3:1. APCA: not researched, unconfirmed.

**D7. Dark theme practice.** Not pure black; two or three surface steps lighter than the page; lighter, slightly less saturated state colours than in light mode so they still reach contrast. Confidence: widely repeated opinion (not tied to one source in this pass). My dark palettes follow it.

**D8. State colours need a second signal.** Pass, fail and warning must also carry an icon or word, because red and green are hard to tell apart for some users. Confidence: widely repeated opinion. Apply to the score feedback list.

**D9. Keep the accent away from the state colours.** The accent should not be near green, red or amber hues, or a player cannot tell "primary button" from "pass". Colourways B and C do this; A and D have a stated risk. Confidence: my own inference.

**D10. Isolate the previews.** Give the iframes a plain 1 px border and an even neutral gutter, no tinted frame, so a goal page with a cream background is not mistaken for our surface. Confidence: my own inference.

## Four colourways (all proposals)

Ratios are text on background unless noted; "state" is the lowest of pass, fail, warning on the surface.

### A. Paper and Vermilion (warm, editorial)
Idea: cream paper, ink text, one orange-red accent. Feels like a printed puzzle book. Similar feel (my impression, unconfirmed): Stripe docs, Substack-style reading sites. Risk: vermilion is near the fail red, so never use the accent for status; keep fail a deeper crimson and always pair with an icon.

| Token | Light | Dark |
|---|---|---|
| Background | #FAF8F5 | #171513 |
| Surface | #FFFFFF | #1F1D1A |
| Border | #E4DFD8 | #34302B |
| Text | #1C1917 (16.5) | #F2EFEA (15.9) |
| Muted text | #5F5A54 (6.4) | #A39D94 (6.8) |
| Accent | #C2410C (4.9) | #FB7C3C (7.0) |
| Pass | #15803D | #5BC88A |
| Fail | #B91C1C | #F87171 |
| Warning | #A16207 | #E0B040 |

State ratios: lowest 4.9 light, 6.1 dark.

### B. Graphite Mono (neutral, monochrome accent) - recommended
Idea: near-black and near-white, the accent is simply the text colour inverted (white primary button in dark, black in light). All colour belongs to the previews and to states. Similar feel: Vercel, Linear, Raycast dark themes (my impression, unconfirmed).

| Token | Light | Dark |
|---|---|---|
| Background | #FFFFFF | #0E0F11 |
| Surface | #F7F7F8 | #16181B |
| Border | #E3E4E6 | #2A2D31 |
| Text | #111214 (18.7) | #ECEDEE (16.4) |
| Muted text | #5B6068 (6.3) | #9BA0A6 (7.3) |
| Accent | #111214 | #ECEDEE |
| Pass | #1A7F4B | #4CC38A |
| Fail | #C4302B | #F0675F |
| Warning | #9A6200 | #E5A23B |

State ratios: lowest 4.7 light, 5.8 dark.

### C. Signal Blue (conventional, friendly)
Idea: one plain mid blue (no gradient, no cyan) on cool greys. The safest, most familiar choice for developers. Similar feel: GitHub, Linear-like tools (my impression, unconfirmed). Risk: the most common SaaS look, so least distinctive.

| Token | Light | Dark |
|---|---|---|
| Background | #FBFBFC | #111418 |
| Surface | #FFFFFF | #181C21 |
| Border | #E1E4E8 | #2B3139 |
| Text | #14171C (17.4) | #E8EAED (15.3) |
| Muted text | #5A616B (6.0) | #98A0AB (7.0) |
| Accent | #1F5FBF (5.9) | #5B9BE8 (6.4) |
| Pass | #1B7F3B | #52C27A |
| Fail | #C0332B | #EF6B63 |
| Warning | #9A6700 | #E3A83A |

State ratios: lowest 4.9 light, 5.7 dark.

### D. Moss and Citron (dark, green-tinted, terminal feel)
Idea: very dark olive-tinted neutrals and a citron highlight accent. Feels like a coding tool, with a nod to terminals. Similar feel: Monkeytype-style themed typing sites (unconfirmed). Risk: citron is near pass green; keep pass a cooler, deeper green and use the accent only on the primary button.

| Token | Light | Dark |
|---|---|---|
| Background | #F7F7F2 | #12150F |
| Surface | #FFFFFF | #191D15 |
| Border | #DEDFD3 | #2C3226 |
| Text | #1A1D14 (15.9) | #EEF0E8 (16.0) |
| Muted text | #5B604F (6.0) | #A0A692 (7.3) |
| Accent | #3F5D00 (7.0) | #C8E04A (12.5) |
| Pass | #1A7F45 | #3FB871 |
| Fail | #C2352B | #EF6B5F |
| Warning | #9A5B00 | #F0A03C |

State ratios: lowest 5.0 light, 5.7 dark.

**Theme pick:** dark by default, with a light toggle. Reason (my inference): the audience is developers who mostly use dark editors, and a dark chrome makes bright goal and output previews stand out. Counter-point: most goal pages are light, so on a dark chrome they look like glowing rectangles; the light theme lessens that. Ship both from the same tokens, since the cost is low.

## Font principles

**D11. One variable text face plus one mono.** Fewer files, faster load, and variable weights give the 400, 500, 600 steps from one file. Confidence: widely repeated opinion. Cost: S. Self-host through Fontsource (`@fontsource-variable/...`), which I used to confirm licences.

**D12. Type scale.** Base 14 px for dense UI (workspace, tables), 16 px for landing page and long text. Ratio about 1.2 (12, 14, 16, 19, 23, 28, 34). Line height 1.5 for body, 1.2 to 1.3 for headings. Line length 60 to 75 characters for prose. Weights: 400 body, 500 labels and buttons, 600 headings; avoid 700+. Confidence: widely repeated opinion plus my inference. Not tied to one source.

**D13. Tabular numbers.** Turn on `font-variant-numeric: tabular-nums` for scores, ranks and times, so digits line up in columns. Primer says the same: right-align numbers and use tabular numerals. Source: https://primer.style/product/components/data-table/guidelines . Confidence: sourced. Check that the chosen face has a `tnum` feature (unconfirmed for each pairing). A monospace for scores sidesteps this.

**D14. Letter spacing.** Default for body; slightly negative (-0.01 to -0.02em) on headings above 28 px; slightly positive (0.04em) on small uppercase labels, if any. Confidence: widely repeated opinion.

**D15. Mono for prompts and code only.** Use a slightly smaller size (13 px) than the text face so x-heights look matched. Confidence: my own inference.

## Four pairings

| # | Text face | Mono | Feeling | Licence and source |
|---|---|---|---|---|
| 1 | Hanken Grotesk (variable, wght 100 to 900; designer Alfredo Marco Pradil) | JetBrains Mono (variable, wght 100 to 800) | Neutral, clean, slightly warm; reads well small | Both OFL-1.1, confirmed on Fontsource about pages. Get from fontsource.org or Google Fonts. |
| 2 | Schibsted Grotesk (variable, wght 400 to 900; Bakken & Baeck and Henrik Kongsvoll) | JetBrains Mono | A bit more character, editorial, sturdy at heavy weights | Both OFL-1.1, confirmed on Fontsource. Weight starts at 400, so no light weights. |
| 3 | DM Sans (variable, opsz 9 to 40, wght 100 to 1000) | Roboto Mono (variable build exists on Fontsource) | Geometric, friendly, softer; optical size helps small text | DM Sans OFL-1.1 confirmed. Roboto Mono Apache 2.0 per search results only, unconfirmed on the foundry page. |
| 4 | IBM Plex Sans (variable: wght 100 to 700, wdth 75 to 100) | IBM Plex Mono | Technical, serious, engineered | Plex Sans OFL-1.1 confirmed on Fontsource. Plex Mono licence and variable form not checked; unconfirmed. |

Notes: I did not confirm which of these sites use these faces. Geist, Geist Mono, Inter, Space Grotesk and Instrument Serif were skipped under your rules (Geist Mono is OFL per vercel/geist-font, but the family is on the over-used list). Plex Sans is popular in developer tools, so check it does not read as "IBM". Optional.

## UI elements

**D16. Spacing scale.** **Element:** spacing. **Rule:** pick a scale in advance (4, 8, 12, 16, 24, 32, 48, 64 px); group related items with space before adding divider lines. **Which screen:** all, especially the workspace sidebar.
Source: https://refactoringui.com/ (via secondary summaries). Confidence: widely repeated opinion. Cost: S.

**D17. Borders vs shadows.** **Element:** surface separation. **Rule:** use shadows for depth, borders for structure; for us, a 1 px low-contrast border and a surface step, no shadow, except menus and dialogs. **Which screen:** workspace panes, challenge list. Source: Refactoring UI summaries (https://sglavoie-github-io.pages.dev/posts/2023/09/09/book-summary-refactoring-ui/). Confidence: widely repeated opinion. Cost: S.

**D18. One primary action.** **Element:** buttons. **Rule:** one primary button per view ("Run" in the workspace, "Start" on a challenge card); secondary is outlined; tertiary is text-only. Hierarchy matters more than semantics, and a muted style suits routine destructive actions. **Which screen:** workspace, login. Source: Refactoring UI Medium excerpt (https://medium.com/refactoring-ui/7-practical-tips-for-cheating-at-design-40c736799886). Confidence: widely repeated opinion. Cost: S.

**D19. Corner radius.** **Element:** radius. **Rule:** one value, 6 px, set once as `--radius` in shadcn; pills only for badges if at all. **Which screen:** all. Source: shadcn theming page. Confidence: sourced for the mechanism, my own inference for 6 px. Cost: S.

**D20. Tables and leaderboard.** **Element:** data table. **Rule:** right-align numbers with tabular numerals; minimal columns; short headers; one data type per column; sortable headers; sort by a sensible default; blank cells stay blank; about 20 rows per page; skeleton rows while loading; an empty state message when there is no data. Row height 36 to 40 px dense (my inference); no zebra striping unless rows are long (zebra: no source found, unconfirmed). Highlight the player's own row with the surface step. **Which screen:** leaderboard. Source: https://primer.style/product/components/data-table/guidelines . Confidence: sourced for all but row height and zebra. Cost: M.

**D21. Score display.** **Element:** score and progress. **Rule:** show the score as one large mono number with "/ 100" in muted text; show points lost as a list of rows, each with a signed number in the fail colour and a plain sentence. Use a plain bar for progress, no animated rings. **Which screen:** workspace score panel, profile. Source: none; Confidence: my own inference. Cost: M.

**D22. Badges.** **Element:** prompt-count bucket (1, 2, 3-5, 6-10, 11+). **Rule:** neutral outlined badge, not coloured, since colour is reserved for states. **Which screen:** leaderboard, profile. Confidence: my own inference (follows your colour rule). Cost: S.

**D23. Focus rings.** **Element:** focus. **Rule:** a 2 px ring with 2 px offset, at least 3:1 against the adjacent colour, shown on keyboard focus only. **Which screen:** all, especially the prompt box. Source: https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html (3:1 rule). Confidence: sourced for 3:1; my inference for sizes. Cost: S.

**D24. Targets and icon sizing.** **Element:** icons and buttons. **Rule:** one icon set at 1.5 px stroke, 16 px icons in dense rows, 20 px elsewhere; click targets at least 24 by 24 px (32 px for buttons). **Which screen:** all. Source: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html . Confidence: sourced for 24 px; my inference for stroke and sizes. Cost: S.

**D25. Form fields.** **Element:** prompt box, model picker. **Rule:** visible label above, input border at 3:1 against the background, mono font in the prompt box, character or token count in muted text beneath. **Which screen:** workspace. Confidence: my own inference plus WCAG 3:1. Cost: S.

**D26. Split-pane workspace.** **Element:** layout. **Rule:** goal and output side by side at equal width, prompt box and score below or in a side column; draggable divider with a visible 1 px line; labels "Goal" and "Your output" above each frame; each frame has a plain neutral gutter (see D10). **Which screen:** workspace. Source: not found in this pass (code-playground layouts are widely used). Confidence: my own inference. Cost: M.

**D27. Tabs and empty states.** **Element:** tabs on the leaderboard (prompt-count buckets) and empty profile. **Rule:** tabs as underlined text, one active at a time; empty states give one sentence and one action. Primer says to show a blankslate when a table has no data. Source: Primer link above. Confidence: sourced for empty states; my inference for tabs. Cost: S.

**D28. Motion.** **Element:** transitions. **Rule:** only after a user action, 100 to 300 ms ease-out (already your rule). **Which screen:** score reveal after "Run". Confidence: your own decision. Cost: S.

Not researched in this pass: Nielsen Norman, Laws of UX, Baymard, Apple HIG and Material specifics. A search for the NN/g data tables article returned no alignment or zebra guidance, so those points are unconfirmed.

## What comparable sites do

Only what I could confirm.

- **Linear:** theme built on LCH from three inputs (base, accent, contrast); Inter Display for headings and Inter for the rest. Source: https://linear.app/now/how-we-redesigned-the-linear-ui . Note: Inter is on your banned list, so copy the method, not the font.
- **Vercel (Geist system):** 10-step colour scales with fixed roles; solid grey borders; translucent shadows to avoid halos; Geist Mono is OFL and published at github.com/vercel/geist-font. Source: https://vercel.com/geist/colors .
- **GitHub Primer:** table guidance (right-align numbers, tabular numerals, about 20 rows per page, blankslate). Source above.
- **Advent of Code:** has a high-contrast alternate stylesheet, and asks other sites not to copy its look. Source: https://adventofcode.com/2025/about . Do not mimic it. Its palette and font: unconfirmed.
- **Monkeytype:** large library of colour themes; default font and values unconfirmed (the theme file URL I tried returned 404).
- **CSSBattle, Frontend Mentor, LeetCode, Raycast, Stripe docs, Railway, Val Town, Excalidraw:** not confirmed from a source in this pass. Open each site and read the CSS if Brett wants specifics.

# AI tells, second pass (finer grain)

**Summary.** The first pass covered the big visual bundle. This pass finds smaller, countable signals. The best sources are open-source "slop scanners" and ban lists, which turn tells into checks. Their themes: uniform spacing and radius, one hover effect everywhere, nested cards, stat-card rows, only the happy path built, generic CTA labels, stock section order, and code that bypasses design tokens. Most sources are blogs and tool authors, so treat them as heuristics. I found no solid source for several app-UI ideas (sidebars, command palettes, toasts as tells) and marked those as my own inference. To save words, sources use keys:
PS = https://cdn.jsdelivr.net/npm/pixelslop@0.3.8/dist/skill/resources/ai-slop-patterns.md
BL = https://github.com/Laith0003/ux-skill/wiki/Anti-AI-slop-ban-list
HM = https://instagit.com/Nutlope/hallmark/common-tells-of-ai-slop-hallmark/
KC = https://world.hey.com/kostac/spot-the-slop-a-ui-designer-s-guide-to-fixing-ai-defaults-4c448c9c
CM = https://codemyspec.com/blog/vibe-coded-websites-look-the-same
EM = https://evilmartians.com/chronicles/we-studied-100-devtool-landing-pages-here-is-what-actually-works-in-2025
HN = https://zeli.app/story/49867038 (Hacker News thread, mirrored)

## 1. Fine-grained visual details

**A17. Signal:** One spacing value everywhere (every card `p-6`, every gap `gap-8`, every section `py-20`). **Do instead:** Use a short spacing scale with roles: tight inside controls, medium between related items, large between sections. Vary section padding by weight. Source: PS (uniform spacing), BL, KC. Confidence: sourced. Cost: S

**A18. Signal:** One radius on everything (`rounded-xl`/`rounded-2xl` on cards, buttons, inputs, images). **Do instead:** Two radii at most, set by role (inputs and buttons small, panels one step larger). Set `--radius` once in the theme. Source: BL, CM. Confidence: sourced. Cost: S

**A19. Signal:** Rounded box plus `shadow-md`/`shadow-lg` plus `border` on the same element. **Do instead:** Pick border or shadow, not both. Prefer border only, no shadow. Source: PS (rounded shadow boxes), CM. Confidence: sourced. Cost: S

**A20. Signal:** A card inside a card, or a bordered panel inside a bordered panel. **Do instead:** Inside a panel, separate with a divider line or spacing, never a second box. Source: PS, HM. Confidence: sourced. Cost: S

**A21. Signal:** Icon in a tinted rounded square or circle above each heading (`size-10 rounded-lg bg-primary/10`). **Do instead:** No icon tiles. If an icon helps scanning, put it inline beside the label, untinted. Source: PS (icon-above-heading), HM. Confidence: sourced. Cost: S

**A22. Signal:** Same hover on every card or image (`hover:scale-105`, `hover:-translate-y-1 hover:shadow-xl`) and `transition-all` as the default. **Do instead:** Hover only on things that are clickable, and change one property (`transition-colors`). No lift or zoom. Source: PS (uniform hover-zoom, S8). Confidence: sourced. Cost: S

**A23. Signal:** Sparkle, wand, rocket, zap or bot icons on buttons and headings. **Do instead:** Name the real action ("Score it") and use no decorative icon. Source: BL (emoji sparkles, rocket in headings); the icon-library angle is my own inference. Confidence: my own inference (partly sourced). Cost: S

**A24. Signal:** Blurred colour blobs, aurora glow, dot or grid background patterns behind the hero. **Do instead:** Flat background. If a texture is wanted, use something the product owns (for example, the score ledger lines). Source: HM (aurora blobs), BL (floating shapes). Confidence: sourced. Cost: S

**A25. Signal:** Bento grid of mixed-size cards with a tiny illustration in each. **Do instead:** Use bento only if each cell holds a real product view. Otherwise one large screenshot plus text. Source: BL names bento as the cure for cards, so it is itself becoming a default. Evidence for "bento as tell" is thin. Confidence: my own inference. Cost: M

**A26. Signal:** Logo marquee strip of fake or unrelated brands, and a dashboard mockup with a fake chart. **Do instead:** No logo strip. The hero shows the real workspace. Source: HM (fake browser or IDE chrome instead of real screenshots), PS (decorative sparklines). Confidence: sourced. Cost: S

**A27. Signal:** Hero metric row: big numbers (`text-5xl font-bold`) with a small label under each. **Do instead:** Show a real number only where a player needs it (their score, their rank), left-aligned in the workspace. Source: PS (hero metric layout). Confidence: sourced. Cost: S

**A28. Signal:** Everything centred (`text-center` on most headings and paragraphs). **Do instead:** Left-align body text and section heads. Centre only a lone short element. Source: PS (everything centred, over 70%), BL. Confidence: sourced. Cost: S

**A29. Signal:** A thick one-sided accent border on a card (`border-l-4`), and monospace used on labels and nav for "tech vibes". **Do instead:** Use mono only for code, prompts and scores. Source: PS (one-sided borders, monospace for tech vibes). Confidence: sourced. Cost: S

**A30. Signal:** Pure `#000`/`#fff` backgrounds, and mid-grey text on coloured or dark surfaces (`text-gray-400`). **Do instead:** Tinted off-white or off-black surfaces; check contrast on every surface pair. Source: PS, HM. Confidence: sourced. Cost: S

## 2. App and workspace UI

**A31. Signal:** Stat cards: a row of `StatCard`/`MetricCard` components with a big number and a tiny green "+12%". **Do instead:** No stat-card row on the profile. Show a list of real attempts with date, prompt count and score. Source: PS (S9, hero metric layout), HN (nearby: "treats every screen like a landing page"). Confidence: sourced. Cost: S

**A32. Signal:** Landing-page styling inside the app (big hero type, gradients, centred blocks on the workspace). **Do instead:** The workspace is a tool: dense, left-aligned, small type, no marketing voice. Source: HN. Confidence: sourced (one thread). Cost: M

**A33. Signal:** Only the happy path is built: no empty, loading, error or invalid-field states; empty screens do not say what to do next. **Do instead:** For every list and panel, write the empty, loading, error and "scored zero" state by hand and name the next action. Source: KC. Confidence: sourced. Cost: M

**A34. Signal:** Spinner instead of a skeleton; default toast position, colour and timing; default modal with no padding thought. **Do instead:** Skeletons shaped like the real content. Inline messages before toasts. Modals only for destructive confirms. Source: BL, PS (modal overuse, three or more dialogs). Confidence: sourced. Cost: S

**A35. Signal:** Badges and status pills on everything, and initials avatars with random pastel fills. **Do instead:** Badge only for a defined state (pass, fail, penalty). Avatars: one fixed neutral style. Source: BL (unstyled initials avatars), HM (eyebrows). Badge count is my own inference. Confidence: partly sourced. Cost: S

**A36. Signal:** Default chart-library colours and styling; command palette, tooltips on every icon, or labels on every control with no need. **Do instead:** Charts use our two state colours only. No command palette. Tooltip only where an icon has no text. Source: BL (default chart colours); palette and tooltip overuse are my own inference. Confidence: my own inference. Cost: S

**A37. Signal:** Every screen has the same shell: left sidebar, top bar with search and avatar, content in cards. **Do instead:** Our screens differ: the workspace is split panes; the leaderboard is a dense table. Choose nav per screen need. Source: KC (everything visible at once, uniform layout); sidebar claim is my own inference. Confidence: my own inference. Cost: M

## 3. Structure and information architecture

**A38. Signal:** Stock section order: hero, logos, three features, how it works, testimonials, pricing, FAQ, CTA, footer. **Do instead:** Let content set the order. For us: a live round, a real leaderboard excerpt, the rules of scoring, one CTA. Source: CM, EM. Confidence: sourced. Cost: M

**A39. Signal:** Adjacent sections with the same heading, paragraph and button layout; an `<hr>` or eyebrow label above every section. **Do instead:** No eyebrow labels. Each section has a different shape. Source: PS (S11), HM (eyebrow labels), BL. Confidence: sourced. Cost: S

**A40. Signal:** Two equal CTAs ("Get started" and "Learn more"), the same CTA repeated at the end of every section. **Do instead:** One primary button, at most one text link. One closing CTA. Source: BL, PS (S14). EM notes Cursor styles the second button differently. Confidence: sourced. Cost: S

**A41. Signal:** Pricing with a "Most popular" middle card, FAQ accordion, four-column footer on a tiny site. **Do instead:** We have no pricing. Skip the FAQ unless real questions exist (write them as a plain page). Footer: one line of links. Source: HM and BL (footer columns); pricing and FAQ are my own inference for our case. Confidence: partly sourced. Cost: S

**A42. Signal:** Standard nav: logo left, four links, button right, on every page including the workspace. **Do instead:** The workspace nav is minimal: challenge name, prompt count, back link. Source: HM (standard nav). Confidence: sourced. Cost: S

## 4. Copy at the micro level

**A43. Signal:** Title Case headings and buttons ("Get Started Today"). **Do instead:** Sentence case everywhere. Source: BL. Confidence: sourced. Cost: S

**A44. Signal:** Generic button labels: "Get started", "Learn more", "Submit", "Try now". **Do instead:** Verb plus object: "Score this prompt", "Open challenge". Source: PS (S14), EM. Confidence: sourced. Cost: S

**A45. Signal:** "Welcome back!", exclamation marks, "We are excited", friendly filler before the content. **Do instead:** Greet nothing. Show the player's last challenge. No exclamation marks. Source: BL (throat-clearing intros). Exclamation count is my own inference. Confidence: partly sourced. Cost: S

**A46. Signal:** A subtitle under every heading that restates it. **Do instead:** Delete any subtitle that shares most of its words with the heading. Source: PS (redundant copy). Confidence: sourced. Cost: S

**A47. Signal:** Rule-of-three lists and "X: Y" colon headlines ("Prompt smarter: score higher"). **Do instead:** One concrete claim per line. Source: widely noted AI voice; I found no source specific to UI. Confidence: widely repeated opinion. Cost: S

**A48. Signal:** Generic errors ("Something went wrong", "Invalid input"), and "No results found". **Do instead:** Name the cause and the fix: "The model timed out. Your prompt was not counted. Try again." Source: https://uxmagic.ai/blog/ux-microcopy-that-converts (microcopy guidance, not an AI-tell study). Confidence: partly sourced. Cost: S

**A49. Signal:** Implementation details or chat context leaking into user text; round fake stats ("10,000+ users"). **Do instead:** Keep user text in one hand-edited file. Source: HN (commenters), BL. Confidence: sourced. Cost: S

## 5. Code-level tells

**A50. Signal:** Class soup: `className` strings over 200 characters; repeated sibling components with identical class lists; inline `style` over 100 characters. **Do instead:** Extract components and `cva` variants; one variant per role. Source: PS (S5, S13, S16). Confidence: sourced. Cost: M

**A51. Signal:** Colours and fonts hard-coded (`#6366f1`, `text-indigo-600`, `bg-white`) bypassing theme tokens; token names like `gradient-start`. **Do instead:** Only semantic tokens (`bg-surface`, `text-pass`); name tokens by function. Source: HM (gate 48), KC. Confidence: sourced. Cost: S

**A52. Signal:** Mixed icon libraries; numbers without `tabular-nums`; arbitrary z-index values. **Do instead:** One icon set. `tabular-nums` on scores and leaderboard ranks. Source: HM. Confidence: sourced. Cost: S

**A53. Signal:** Default favicon, `<title>` left as the framework name, `href="#"` links, dead buttons, TODO or "Coming soon" text, template comments. **Do instead:** Grep for `href="#"`, `TODO`, `Lorem`, `Coming soon` before merge. Source: PS (S10, S12). Favicon and `href="#"` are my own inference. Confidence: partly sourced. Cost: S

**A54. Signal:** Unused shadcn components left in `components/ui`; every file `"use client"`; default README. **Do instead:** Delete components not imported. Client components only where state is needed. Real README. Source: none found. Confidence: my own inference. Cost: S

## 6. Interaction and behaviour

**A55. Signal:** Buttons with hover only: no focus, active or disabled state; hover-only tooltips. **Do instead:** Every control has all four states; focus ring visible and in the accent. Source: BL, HM. Confidence: sourced. Cost: S

**A56. Signal:** Fade-up on every section, bounce or elastic easing, 600ms transitions on routine actions. **Do instead:** 100 to 150ms for routine, no bounce. One animation: the score. Source: BL, PS (bounce), HM. Confidence: sourced. Cost: S

**A57. Signal:** Things that look clickable and are not (cards with hover and no link, dead buttons); broken mobile menu; layout that is only checked at one width. **Do instead:** Screenshot at 375, 768 and 1280 wide; click every button once. Source: none found. Confidence: my own inference. Cost: M

**A58. Signal:** Multi-line clickable labels, hover-only controls on touch devices. **Do instead:** One-line labels; show controls without hover. Source: HM. Confidence: sourced. Cost: S

## 7. What humans do that models rarely do

**A59. Signal (human trait):** Deliberate hierarchy: one thing larger, heavier and closer, the rest recede. **Do instead:** In the workspace, make the prompt box the largest element and the score second; everything else small. Source: KC. Confidence: sourced. Cost: M

**A60. Signal (human trait):** Real product as the hero: Linear a static shot, Tailwind a code snippet, Pixelcut a live demo. **Do instead:** Embed a live, playable round, or a real recorded one. Source: EM. Confidence: sourced. Cost: M

**A61. Signal (human trait):** Decisions written down once (named palette, one shape system, one tone), then reused across every page and asset, including the OG image. **Do instead:** A short design-brief file the agent reads first. Source: CM. Confidence: sourced. Cost: S

**A62. Signal (human trait):** Own vocabulary and real data: our terms ("cost", "ledger", "prompt count") instead of generic ones; leaderboard rows from real runs; one small personal touch (a odd empty-state line, a hand-drawn mark). **Do instead:** Keep a glossary of five product terms and use them consistently. Source: my own inference; supported only by the general advice to use customers' real language in EM and CM. Confidence: my own inference. Cost: S

**Unconfirmed:** I did not find named puzzle or game sites praised as human-made with specifics, and the search for "Hacker News praise" returned only general small-web essays. Examples like Linear and Tailwind come from EM only. Note that prompting "avoid purple" tends to produce a different default look (cream, serif, terracotta), per CM, so ban lists need a positive brief too.

## Checklist additions

Do:
- Keep a role-based spacing scale; section padding varies.
- Use at most two radii, set in the theme.
- Choose border or shadow per surface, not both.
- Use sentence case everywhere.
- Label buttons verb plus object.
- Write empty, loading, error and zero-score states for every list and panel.
- Show focus, hover, active and disabled on every control.
- Use `tabular-nums` on scores and ranks.
- Use semantic colour tokens only.
- Left-align text; centre only lone short items.
- Grep for `href="#"`, `TODO`, `Lorem`, `Coming soon` before merge.
- Screenshot at 375, 768 and 1280 wide.

Don't:
- No icon in a tinted circle or square.
- No `hover:scale-*` or lift-and-shadow hover; no `transition-all`.
- No card inside a card.
- No eyebrow label above sections.
- No stat-card row; no tiny "+12%" badges.
- No sparkle, wand, rocket or zap icons.
- No dot, grid or blob backgrounds.
- No logo strip, FAQ, pricing or testimonials until real.
- No two equal CTAs; no repeated CTA per section.
- No subtitle that restates its heading.
- No "Welcome back!" and no exclamation marks.
- No "Something went wrong" without a cause and a fix.
- No bounce or elastic easing; no fade-up on every section.
- No class strings over 200 characters; no hard-coded hex or `indigo-*` classes.
- No unused shadcn components; no `"use client"` without state.

# AI tells in UI design

**Summary.** Sources agree on a bundle of defaults that make a site read as AI-made: indigo/purple gradients, Inter everywhere, a centered hero with a badge above it, three identical rounded cards, glow and glass effects, emoji icons, and vague copy. The cause is mostly averaging: models and Tailwind/shadcn defaults reproduce the most common web patterns. The fix is not "avoid AI" but to make a few deliberate, product-specific choices (palette, type, layout, copy) and ban the defaults. Most sources are blogs and agencies with their own interests, so treat them as heuristics, not proof. I found no usable source on coding-practice sites (Exercism, Codeforces, Advent of Code); that part is unconfirmed.

## Findings

1. **Signal:** Indigo-to-purple or blue-to-cyan gradients.
**Why it reads as AI:** It is the most repeated tell in every list.
**Do instead:** Pick one brand accent from something true about the product. No gradient backgrounds or buttons.
**Source:** https://www.925studios.co/blog/ai-slop-design-tells
**Confidence:** sourced. **Cost:** S

2. **Signal:** Tailwind's indigo-500 default left in place.
**Why it reads as AI:** Tailwind examples used indigo widely, so models learned "modern" means indigo. Adam Wathan has joked about this; the size of the effect is untested.
**Do instead:** Define our own colour tokens (primary, surface, text) in the Tailwind theme. Do not use the stock indigo/violet scales.
**Source:** https://dev.to/alanwest/why-every-ai-built-website-looks-the-same-blame-tailwinds-indigo-500-3h2p
**Confidence:** widely repeated opinion. **Cost:** S

3. **Signal:** Inter for everything.
**Why it reads as AI:** It is the default in AI tools and component libraries.
**Do instead:** Choose one display face and one body face, and write down why (e.g. a mono for prompts and scores). Fonts like Space Grotesk, Instrument Serif and Geist are also now flagged as common AI picks.
**Source:** https://adriankrebs.ch/blog/design-slop/
**Confidence:** sourced. **Cost:** S

4. **Signal:** Centered hero with a small pill badge above the headline.
**Why it reads as AI:** Same hero shape on thousands of sites.
**Do instead:** No badge above the H1. Lead with the product itself: a real goal page, prompt and score shown in the hero.
**Source:** https://adriankrebs.ch/blog/design-slop/
**Confidence:** sourced. **Cost:** M

5. **Signal:** Three (or more) identical feature cards, each with an icon on top.
**Why it reads as AI:** Equal weight means no hierarchy.
**Do instead:** Give the one thing that matters most more room. Use a screenshot-led section instead of a card row.
**Source:** https://www.utsubo.com/blog/built-with-ai-trust-signals-2026
**Confidence:** sourced. **Cost:** M

6. **Signal:** A card around every block, rounded everywhere, soft grey shadows.
**Why it reads as AI:** It is the shadcn/Tailwind default look.
**Do instead:** Group with whitespace and type. Use cards only for things you can click. One corner radius, small. Few or no shadows.
**Source:** https://www.thefountaininstitute.com/blog/signs-vibe-coded-ui
**Confidence:** sourced. **Cost:** M

7. **Signal:** Default shadcn/ui look, unthemed.
**Why it reads as AI:** It is listed as a tell by itself.
**Do instead:** Keep shadcn for behaviour (dialogs, menus, accessibility), but override colours, radius, font and borders so it no longer looks stock.
**Source:** https://adriankrebs.ch/blog/design-slop/
**Confidence:** sourced. **Cost:** M

8. **Signal:** Glassmorphism, coloured glows, coloured box-shadows, neon on dark.
**Why it reads as AI:** Decoration that responds to nothing.
**Do instead:** No blur panels, no glow. Build depth with contrast and surface steps.
**Source:** https://www.thefountaininstitute.com/blog/signs-vibe-coded-ui
**Confidence:** sourced. **Cost:** S

9. **Signal:** Permanent dark mode with mid-grey body text and ALL-CAPS section labels; barely passing contrast.
**Why it reads as AI:** A common dev-tool default.
**Do instead:** Pick the theme for a reason. Body text at strong contrast. Sentence-case labels.
**Source:** https://adriankrebs.ch/blog/design-slop/
**Confidence:** sourced. **Cost:** S

10. **Signal:** Gradient text on headlines.
**Why it reads as AI:** Part of the purple-gradient bundle. Named by several guides; I did not find a source on gradient text alone.
**Do instead:** Solid-colour headlines only.
**Source:** https://www.925studios.co/blog/ai-slop-design-tells
**Confidence:** my own inference (from the gradient finding). **Cost:** S

11. **Signal:** Emoji as icons, bullets or nav items.
**Why it reads as AI:** Fast shortcut that looks unconsidered.
**Do instead:** No emoji in the interface. One icon set (e.g. Lucide) at one stroke weight, used only where it aids scanning.
**Source:** https://www.thefountaininstitute.com/blog/signs-vibe-coded-ui
**Confidence:** sourced. **Cost:** S

12. **Signal:** Coloured top or left borders on cards; multicolour side tabs; meaningless status dots.
**Why it reads as AI:** Colour with no assigned meaning.
**Do instead:** Colour means a state only (pass, fail, cost-of-points). Write the meaning down once and reuse it.
**Source:** https://www.thefountaininstitute.com/blog/signs-vibe-coded-ui
**Confidence:** sourced. **Cost:** S

13. **Signal:** Numbered "1, 2, 3" steps and a stat banner row.
**Why it reads as AI:** Standard landing-page filler.
**Do instead:** Show one real round (goal, prompt, output, score) instead of a steps strip. No stat row unless the numbers are real.
**Source:** https://adriankrebs.ch/blog/design-slop/
**Confidence:** sourced. **Cost:** S

14. **Signal:** Motion with no purpose (fade-ups on every section, floating blobs).
**Why it reads as AI:** Not tied to any state change.
**Do instead:** Animate only responses to actions: score count-up, output loading, a row moving on the leaderboard.
**Source:** https://www.utsubo.com/blog/built-with-ai-trust-signals-2026
**Confidence:** sourced. **Cost:** S

15. **Signal:** Plastic stock-style AI imagery and generic thin-line icon art.
**Why it reads as AI:** Could illustrate any product.
**Do instead:** Use real product screenshots and goal pages as imagery. Otherwise plain type and whitespace, no hero art.
**Source:** https://www.utsubo.com/blog/built-with-ai-trust-signals-2026
**Confidence:** sourced. **Cost:** S

16. **Signal:** Vague headlines ("Build faster. Ship smarter."), buzzword superlatives.
**Why it reads as AI:** Could describe any product.
**Do instead:** Name who it is for, what they do and the result. For us: say what a player does ("Rebuild this page with fewer prompts") and what is scored.
**Source:** https://www.925studios.co/blog/ai-slop-design-tells
**Confidence:** sourced. **Cost:** S

17. **Signal:** Em-dash overuse, stock openers, "not just X, but Y" phrasing, hedging.
**Why it reads as AI:** Style guides call it the "AI voice". Evidence is mixed: one study found em dashes did not hurt engagement, and humans use them. Treat it as a heuristic.
**Do instead:** No em dashes in UI copy. Short sentences, active verbs, no "seamless", "unlock", "supercharge".
**Source:** https://searchengineland.com/ai-writing-tics-engagement-study-470051
**Confidence:** widely repeated opinion. **Cost:** S

18. **Signal:** Fake or placeholder testimonials, made-up logos and stats.
**Why it reads as AI:** Synthetic proof erodes trust; one audit found leftover template testimonials.
**Do instead:** No testimonials or user counts until real. Show real data: actual leaderboard rows, real scores.
**Source:** https://www.utsubo.com/blog/built-with-ai-trust-signals-2026
**Confidence:** sourced. **Cost:** S

19. **Signal:** Boilerplate meta text, no custom OG image, generic alt text.
**Why it reads as AI:** Unfinished details show.
**Do instead:** Write the page title, meta description and OG image by hand. Alt text describes the image.
**Source:** https://www.utsubo.com/blog/built-with-ai-trust-signals-2026
**Confidence:** sourced. **Cost:** S

20. **Signal:** Whole site built from model defaults.
**Why it reads as AI:** Models output the average of their training data; AI output feeding back into training is a hypothesis with no measured effect.
**Do instead:** Give the agent a written design brief first (palette, fonts, radius, tone, banned list). Anthropic's frontend-design skill says the same, though I only saw mirrors of it, not the official file.
**Source:** https://adriankrebs.ch/blog/design-slop/
**Confidence:** sourced (cause is the author's view). **Cost:** S

21. **Signal:** Dev-tool sites that feel human show the real product.
**Why it reads as AI:** The reverse: Linear, Vercel and Stripe are cited for showing the product and one clear promise. Stripe's own gradient look is now called generic when copied.
**Do instead:** Make the workspace the identity: monospace prompts, a visible score ledger, plain-words point costs. Use the product as the hero visual.
**Source:** https://evilmartians.com/chronicles/we-studied-100-devtool-landing-pages-here-is-what-actually-works-in-2025
**Confidence:** sourced (agency study); fit to our site is my inference. **Cost:** M

## Rules to hand to a coding agent

Do:
- Read the design brief (palette, two fonts, radius, tone) before writing any UI.
- Define colour tokens in the Tailwind theme; one accent, one neutral scale.
- Choose one display and one body font; use a monospace for prompts and scores.
- Use colour only to mean a state (pass, fail, penalty).
- Use real screenshots, real scores and real leaderboard rows as visuals.
- Animate only in response to an action or state change.
- Write specific copy: who, what, result. Short sentences.
- Override shadcn colours, radius and fonts; keep its behaviour.
- Use one icon set, one stroke weight.
- Hand-write page titles, meta descriptions and alt text.

Don't:
- No purple, indigo or violet gradients; no gradient text.
- No Inter, Roboto, Arial or system-font-only stack as the identity.
- No pill badge above the hero headline.
- No row of three identical icon cards.
- No card around every block; no soft grey drop shadows.
- No glassmorphism, glows or coloured shadows.
- No emoji in the interface.
- No coloured card side borders or unexplained status dots.
- No ALL-CAPS section labels; no mid-grey low-contrast body text.
- No fake testimonials, logos or stats.
- No em dashes; no "seamless", "unlock", "supercharge", "not just X but Y".

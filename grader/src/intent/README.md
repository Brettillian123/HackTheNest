# Intent scorer (single pages)

`scoreIntent(reference, candidate, { keyFacts })` asks: does the page do what the brief asked, and does it look like competent finished work close to the reference's look? The reference is one good answer, not a picture to copy. Deterministic, no AI, no screenshot comparison. `measure.ts` measures, `combine.ts` combines, every constant is in `params.json` (fitted with `npm run fit -- --model intent`).

Used by `gradeSite(..., { intent: { "index.html": { keyFacts } } })`; such a page carries `mode: "intent"`.

## What each criterion measures

Works (content and layout marks):
- **Key facts**: every exact name, label, price and figure the brief lists is on the page (case, spacing, quotes and dashes ignored; numbers exact). Necessary, not sufficient: at most a third of content, though a missing fact also holds back the whole works mark (limiter).
- **Everything asked for**: each part of the reference (menu, hero, cards, table, form, footer...) has a counterpart of the same kind carrying its words. Saying the same thing in other words costs a little. One block of text cannot stand in for several parts.
- **Counts and order**: groups have the asked-for number of items (cards, rows, columns, menu links); parts and the items inside them come in the asked-for order.
- **Nothing unasked**: not much more text or parts than the brief needs (generous room).

Looks (style and visual marks, scaled down when much of the asked-for content is missing):
- **Arrangement and placement**: things side by side or stacked stay so; each part sits in roughly the same place and at roughly the same size (as shares of the page; a page-wide downward shift is removed).
- **Readability**: contrast (WCAG), text size, nothing off the page or overlapping; only faults beyond the reference's own count.
- **Consistency and type**: like items are alike (sizes, gaps, edges, text styles); few type families and sizes; headings clearly larger than body; body and headings in the reference's broad class (serif, sans, mono).
- **Colour families**: page background, large bands and emphasis (buttons, coloured highlights) in the same family as the reference. Another shade costs a little; another family or light-for-dark costs a lot. Text greys and borders are not compared.

Every comparison has three zones: vicinity (a tiny loss), close (a little more), off (a lot). Only an exact match is free.

## Checks

The page result lists `checks`: one per thing measured, with the exact figure ("1.02 times the reference's width and 1.00 times its height"), its zone and the points it cost (two decimals). Their points add up to 100 minus the page total. Engineering (accessibility, clean code, size and speed) is not in the checks: the site layer reports its own deductions in `result.feedback` and `result.engineering`.

## What it deliberately does not look at

Exact pixel positions, exact hex colours, exact font families or sizes, the tags used (roles never change a score), and whether the page looks like a copy of the reference. It cannot judge whether invented text is sensible, whether icons fit their meaning, or taste beyond the measures above.

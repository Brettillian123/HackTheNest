# Design rules for coding agents

_Updated 2026-11-14 after research passes 1 to 3. This page is the only rule list a coding agent is given. The research reports in `research/` are reference for whoever reviews a screen._

Brett: "make sure that there are not too many AI rules and that we dont oversaturate the rules list so that our AI designs still have some freedom to create great things". And on the limits below: "I trust the research so whatever the professionals have said is what should happen. Especially related to fonts, colors, and clutter".

**Build from `SPEC.md` first.** It holds the art direction (the test bench, the rail, the specimen frame), the exact values and the pass checklist. This page is the short list of limits around it. Where the two disagree, `SPEC.md` wins. Brett, on why: "We need more specific rules I think because each new one feels almost the exact same as the last."

## Always (6)

1. **Use the theme.** Colour, font and radius come from the theme tokens. No hard-coded values.
2. **One job per screen state.** Each state (for example: before a run, after scoring) has one thing the eye lands on and one primary button. Show what that state needs; put the rest one click away, never two.
3. **The product is the picture.** Visuals are real goal pages, real scores and real leaderboard rows. Nothing fake.
4. **Hierarchy from weight and colour first,** size last. Group with space, not boxes: the gap between groups is at least twice the gap inside a group.
5. **Plain, specific words.** Sentence case. Buttons say verb plus object. An error says what happened and what to do.
6. **Finish the states.** Empty, loading and error states exist; every control shows keyboard focus; nothing looks clickable that is not.

## Never (7)

1. Purple, indigo or violet; gradients; glass, glows or coloured shadows.
2. Monospace on labels, tags, captions, buttons, nav or table headers. It is for the prompt, code and numbers.
3. Emoji, or sparkle, wand and rocket icons.
4. The template landing page: pill badge above the headline, three identical icon cards, logo strip, testimonials, FAQ.
5. A box inside a box, or a border and a shadow on the same box.
6. Marketing voice: "seamless", "unlock", "supercharge", exclamation marks, a subtitle that repeats its heading.
7. Dead links, dead buttons, placeholder text.

## Budgets (count them in a screenshot)

The direction comes from the research (`06-typography.md`, `07-clean-ui.md`); the exact numbers are the researchers' proposals.

| What | Limit |
|---|---|
| Font families | 2: IBM Plex Sans for text, IBM Plex Mono for prompt, code and numbers |
| Font sizes | Only 12, 14, 16, 20, 28, 48 px. At most 4 on a tool screen, 5 on the landing page |
| Weights | 400 and 600 |
| Text colours | 2: main and muted. At most 3 muted captions on a screen |
| Text elements at first view | 20 in the workspace, 12 on the landing first screen, 15 on the leaderboard |
| Bordered or filled containers | 4 per screen |
| Buttons | 1 primary, up to 2 secondary |
| Colour | Near-black surfaces (3 steps at most), one red, plus a pass and a cost colour only where a state is shown |
| Page side padding | At least 32 px |

## Yours to decide

Everything not listed above: layout, composition, asymmetry, proportions, section order, what the hero does, how the score and leaderboard are drawn, small interactions. Aim for something a person would remember.

If a rule or budget blocks a clearly better design, break it and say so in your report.

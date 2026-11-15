# 07 Clean UI: clutter, layout and whitespace

**Summary.** "Clean" has real evidence behind it, but less than people claim. Low visual complexity plus familiar layout gives a good first impression within 50 ms (Tuch et al., 2012). Nielsen and NN/g say to drop rarely needed information and defer advanced options. Designers who ship calm tools (Linear) say the same: give every element a weight that matches its job, and let structure be felt, not seen. No source gives hard numbers for "how many elements is too many". The clutter budget below is my own proposal. Density is not clutter: experts handle dense screens if the density is organised. Our rejected workspace failed on count (about 45 text elements, about 12 boxes), on equal weight (all muted metadata looked alike), and on showing after-the-fact detail before it was needed. Fixes: one primary action per state, show the score and two costs after a run, and put the rest behind a click.

Confidence labels: sourced = I opened the page or abstract; widely repeated opinion = secondary summaries; my own inference = mine.

## What clean means

**K1. Low visual complexity and high familiarity make a good first impression, fast.** Tuch et al. (2012) rated 119 website screenshots at 17 to 1000 ms. Low complexity plus high prototypicality scored as most appealing. Complexity mattered earliest; familiarity caught up with longer viewing. NOT evidence for: any specific element count, or for task performance. It measures looks. I read the abstract and Google's summary only, not the full paper.
Source: https://research.google/pubs/pub38315/ and https://research.google/blog/users-love-simple-and-familiar-designs-why-websites-need-to-make-a-great-first-impression/ . Confidence: sourced (abstract).

**K2. Aesthetic-usability effect.** People rate good-looking products as easier to use. The classic study (Kurosu and Kashimura, 1995, 26 ATM designs, 252 people) found looks tied more to perceived than actual ease. NN/g warns it covers small problems only and that praise in tests can be politeness. NOT evidence for: looks fixing a bad workflow. Source: https://www.nngroup.com/articles/aesthetic-usability-effect/ . Confidence: sourced.

**K3. Minimalist design heuristic.** Nielsen's heuristic 8: leave out irrelevant or rarely needed information, because every extra element competes with the content. It does not require a flat style. Heuristic 6 pulls the other way: do not make people remember things. Source: https://www.nngroup.com/articles/ten-usability-heuristics/ . Confidence: sourced. NOT evidence for: any number.

**K4. Clutter is extraneous cognitive load.** NN/g names redundant links, irrelevant images and meaningless typography flourishes as clutter. Meaningful elements are not clutter; overuse is. Source: https://www.nngroup.com/articles/minimize-cognitive-load/ . Confidence: sourced.

**K5. Tufte's data-ink idea.** Maximise the share of ink that carries data. Erase non-data ink and redundant ink. It was built for printed charts; NN/g treats the signal-to-noise framing as a related idea, not a proven measure, and says gridlines and axes are sometimes needed. Source: https://www.nngroup.com/articles/clutter-charts/ . Confidence: sourced (via NN/g summary, not Tufte's book).

**K6. Dieter Rams, principle 10: "as little design as possible".** Focus on the essential, strip the rest. Principle 8 says every detail is intentional. This is a design philosophy, not an experiment. Source: https://www.vitsoe.com/us/about/good-design . Confidence: sourced as opinion.

**K7. Hick's law.** Decision time rises with the number and complexity of choices. Laws of UX warns not to simplify to the point of abstraction. The original 1952 work was on simple stimulus-response tasks, so applying it to a page is an extension. Source: https://lawsofux.com/hicks-law/ . Confidence: sourced; the extension is my inference.

**K8. Miller's law is not a UI limit.** Working memory holds about 7 plus or minus 2 items. Laws of UX itself says not to use it to justify design limits. Do not write "7 items max" as a rule. Source: https://lawsofux.com/millers-law/ . Confidence: sourced.

**K9. Gestalt proximity.** Closeness groups things and can beat colour or shape. Whitespace alone can separate items. NN/g also lists "common region" (a box) as an alternative grouping tool. Evidence is examples and critiques, not controlled tests. Source: https://www.nngroup.com/articles/gestalt-proximity/ . Confidence: sourced, weak evidence type.

**K10. Whitespace studies are thin.** A 2004 Wichita State study, as reported by a secondary source (I did not open it), found wider margins slowed reading but raised comprehension and satisfaction. Ad studies show whitespace signals "expensive" and its liking depends on the viewer. NOT evidence for a share of screen to leave empty. Source: https://www.thinkcompany.com/blog/where-for-art-thou-whitespace/ . Confidence: widely repeated opinion.

## How to reduce

**K11. Progressive disclosure.** Show a few important options, defer rare ones. NN/g: two levels is the practical limit, the path to the hidden part must be obvious, and frequent features belong up front. Hidden things are one step away, not removed. Source: https://www.nngroup.com/articles/progressive-disclosure/ . Confidence: sourced.

**K12. Weight should match purpose.** Linear's 2026 refresh: task elements stay prominent, navigation recedes; "structure should be felt, not seen". They dimmed the sidebar, shrank the tab bar, cut icons, removed many accumulated borders and softened the rest, and moved to a less saturated palette. Source: https://linear.app/now/behind-the-latest-design-refresh . Confidence: sourced (my paraphrase of their post).

**K13. Space instead of lines.** Refactoring UI style advice, seen through secondary summaries (I could not open the book): separate with spacing, make gaps between groups larger than gaps inside groups, start with too much space and remove, try a background shift before a border, reserve borders for tables and inputs. Source: https://blakecrosley.com/blog/five-spacing-decisions (secondary). Confidence: widely repeated opinion.

**K14. Defaults over options.** NN/g lists smart defaults as a way to offload work. Hide shortcuts from novices but offer them to experts (heuristic 7). Source: https://www.nngroup.com/articles/minimize-cognitive-load/ . Confidence: sourced.

**K15. One job per screen; one primary action per state.** Widely taught; I found no single study. Confidence: my own inference from K3, K7, K11.

**K16. Few alignment edges and one spacing scale.** Standard craft advice with no study I could open. Confidence: my own inference. Rauno Freiberg's and Emil Kowalski's writing on craft: I could not open the essays, only third-party summaries. Unconfirmed.

## What clean products show and hide

Mostly from my knowledge of these products, not re-checked this session. LeetCode returned 403 and I could not view it. Treat rows as unconfirmed unless a source is given.

| Product | Shown by default | Hidden or secondary |
|---|---|---|
| Linear | Task list or issue; dimmed sidebar (sourced, K12) | Properties, filters, commands behind menus and shortcuts (unconfirmed) |
| CSSBattle | Three panes: editor, your output, target; compare tools above output; score from match plus character count (FAQ, sourced) | Exact UI details unconfirmed |
| Monkeytype | Test text, a few stats while typing | Settings and themes in separate views; whether UI fades while typing is unconfirmed |
| Google home, Wordle | One input or one grid | Everything else |
| ChatGPT, Claude chat | One input box, conversation | Settings, history in a sidebar |
| LeetCode | Not verified. Commonly described as dense: description, editor, tabs, tags | Not verified |
| Stripe, Vercel, Raycast, Things, Notion, iA Writer | Not examined in this research | Unconfirmed |

Lesson I draw (inference): the calm tools show one object of work and one input. Chrome around it is dimmed or moved.

## Our screens

Primary rule: each state has one thing the eye should land on and one button.

**Workspace, before first run.** Show: the goal page (large), the prompt box, one Run button. Small: challenge name and a back link. Behind a click: model picker (a default is set, a small "Model: X" text opens it), hints, character counter (appears when near the limit), attempts (empty anyway). Do not show an empty score panel; leave the space empty.

**Workspace, during a run.** Show: goal page and prompt as they are, the Run button replaced by a single status line ("Rebuilding...") . Output pane appears when ready. Behind a click: nothing new. Do not add timing, file size, URL.

**Workspace, after scoring.** Show: goal and output side by side, the score as the largest item, a short list of at most 3 point costs in plain words, one primary button ("Try again"), prompts-used count. Behind a click: passed checks (a "Passed 4" line that expands), attempt history, per-cost explanations, file size, timings, URL, best-score delta.

**Landing page.** Show: one headline, one line of support, one button, one product visual (a goal page and its rebuilt page, or a single score card). Behind scroll or click: how scoring works, leaderboard preview, costs, caption lines. Not first screen: the prompt, the score and two costs together.

**Leaderboard.** Show: a plain table with rank, player, prompts used, score; a challenge switcher; your row highlighted. No boxes around rows, use row spacing and a single hairline at most. Behind a click: player profile, filters beyond challenge and period, per-attempt detail.

**Challenge list and profile.** Same rule: one list, one line per item (name, difficulty, your best). Extras on hover or on the detail page. (My inference.)

## Clutter budget

All numbers are my own proposals. No source gives them. They are for an agent to follow and a person to count. Count per screen at 1280 x 800, first view, no hover or click.

- Text elements visible: 20 maximum for the workspace, 12 for landing first screen, 15 for the leaderboard (table cells count as one element per column header plus one per row).
- Muted caption or metadata items (small grey text): 4 maximum.
- Bordered or filled containers: 4 maximum (workspace: prompt box, goal pane, output pane, score card). No box inside a box.
- Buttons: 1 primary, up to 2 secondary. Text links do not count.
- Distinct colours: black and near-black surface steps (3 at most), one red accent, one text colour plus one muted, plus green and amber only for pass or fail states.
- Panes in one row: 3 maximum, 2 for the workspace.
- Margins: page side padding at least 32 px at desktop, 16 px on phone. Gap between groups at least 2x the gap inside a group. Use one spacing scale (4, 8, 16, 24, 32, 48, 64).
- Left edges: no more than 4 distinct vertical alignment lines per screen.
- Empty space: at least 30 percent of the first view has no content, not counting pane contents.
- Borders: none between sibling items in a list; use gaps.
- Icons: only where a label would be longer; no decorative icons.
- One disclosure level only. Never a hidden panel inside a hidden panel (NN/g, K11).

How to check: count elements in a screenshot; the Linear refresh, Tuch et al. and NN/g all support the direction (fewer, quieter, grouped), not these numbers.

## Where clean goes wrong

- **Empty and generic.** Low complexity helps only with familiarity (K1). A bare layout with no point of view reads as a template. A red and black identity, one strong visual and good copy keep it from looking generic. (Inference.)
- **Hiding things users need.** NN/g: frequent features belong up front, and the route to hidden parts must be obvious (K11). The score reasons are the core value of promptdyno. Keep them visible after scoring.
- **Recognition over recall.** Heuristic 6 argues against hiding what users must remember, such as which model is active. Keep a small visible label.
- **Aesthetic-usability masks problems.** Good looks can hide a bad workflow in tests (K2).
- **Density is not clutter.** Secondary sources say experts prefer denser interfaces and novices sparser, and that the problem is uncurated density, not density. Treat these as widely repeated opinion; I could not retrieve NN/g's own density article. Our players are developers, so the post-score view may be denser than the landing page if it is grouped and aligned. Consider letting power users expand details by default (a setting).
- **Over-simplification.** Laws of UX warns against simplifying to abstraction (K7).

## Missing or unconfirmed

Refactoring UI book, Rauno Freiberg and Emil Kowalski essays, Stripe, Vercel, Raycast, Things, Notion, iA Writer, Wordle, LeetCode and Monkeytype specifics were not confirmed from primary sources. The Tuch study and the 2004 whitespace study were read as summaries only. All numeric budget limits are my proposals.

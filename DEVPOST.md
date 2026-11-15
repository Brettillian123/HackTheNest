# Devpost final: PromptDyno

_Updated 2026-11-15, about 4 pm, for the final deadline that evening. Anything in [square brackets] is for the team to fill in or confirm before pasting. Numbers below were true when written; the ones marked [confirm] depend on what the site session has imported._

## Short fields

- **Project name:** PromptDyno
- **Tagline:** LeetCode for prompting. You get an assignment and a reference; you write the prompt; a small model builds it; a grader with no AI in it scores how well the result works, how well it is engineered and how close it looks.
- **Try it out:** https://promptdyno.vercel.app
- **Code:** [GitHub link; the repository must be public or shared with the judges]
- **Video:** [link]
- **Team:** [names]
- **Built with:** javascript, typescript, node.js, html, css, mongodb, vercel, vultr, docker, playwright, three.js, openai, gemini, claude

## Tracks to consider (the team decides; check the rules on entering several)

- Hack The Nest overall.
- Department of CS ("the best code wins"): the grader, its benchmark and its tests are the piece to show.
- MLH Best Use of MongoDB Atlas: accounts, runs and leaderboards are stored in Atlas.
- MLH Best Use of Vultr: the grader runs as its own service on a Vultr server.
- [Best Use of Gemini API or a similar provider track: Gemini Flash is one of the three models players can prompt.]

## The story (paste into "About the project")

```markdown
## Inspiration

Everyone is told to get better at prompting, but there is nowhere to practise it the way LeetCode lets you practise code: a clear target, an attempt, and a score you can trust. We wanted that loop for the people who are learning to build with AI: students and early developers who can read code but have not yet learned to direct a model well.

## What it does

PromptDyno hands you an assignment the way a manager or a teacher would: what the page is for, who uses it, what "done" means, and a reference design that is the exact target. The wording of the page is given to the model for you. Your job is the part that is hard in real life: looking at the reference, deciding what matters, and describing the structure, the arrangement, the look and the engineering in your own words. A small model (OpenAI mini, Gemini Flash or Claude Haiku) builds from your prompt, and a grader scores the result.

- **The score is not an opinion.** No AI is involved in grading. The same submission always gets the same score, so a leaderboard means something.
- **Three things are scored.** Does it work (the right structure, in the right arrangement, with the right content), is it well engineered (size, estimated load time on four simulated devices, accessibility, clean code, meaningful structure), and does it look like the reference. Working and being well built count for more than looks.
- **Close counts, exact is not required.** A box a few pixels off or a slightly different shade costs a fraction of a point. A block in the wrong part of the page, or a red page that should be blue, costs a lot. The reference is the 100 mark, 100 almost never happens, and 80 to 90 is a solid result.
- **You are told what to fix, with the numbers.** Feedback names the thing and what it cost, most costly first.
- **You cannot paste your way to a score.** The assignment does not contain a spec to copy, and a deterministic check flags prompts lifted from the challenge text.
- **More than pages.** The grader also scores multi-page sites (every page built, every link working, every page reachable), 3D models written as Three.js code, and documents: project instructions for coding agents, READMEs, skill files, tool definitions for MCP servers, and plans for multi-agent workflows.
- **Lessons, not only challenges.** An advanced track of eight lessons covers the skills around prompting: project instructions a model actually follows, documentation as a prompt, skills, the Model Context Protocol (using servers and defining tools), agent workflows, loops and graphs, and self-research. Each lesson has worked examples, questions with answers, references to the official documentation, and three graded challenges at rising difficulty.
- **Leaderboards by number of prompts**, so a one-shot result is ranked against other one-shot results.

## How we built it

- **The site** is a Node back end with a static front end on Vercel, with accounts, runs and boards in MongoDB Atlas. Challenges and lessons are plain files.
- **The grader** is TypeScript, running as its own service in a locked-down container on a Vultr server. It renders the reference and the submission in a headless Chromium that cannot run page scripts or reach the network, reads what a person would actually see (text, boxes, pictures, with positions and colours), and compares the two. It judges what is rendered, not which tags were used: the same page built with a table or with a grid scores the same.
- **For 3D** we wrote a small software renderer so scores never depend on a graphics card. The submission is turned, scaled and moved to line up with the reference, then matched part by part, so a model that is slightly rotated is charged slightly, not failed.
- **For documents and workflow plans** the challenge author writes a rubric (required sections, facts that must appear exactly, stages, orderings, what may run in parallel) and the grader checks it: no two parallel steps may change the same files, every loop needs an exit test and a cap, every step needs a proof.
- **We measured the grader against people.** We built a benchmark of 316 attempts, each with the score band a fair person would give, written before the grader saw it. One command grades them all and reports how many land inside the band. Constants are fitted against those bands and adopted only if they also hold on attempts they were not fitted on.
- We built with Claude Code: one session coordinating, and coding agents each working on separate files with a budget and a proof to deliver.

## Challenges we ran into

- **Making "a person would say that is right" repeatable.** Pixel comparison is too harsh and structure alone ignores how the page looks. We ended up scoring several things a reviewer would check, each with a tolerance for what the eye does not notice.
- **Tuning by hand does not converge.** Three rounds of hand-tuning each fixed one set of cases and broke another. What worked was separating measuring from combining, naming every criterion, and fitting the balance against human judgement with a held-out check.
- **Agent-written test cases are not real ones.** A scorer that agreed with people on attempts written by agents was 17 points off on the first six real model outputs. We kept the scorer that tracked people on real output and use real runs as the test that matters.
- **Our first challenges trained the wrong skill.** They were pixel-and-colour-code specs, which rewards copying. A hackathon organiser pushed back, and he was right: real prompting is describing what you want from your own understanding. We rewrote every challenge as an assignment with a reference, and moved the exact wording out of the player's hands.
- **People will try to game a grader.** Hidden text, a correct page under a cover, pages that are a picture of the reference, stub pages with only a title, a site whose links all go to one catch-all page. Each is now a test.
- **A headless browser does not run on a serverless host**, so the grader became a separate service, and getting a sandboxed browser to start inside a locked-down container took three attempts.

## Accomplishments that we're proud of

- A grade that is reproducible to the decimal, with over 500 automated tests behind it, including tests of general rules over generated pages (removing content never helps, adding junk never helps, a broken link is never better than a missing one).
- A grader that is honest about its own accuracy: a benchmark, a held-out check, and real model runs it has to get right.
- Five kinds of challenge on one scoring model: pages, sites, 3D, documents and workflow plans.
- Eight researched lessons with 24 graded challenges, every reference link checked.
- [confirm the number live] page challenges across three levels and four categories, each written as an assignment.

## What we learned

- Fair grading is mostly about what you refuse to charge for, and about charging a little for small things instead of nothing or everything.
- Tests of general rules find bugs that examples do not. Real outputs find bugs that tests do not.
- A score people can argue with has to explain itself in numbers.
- The skill worth teaching is not copying a spec. It is turning an outcome into instructions.

## What's next for PromptDyno

- Finish calibrating the page scorer on a wider set of real model runs at every level.
- Show the exact measurements behind each score on the results page.
- Make multi-page sites and 3D models playable on the site (the grader already scores them).
- Run a player's MCP server against test calls, in a sandbox.
- A choice of models, with more capable ones costing more credits.
```

## Notes for whoever pastes this

- "Over 500 automated tests": the full run on the live version (0.9.2) was 571 of 572 passing. The one failure is a check that four agent-written practice attempts stay inside their bands; each is under 1 point above it.
- A figure you can quote: on 34 real model runs across 14 challenges, each given a score band by a person, the live grader is 1.1 points from the band on average, inside it on 20, and never more than 8 points out. Say alongside it that the grader's settings were chosen with those same runs in view, so it is a fit, not a blind test.
- The six-real-runs figure (17 points off against 3.6) is from `grader/calibration/real-runs/`.
- Do not claim the copy check or the exact-measurements panel are on the live site unless the site session confirms they are switched on.

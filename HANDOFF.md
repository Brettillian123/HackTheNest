# Team Handoff: Hack The Nest 2026

_Context for teammates and their AI assistants. Last updated 2026-11-14._

This is an overview to get you oriented, not a spec. Fuller details are in [`RESEARCH.md`](RESEARCH.md) (event research) and [`IDEAS.md`](IDEAS.md) (project idea). Where something isn't decided, use your judgment and talk it through with the team.

---

## How We've Been Working

The general approach so far:

- **Research first, and keep it accurate.** Event facts came from the official site (hackthenest.tech) and MLH's prize page. Anything unconfirmed is marked as such rather than guessed. We'd like to keep it that way: if something isn't known, saying so is better than filling the gap.
- **Short, readable docs.** Brief and easy to scan is preferred over exhaustive.
- **Suggestions are welcome, kept low-key.** Tips and ideas are useful when they're labeled optional and don't dominate the docs.
- **Ideas are discussed before they're written down.** New ideas get shared with the team first, and they go into `IDEAS.md` once the team agrees they're worth pursuing.
- **Usefulness and execution over flash.** Several directions were explored (hardware, sponsor-specific builds and others). The team leaned toward something genuinely useful that can be built well and polished, rather than an idea tied to particular hardware or a single sponsor.
- **Tracks support the project; they don't steer it.** Sponsor and MLH tracks are best treated as features or build tools that fit naturally, not as the reason for the project.

---

## The Event

**Hack The Nest v1.0** is the first student-led hackathon at Eastern Michigan University (Ypsilanti, MI), run by GDG on Campus EMU. It runs Nov 14–15, 2026: 24 hours, in person, MLH member event, teams of up to 4. Being the first edition, there are no past winners to learn from.

**Deadlines (Devpost):**
- Project draft: by **midnight, Sat Nov 14**
- Final project, demo video and presentation: by **noon, Sun Nov 15**

**How the prizes are structured** (as we understand it):
- An **overall prize** for the best project.
- **Main tracks:** Future of Intelligence (OpenAI + Exa), Mind and Machine (brain-computer interfaces), Future of Money (Breez), Best Beginner, and a Capture the Flag running alongside the hackathon.
- **Sponsor, academic and MLH tracks:** NASA data (Beyond the Horizon), Quantum Computing, Code of Life (Seqera), ElevenLabs, Base44, SSOJet, the EMU CS Department's "best code" track (open to any project), and MLH's prizes (Gemini, MongoDB Atlas, Tiger Data, Vultr, Solana, GoDaddy domain, DEV Writing Challenge, SpaceXSI raffle).
- **Workshops are separate** from the main project.

Prizes and requirements for each are in `RESEARCH.md`.

**Still unclear:** whether one project can win several prizes, which tracks count toward the main project, the judging rubric, and the presentation and demo video requirements.

---

## The Project: LeetCode for AI Prompting

**Purpose:** help people get better at prompt engineering through practice, with fair and measurable feedback, in the spirit of how LeetCode helps people practice coding.

**The core idea:**
- Players see a goal state: a web page and pictures of what it should look like.
- They write prompts for a small model to try to reproduce it.
- The result is scored on deterministic factors, so grading is consistent and fair.
- A leaderboard ranks players.

That loop (challenge → prompt → output → score → leaderboard) is the heart of it. Most else is open.

**Possible directions the team has talked about (none decided):**
- Extra challenge types, such as 3D scenes (the model writes scene code, graded on renders and scene structure) or ElevenLabs voice (matching a goal audio clip).
- Model tiers with a credit system: more capable models cost more credits per run. Solana is a possible way to implement the credits later (it is also an MLH prize category).
- Folding tracks in where they fit naturally. For example, the grading engine could interest the CS Dept "best code" judges, OpenAI or Gemini could be models players prompt, and MongoDB could store data. `IDEAS.md` has a fuller list.

**Not yet decided:** architecture details, the exact OpenAI and Gemini models, the grading design, and how work is split. These are open for discussion.

---

## The Stack

_Decided 2026-11-14._

| Layer | Choice |
|---|---|
| Language | TypeScript everywhere |
| App | Next.js (App Router), one repo, UI and API routes together |
| UI | Tailwind CSS + shadcn/ui |
| Prompt input | Plain text box styled to match the site |
| Output preview | Sandboxed iframe. Generated pages are HTML and CSS only, no JavaScript |
| Grader rendering | Playwright (headless Chromium), fixed viewport, network blocked |
| Grader scoring | Visual similarity plus our own structure and style diff |
| Models players prompt | Several models across OpenAI, Gemini and Claude, selectable, behind one shared interface so adding a model is a config entry. Starting set: one small model per provider. Claude: Haiku 5.5 (`claude-haiku-5-5`) proposed. OpenAI and Gemini: not yet picked |
| Database | MongoDB Atlas (free tier) |
| Login | Auth.js with GitHub sign-in |
| Hosting | One Vultr VM running Docker. Fallback: Railway or Fly with the same image |
| Code quality | Vitest tests on the grader, ESLint + Prettier, GitHub Actions CI |
| Tooling | Current Node LTS, npm |

**Grading requirement:** scores stay deterministic, and they should also match human judgment of "is this what I asked for?", the way a boss would judge the result against the goal. How to achieve that is not yet designed.

**Unconfirmed:** whether the event provides OpenAI, Gemini or Claude credits. If not, the team needs its own API key for each.

---

## How Challenges Are Made (read this before writing tutorials)

_Added 2026-11-15 by Brett's grader session. Describes the challenge files on the `grader` branch under `challenge-pack/`. What the live site shows a player is the site session's to confirm._

**Where they are.** 50 page challenges: `challenge-pack/pages-live/` (6), `pages/` (12), `pages-2/components|marketing|apps|forms/` (8 each). Each folder has `challenges.json` (`{ "challenges": [...] }`) and `goals/<slug>.html`, the reference page. Multi-page sites are in `sites/`, 3D models in `scenes/`, lesson challenges (documents and workflow plans) in `lessons/`.

**One challenge entry.**

| Field | Who sees it | What it is |
|---|---|---|
| `slug`, `title`, `level` (1 to 3), `category` | player | Identity. Level 1 is a small component, 3 a full page. |
| `brief` | player | The assignment, written as a manager or teacher would give it: what the page is for, who uses it, what matters. No pixel sizes or colour codes. |
| `acceptance` | player | Plain statements of what "done" means. |
| `goals/<slug>.html` | player, as a picture | The reference. It is the exact target and the 100 mark. |
| `content` | the model, automatically | The page's wording (headings, labels, prices). The player does not type it. |
| `maxPromptChars` | player | Prompt length limit (3,500 to 5,000 on these). |
| `requirements`, `keyFacts`, `designNotes`, `exactSpec` | nobody: hidden | Author's notes and older exact specs. Never show or quote these in a tutorial. |

**How a run is scored.** The model's page and the reference are both drawn in a browser at 1280 x 800 with scripts and network off, and compared. No AI is involved; the same page always gets the same score. Three parts: works 30% (right content, in the right arrangement), engineering 45% (small file, accessibility, clean code), looks 25% (close in colour, size and style). Close counts: a few pixels or a slightly different shade costs a fraction of a point; a block in the wrong part of the page or the wrong colour scheme costs a lot. Level 1: 80 to 90 is solid. Levels 2 and 3: 70 or more is solid. 100 almost never happens.

**What a tutorial should teach** (the skill is describing the reference, not copying a spec):

- Say what the page is and list its parts in order, top to bottom, and how they are arranged (centred card, two columns, three cards in a row).
- Describe the look in words a person would use: background, accent colour, light or dark, rounded or square, how much space.
- Ask for the engineering by name: one HTML file with CSS inside it, no scripts, no outside fonts or images (draw icons and pictures as inline SVG), `lang` on `<html>`, a viewport meta tag, `<main>` and headings in order, a label tied to every form field, real lists and tables, readable contrast, nothing extra.
- Do not ask for additions the reference does not have: extra sections, labels or buttons lose points.
- A tutorial may walk through the brief, the reference picture and the acceptance list. It must not reveal the hidden fields or the reference's source code.

**Making a new challenge.**

1. Write the reference as one HTML file: CSS inside it, no scripts, no network, well engineered (it is the 100 mark). Save it as `goals/<slug>.html`.
2. Add the entry to that folder's `challenges.json` with every field above. Write the brief as an assignment; put the wording in `content`; keep specifics in the hidden fields.
3. Set `maxPromptChars`: characters of brief + acceptance + requirements + design notes, times 1.5, plus 1,000, rounded up to the next 500, between 2,000 and 12,000.
4. Run the check scripts in `challenge-pack/` (`check-briefs.mjs`, `check-content-a.mjs`, `check-content-b.mjs`; see `challenge-pack/README.md`).
5. Grade the reference against itself (must be 100), then one real model run, and look at the result next to the reference. Grader routes are in `grader/INTEGRATION.md`.

## Useful Context
- The team builds with **Claude Code**. Logic, APIs and 2D web interfaces come together quickly; building 3D models or heavy rendering by hand is harder.
- Left out of the base stack until the core loop works: model tiers and credits (including Solana), Exa, ElevenLabs voice challenges, 3D challenges, SSOJet, Tiger Data.
- The main goal is the overall prize. Side prizes are nice to have.

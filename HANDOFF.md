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
- Folding tracks in where they fit naturally. For example, the grading engine could interest the CS Dept "best code" judges, OpenAI or Gemini could be models players prompt, and MongoDB could store data. `IDEAS.md` has a fuller list.

**Not yet decided:** stack, architecture, which model players prompt, how grading is measured, and how work is split. These are open for discussion.

---

## Useful Context
- The team builds with **Claude Code**. Logic, APIs and 2D web interfaces come together quickly; building 3D models or heavy rendering by hand is harder.
- The main goal is the overall prize. Side prizes are nice to have.

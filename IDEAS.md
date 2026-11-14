# Project Ideas

_Chosen direction: **Idea #1**._

---

## 1. LeetCode for AI Prompting

- Users get a goal-state web page and pictures of that goal state.
- They prompt a small model to try to reproduce it.
- Results are graded on deterministic factors.
- A leaderboard ranks player scores, like LeetCode.
- Purpose: help people learn prompt engineering.

### Possible extra challenge types (optional)
- **3D challenges:** players prompt a model to write 3D scene code (e.g. Three.js) that matches a goal scene. Grading stays deterministic: render from fixed camera angles and compare images, and/or compare the scene structure (object types, positions, sizes, colors). The model produces the 3D content; we only build the renderer and grader.
- **Voice challenges (ElevenLabs):** players prompt to produce speech that matches a goal audio clip (words, pacing, pauses, delivery). Grading stays deterministic: compare the transcript (word error rate), duration, speaking rate, pause timing and pitch/energy profile using standard audio analysis.

### Possible track features (optional)
_Ways the tracks could fit in as features or build tools. None of these are decided._

| Track | Possible fit |
|---|---|
| CS Dept ($1,000, "best code") | The deterministic grading engine (e.g. DOM/structure diff, visual similarity scoring) is the core algorithm judges would look at |
| Future of Intelligence (OpenAI + Exa) | OpenAI models as a model players prompt; Exa to pull real web pages as new goal-state challenges |
| Gemini API (MLH) | Gemini as a model players prompt |
| MongoDB Atlas (MLH) | Store users, challenges, submissions and the leaderboard |
| Tiger Data (MLH) | Time-series of player scores and progress |
| Vultr (MLH) | Host the app |
| GoDaddy Registry (MLH) | The project's domain name |
| DEV Writing Challenge (MLH) | A write-up of the project on DEV |
| SSOJet | User login |
| SpaceXSI raffle (MLH) | Requires building with Cursor and Grok Bot |

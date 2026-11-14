# Project Ideas

_Brainstorm list. Nothing here is decided._

---

## 1. LeetCode for AI Prompting

- Users get a goal-state web page and pictures of that goal state.
- They prompt a small model to try to reproduce it.
- Results are graded on deterministic factors.
- A leaderboard ranks player scores, like LeetCode.
- Purpose: help people learn prompt engineering.

---

## Suggested Ideas (Claude brainstorm, optional)

_Picked to match the announced tracks and to stay logic- and API-heavy, with no 3D or heavy rendering. Track fit is based on the official track descriptions. Whether prizes can be combined is unconfirmed._

### 2. Brain-to-Speech Speller
Uses g.tec's P300 or SSVEP brain-signal datasets (and the Unicorn EEG on site) to pick letters from a 2D grid. An LLM autocompletes words and phrases, and ElevenLabs speaks the result. Pitched as assistive tech for people who can't speak or type.
- **Tracks:** Mind and Machine, ElevenLabs, Future of Intelligence, CS Dept
- **Why it's buildable:** signal classification and UI are logic-heavy Python/JS; the datasets are provided; the speller grid is flat 2D.

### 3. Great Lakes Watch
An AI agent that answers questions about Michigan's environment (algal blooms, lake ice, wildfire smoke, Detroit heat) by pulling NASA data (MODIS, Landsat, NASA APIs) and live news via Exa. Answers come with cited sources and a 2D map layer.
- **Tracks:** Beyond the Horizon, Future of Intelligence, CS Dept
- **Why it's buildable:** API calls, data processing and an agent loop; the map is an off-the-shelf 2D library (e.g. Leaflet).

### 4. Live Claim Checker
Paste or speak a claim, a URL or a transcript. An agent breaks it into individual claims, searches the live web with Exa, and returns verdicts with citations and confidence. A history view shows trends.
- **Tracks:** Future of Intelligence, ElevenLabs (voice input/output, optional), CS Dept
- **Why it's buildable:** almost entirely agent logic and text processing.

### 5. Lightning Split
A Breez SDK app for one of Breez's 10 everyday-money bounties (e.g. instant bill splitting or student micro-payments), with the required build write-up.
- **Tracks:** Future of Money (every entry that meets Breez's standard wins a bounty), CS Dept
- **Why it's buildable:** a starter template is provided; mostly app and payment logic.

### 6. Quantum Puzzle Game
A 2D circuit-building puzzle game. Players drag gates onto qubit wires to reach a target state, the Quantum Rings SDK simulates the circuit, and each level explains the concept in plain words.
- **Tracks:** Quantum Computing, CS Dept
- **Why it's buildable:** a grid UI plus simulation calls; no 3D.

### Possible add-ons for any idea
Voice via ElevenLabs, a database on MongoDB Atlas, login via SSOJet, and a custom domain from GoDaddy Registry. Each matches a "Best Use of" prize, so they're worth adding only if they fit naturally.

# Brief: project instructions for a coding agent

Get the model to write `AGENTS.md` for **Trailpost**, a small static site of hiking trail notes (Vite + TypeScript, Node 20).

The player is given these facts and must get them all into the document, in sections a coding agent can scan:

- Install with `npm ci`. Dev server: `npm run dev` (port 5173). Tests: `npm test` (Vitest). Lint: `npm run lint`. Build: `npm run build`, output in `dist/`.
- Pages live in `src/pages/`, shared components in `src/components/`, data in `src/data/`.
- Rules: never edit `dist/`; ask before adding a dependency; never commit `.env`.
- Before finishing: run the tests and the linter.
- npm only (no yarn or pnpm). Keep it under about 450 words.

Expected sections: a title and one-line description, Overview, Setup, Commands, Project layout, Rules, Testing.

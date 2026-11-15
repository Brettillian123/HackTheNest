# AGENTS.md: Trailpost

Instructions for AI coding agents working on Trailpost, a static hiking-trail notes site made with Vite and TypeScript.

## About

Trailpost has no server. Each page is a TypeScript module that renders HTML when the site is built, and the trail data is a JSON file under `src/data/`.

## Getting started

You need Node.js 20. Then install exactly what the lockfile says:

```bash
npm ci
```

## Everyday commands

```bash
npm run dev     # local server at http://localhost:5173
npm test        # unit tests (Vitest)
npm run lint    # ESLint plus type checks
npm run build   # production build, written to dist/
```

## Where things live

- `src/pages/` holds the pages, one file per URL.
- `src/components/` holds shared UI such as the trail card.
- `src/data/` holds the trail data.

## Ground rules

- `dist/` is generated. Do not edit anything in it.
- Do not add a dependency without asking first.
- `.env` must never be committed or shown.
- Use npm for everything.

## Before you finish

1. `npm test` passes.
2. `npm run lint` reports no errors.

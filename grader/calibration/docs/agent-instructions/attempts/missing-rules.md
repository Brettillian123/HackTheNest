# Trailpost

Trailpost is a small static website of hiking trail notes, built with Vite and TypeScript. These are the working instructions for coding agents in this repository.

## Overview

- Pages are TypeScript modules that render HTML at build time.
- There is no backend; trail data lives in `src/data/trails.json`.

## Setup

Use Node 20. Install dependencies from the lockfile:

```bash
npm ci
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Starts the dev server on port 5173 |
| `npm test` | Runs the Vitest unit tests once |
| `npm run lint` | Runs ESLint and the TypeScript checker |
| `npm run build` | Builds the site into `dist/` |

## Project layout

- `src/pages/`: one file per page; the file name is the URL.
- `src/components/`: shared pieces such as the header and the trail card.
- `src/data/`: trail data as JSON.

## Testing

Before you say a change is done:

1. Run `npm test` and make sure every test passes.
2. Run `npm run lint` and fix every error.

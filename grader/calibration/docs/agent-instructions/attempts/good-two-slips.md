# Trailpost

Trailpost is a static site of hiking trail notes built with Vite and TypeScript. This file tells coding agents how to work here.

## Overview

- Pages render HTML at build time; there is no backend.
- Trail data lives in `src/data/`.

## Setup

Install the dependencies:

```bash
npm ci
```

## Commands

- `npm run dev` starts the dev server on port 5173.
- `npm test` runs the unit tests.
- `npm run lint` runs ESLint and type checks.
- npm run build builds the site into the dist folder.

## Project layout

- `src/pages/`: one file per page.
- `src/components/`: shared components.
- `src/data/`: trail data.

## Rules

- Never edit files in `dist/`; the build creates them.
- Ask before adding a dependency.
- Never commit `.env`.

## Testing

Before finishing, run `npm test` and `npm run lint`, and fix anything they report.

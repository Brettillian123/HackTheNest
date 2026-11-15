# Trailpost

Trailpost is a static site of hiking trail notes built with Vite and TypeScript. These are the instructions for coding agents.

## Overview

- Pages render HTML at build time; there is no backend.
- Trail data lives in `data/trails.json`.

## Setup

Use Node 18. Install the dependencies:

```bash
yarn install
```

## Commands

| Command | What it does |
|---|---|
| `yarn dev` | Starts the dev server on port 3000 |
| `yarn test` | Runs the Jest tests |
| `yarn lint` | Runs ESLint |
| `yarn build` | Builds the site into `build/` |

## Project layout

- `pages/`: one file per page.
- `components/`: shared components.

## Rules

- Never edit files in `build/`.
- Ask before adding a dependency.
- Never commit `.env`.

## Testing

Before finishing, run `yarn test` and `yarn lint` and fix every error.

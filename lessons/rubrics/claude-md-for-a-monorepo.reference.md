# CLAUDE.md for trailmap

How Claude Code works in the trailmap monorepo. Notes shared by every agent are in AGENTS.md, imported here:

@AGENTS.md

## Overview

trailmap is a pnpm workspace with a web app and an API. Each package has its own tests.

## Commands

Run these from the repository root:

```bash
pnpm install              # install every package
pnpm --filter web test    # test the web app only
pnpm --filter api test    # test the API only
pnpm lint                 # lint the whole workspace
pnpm codegen              # regenerate the API client
```

## Layout

- `apps/web/`: the web app.
- `apps/api/`: the API server.
- `packages/client/src/generated/`: the API client, written by `pnpm codegen`.

## Rules

- Use pnpm only. Never run npm or yarn; the lockfile is `pnpm-lock.yaml`.
- Never edit `packages/client/src/generated/` by hand. Change the API, then run `pnpm codegen` to rebuild the generated client.
- Test only the packages you changed, each with its own filter command.

## Done means

1. The test command for each package you changed passes.
2. `pnpm lint` reports no problems.
3. If the API changed, `pnpm codegen` has been run.

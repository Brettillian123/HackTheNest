---
name: deploy-staging
description: Builds the app, deploys it to the staging server and runs the staging smoke tests. Use when the user runs /deploy-staging to put the current branch on staging.
disable-model-invocation: true
---

# Deploy to staging

Puts the current branch on the staging server and checks that it works. Only a person starts this skill.

## Steps

1. Run `git status --porcelain`. If it prints anything, stop and ask the user to commit or stash first.
2. Build the app with `npm run build`.
3. Deploy with `npm run deploy:staging`.
4. Run the smoke tests with `npm run smoke:staging`.
5. Tell the user whether the smoke tests passed.

## Rules

- Never deploy to production. This skill is for staging only.
- Never skip the smoke tests.

## If something fails

If the deploy or the smoke tests fail, follow `references/rollback.md`, then stop and report what failed.

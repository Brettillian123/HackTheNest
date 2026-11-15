---
name: release-notes
description: Writes release notes from the commits since the last git tag and adds them to CHANGELOG.md. Use when the user asks for release notes or a changelog entry.
---

# Release notes

Turns the commits since the last tag into an entry at the top of `CHANGELOG.md`.

## When to use

- The user asks for release notes or a changelog entry.

## Inputs

- The new version number (ask if it is not given).

## Steps

1. Find the last tag with `git describe --tags --abbrev=0`.
2. List the commits since that tag with `git log --oneline`.
3. Sort each commit into a category: Added, Changed or Fixed.
4. Insert the entry at the top of `CHANGELOG.md`.

## Rules

- Skip merge commits.
- Never invent a change that is not in the commit list.
- Do not tag, push or publish anything.

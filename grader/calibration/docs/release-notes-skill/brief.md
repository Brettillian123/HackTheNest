# Brief: a skill that writes release notes

Get the model to write `SKILL.md` for a skill named `release-notes`.

- Front matter: `name` (lowercase words joined by hyphens) and `description` (at most 300 characters; says what the skill does and when to use it, and mentions release notes and the changelog).
- What it does: finds the last tag with `git describe --tags --abbrev=0`, lists commits since then with `git log --oneline`, sorts them into Added, Changed and Fixed, and writes a new entry at the top of `CHANGELOG.md`.
- Entry format: a heading `## [x.y.z] - YYYY-MM-DD`, then `### Added`, `### Changed`, `### Fixed`, one line per change.
- Rules: skip merge commits; never invent changes; never push, tag or publish.
- Expected sections: title and one-line description, When to use, Inputs, Steps, Output format, Rules. Under about 400 words.

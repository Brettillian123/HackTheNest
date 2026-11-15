# Findings: which instructions file each coding tool reads

Answers the team's question from the official docs of our three coding tools.

## Question

Which project instructions file does each of our three coding tools read?

## Answer

Claude Code reads `CLAUDE.md`, OpenAI Codex reads `AGENTS.md`, and Gemini CLI reads `GEMINI.md`. Claude Code also falls back to `AGENTS.md` when a project has no `CLAUDE.md`.

## Claims

| Claim | Source |
| --- | --- |
| Claude Code reads `CLAUDE.md`, and reads `AGENTS.md` instead when there is no `CLAUDE.md`. | Source 1 |
| OpenAI Codex reads `AGENTS.md`, up to 32 KiB combined by default. | Source 2 |
| Gemini CLI reads `GEMINI.md`; other names can be added with `context.fileName`. | Source 3 |

## Sources

1. Claude Code: https://code.claude.com/docs/en/memory
2. OpenAI Codex: https://learn.chatgpt.com/docs/agent-configuration/agents-md
3. Gemini CLI: https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/gemini-md.md

## Not verified

- Whether the free tier of any tool behaves differently. Nobody has checked this.

## Cross-check

- Each claim in the table was compared with the page it cites.
- Every claim has exactly one source, and every source supports at least one claim.

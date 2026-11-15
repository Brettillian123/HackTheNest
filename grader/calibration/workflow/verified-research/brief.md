# Research, verify, then publish

Lesson: 08 self-research and verification (and 06 for the shape). The player prompts a model to plan, as JSON, a findings report where every claim is verified before publishing.

- Question: which project-instruction files do Claude Code, OpenAI Codex and Gemini CLI read?
- Two researchers in parallel: `notes/sources-a.md` (Claude Code, Codex) and `notes/sources-b.md` (Gemini CLI).
- A writer drafts `report/draft.md`; a verifier (kind "review") checks every claim against its source; the draft is revised; `report/FINDINGS.md` is published last.
- Every step has an owner, `changes`, `dependsOn`, a proof and a budget. Limits: at most 10 steps, 6 owners.

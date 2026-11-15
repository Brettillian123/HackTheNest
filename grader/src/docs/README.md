# Document grader

Scores a document a model wrote against a rubric the challenge author wrote. It handles project instructions for coding agents (`CLAUDE.md`, `AGENTS.md`), READMEs, skill files (`SKILL.md`) and MCP tool lists (JSON). No AI and no network: the same input always gives the same score.

```ts
import { gradeDoc } from './src/docs/index';
const result = gradeDoc({ kind: 'instructions', rubric, candidate: markdown });
result.total;     // 0 to 100
result.feedback;  // [{ message, points }], most costly first, at most eight
```

`kind` is `instructions`, `readme`, `skill` or `mcp-tools`. A malformed rubric throws `DocRubricError`, which lists every problem: it is the author's mistake, never a zero for the player. An empty or unreadable document scores 0 with the reason in `error`.

## Writing a rubric

All the judgement about one challenge lives in its rubric. Be specific: each item becomes a feedback line the player can act on. Example (from `calibration/docs/agent-instructions/rubric.json`, shortened):

```json
{
  "sections": [
    { "name": "Setup", "aliases": ["Getting started", "Install", "Installation"], "importance": "critical" },
    { "name": "Rules", "aliases": ["Conventions", "Guidelines", "Ground rules"], "importance": "major", "mustContain": ["dependency", "ask"] }
  ],
  "keyFacts": [
    { "label": "the install command", "anyOf": ["npm ci"], "importance": "critical", "inCode": true, "section": "Setup" },
    { "label": "the test command", "anyOf": ["npm test", "npm run test"], "importance": "critical", "inCode": true }
  ],
  "forbidden": [{ "label": "a yarn or pnpm command", "pattern": "\\b(yarn|pnpm)\\s+(install|add|run|test)\\b" }],
  "limits": { "maxWords": 450, "minWords": 150 },
  "order": ["Setup", "Rules"]
}
```

- **sections**: a section is found by a heading equal to its `name` or an alias, or containing one as whole words (case, punctuation and leading numbers ignored). List the headings a fair reader would accept. `mustContain` lists words the section must mention; each matches the start of a word, so `dependency` also accepts "dependencies" and `test` accepts "tests".
- **keyFacts**: things that must appear exactly: commands, paths, names, numbers. `label` reads after "is missing", so write "the install command". `anyOf` lists every acceptable spelling. `inCode` asks for a code span or block. `section` asks for it inside that section (for `mcp-tools`, inside that tool's descriptions).
- **forbidden**: regular expressions matched line by line, case ignored. Match the bad instruction, not the topic: `\byarn install\b`, not `yarn`, because "never use yarn" is a good line.
- **limits**: word budget (`maxWords`, `minWords`) and `maxLineLength` (code, tables and lone links are exempt).
- **frontMatter** (skills): `{ "key": "description", "required": true, "maxLength": 300, "mustMention": ["changelog"] }`. `pattern` is case-sensitive.
- **order**: section names that must appear in this order.
- **tools** (`mcp-tools`): `{ "name": "search_orders", "mustDescribe": ["email"], "params": [{ "name": "limit", "type": "integer", "required": false }] }`. Leave `sections` empty.
- **importance**: weighs a section or fact: critical 1.5, major 1.25, normal 1, minor 0.75.

Check the rubric by grading your own model answer: it should score exactly 100. `npx tsx src/docs/calibrate.ts --verbose` does that for every challenge under `calibration/docs/` and compares attempts with their human bands.

## What each criterion measures

Total = 100 × (0.40 works + 0.25 looks + 0.35 engineering × works). Works is a product of its criteria (a missing section is an obvious flaw however tidy the rest is); engineering is its weakest criterion.

| Pillar | Criterion | Measures |
|---|---|---|
| works | keyFacts | Each fact present, exactly, in code and in its section where required. |
| works | completeness | Each section present, not empty, not just a placeholder or a restated heading, and mentioning its `mustContain` words. For tools: each tool present and described. |
| works | structure | One top-level title first, no skipped heading levels, sections in `order`. For tools: every tool and parameter with the right name, type and required flag. |
| engineering | validity | Front matter parses and meets its rules; code fences closed; bare commands put in code; `#links` point at real headings. For tools: valid JSON, unique well-formed names, object schemas with typed properties and a real `required` list. |
| engineering | concision | Inside the word budget; no sentence or bullet repeated; no section that opens by restating its heading; no stock filler phrases. |
| engineering | cleanliness | No placeholders (TODO, TBD, lorem ipsum, `your-...-here`, `<insert ...>`, empty links), nothing the rubric forbids, nothing that looks like a secret. |
| looks | scannable | Headings, a description under the title, steps as lists, no walls of text, items as lists or tables, lines within the limit. For tools: tools and parameters described. |
| looks | consistency | One heading style, one bullet marker, shell code blocks labelled. For tools: one naming style. |

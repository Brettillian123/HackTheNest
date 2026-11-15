---
title: "MCP, part two: defining tools well"
slug: mcp-defining-tools
level: 2
minutes: 30
summary: Define MCP tools a model can choose and call correctly, with clear names, useful descriptions, strict input schemas and errors it can recover from.
bonusChallenge: library-tools
grader: doc
---

# MCP, part two: defining tools well

## What you will be able to do

- Write a tool definition with the fields the MCP spec defines.
- Write a description that says what the tool does and when to use it.
- Write an input schema that rejects bad calls before they run.
- Return errors the model can read and fix, and keep the set of tools small.

## Why it matters

The model chooses and calls a tool from its name, description and schema alone. Given `search` and `find`, it picks at random. Given a date field that is just `"type": "string"`, it sends "next Tuesday", gets a stack trace, and repeats the call. A `format` hint and an error saying "dates must be YYYY-MM-DD" turn that into one retry that works.

## The ideas

### The fields of a tool

From the MCP specification (version `2026-07-28`):

| Field | Required | What it is |
| --- | --- | --- |
| `name` | Yes | Unique within the server. Should be 1 to 128 characters, using only `A-Z`, `a-z`, `0-9`, `_`, `-` and `.`; no spaces. Case-sensitive. |
| `title` | No | A display name for people. |
| `description` | No in the schema, but always write one | What it does; the model's main hint. |
| `inputSchema` | Yes | A JSON Schema object with `"type": "object"` at the root. Defaults to JSON Schema 2020-12. |
| `outputSchema` | No | A JSON Schema for `structuredContent` in the result. |
| `annotations` | No | Hints: `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`, `title`. |

For a tool with no inputs, the spec recommends `{ "type": "object", "additionalProperties": false }`.

### Names

Use a clear verb and object, and group related tools with a shared prefix: `notes_search`, `notes_get`, `notes_create`. The spec's architecture guide prefers `calculator_arithmetic` to a bare `calculate`. When a host connects many servers, two servers may both offer `search`; a prefix helps.

### Descriptions

Write it like a note to a new teammate. Say:

1. what the tool does;
2. when to use it, and when to use a different tool instead;
3. anything about the inputs that is not obvious (format, limits, units);
4. what it returns.

Name parameters plainly: `user_id`, not `user`.

### Input schemas

- Mark what is `required`.
- Use `enum` for a fixed set of values.
- Use `minimum`, `maximum`, `maxLength` and `format` where they apply.
- Set `"additionalProperties": false` so made-up arguments are rejected.
- Give every property a `description`.

### Errors the model can recover from

The spec has two kinds:

- **Protocol errors** (JSON-RPC errors) for an unknown tool or a malformed request. The model is less likely to recover.
- **Tool execution errors**, returned as a normal result with `"isError": true` and a text message. The spec says these carry "actionable feedback" and that clients should pass them to the model so it can correct itself.

A good execution error says what was wrong and what would work: "No note with id 'n_99'. Use notes_search to find ids." A bad one is "Error 500".

### Small surface area

Fewer, well-chosen tools beat one per API endpoint; Anthropic's tool-writing guide warns that too many or overlapping tools distract agents. Return what the model needs and limit long results.

### Annotations are hints

`readOnlyHint: true` tells a client a tool does not change anything. Clients must treat annotations as untrusted unless the server is trusted, so they help a careful client but are not a safety control.

### Worked example

A complete JSON list of tool definitions for a personal notes server:

```json
[
  {
    "name": "notes_search",
    "title": "Search notes",
    "description": "Search the user's notes by words in the title or body. Use this to find a note's id before calling notes_get. Returns up to `limit` matches, newest first, each with id, title and date.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": { "type": "string", "minLength": 1, "maxLength": 200, "description": "Words to look for." },
        "limit": { "type": "integer", "minimum": 1, "maximum": 50, "default": 10, "description": "Most results to return." }
      },
      "required": ["query"],
      "additionalProperties": false
    },
    "annotations": { "readOnlyHint": true, "openWorldHint": false }
  },
  {
    "name": "notes_get",
    "title": "Get a note",
    "description": "Return the full text of one note by its id. Use notes_search first if you do not know the id.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "note_id": { "type": "string", "pattern": "^n_[0-9]+$", "description": "Note id, such as n_42." }
      },
      "required": ["note_id"],
      "additionalProperties": false
    },
    "annotations": { "readOnlyHint": true, "openWorldHint": false }
  },
  {
    "name": "notes_create",
    "title": "Create a note",
    "description": "Create a new note. Use only when the user asks to save something. Does not change existing notes. Returns the new note's id.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "title": { "type": "string", "minLength": 1, "maxLength": 120, "description": "Short title." },
        "body": { "type": "string", "maxLength": 20000, "description": "Note text in Markdown." }
      },
      "required": ["title", "body"],
      "additionalProperties": false
    },
    "annotations": { "readOnlyHint": false, "destructiveHint": false, "idempotentHint": false, "openWorldHint": false }
  }
]
```

## Common mistakes

1. **Vague names.** `do_action`, `helper`. Fix: verb plus object, with a shared prefix.
2. **Descriptions that only restate the name.** "Gets a note." Fix: add when to use it, input rules and what it returns.
3. **Loose schemas.** No `required`, no limits, extra properties allowed. Fix: `required`, `enum`, ranges, `"additionalProperties": false`.
4. **Errors as protocol failures.** Throwing for a bad date gives the model nothing to fix. Fix: return `isError: true` with a message saying what would work.
5. **Too many tools.** Twenty thin wrappers. Fix: combine into a few tools that match real tasks.
6. **Trusting annotations for safety.** Fix: ask for confirmation on risky calls whatever the hints say.

## Try it: bonus challenge

**Situation.** A school library wants an MCP server so a model can help students. It must let the model search the catalogue by title or author, get one book's details by its id (ids look like `bk_1234`), and place a hold on a book for a student (student ids look like `st_5678`). Searching and getting change nothing; placing a hold adds a record.

**Your task.** Write a prompt that gets the model to produce a JSON list of exactly three tool definitions: `library_search`, `library_get_book` and `library_place_hold`.

**Graded on:**

- The output is a valid JSON array of three objects with exactly those names.
- Each has a `description` of at least 60 characters that contains "Use".
- Each `inputSchema` is valid JSON Schema with `"type": "object"`, a `required` list and `"additionalProperties": false`.
- `library_search` has a `field` property with `enum` `["title", "author"]`.
- The id properties use `pattern` values matching `bk_` and `st_` ids.
- Search and get have `"readOnlyHint": true`; place hold has `"readOnlyHint": false` and `"destructiveHint": false`.

## Prompting tips for this challenge

- Give the three names exactly. Ask for nothing else in the output: no prose, no code fence, just the JSON.
- State the id formats so the model writes the patterns.
- Ask for each description to say what the tool does, when to use it, and what it returns.
- List the schema rules you want (`required`, `additionalProperties`, `enum`).
- Say which tools change data, so the annotations are right.

## Sources

- MCP specification, tools: https://modelcontextprotocol.io/specification/latest/server/tools
- MCP specification, schema reference (Tool and ToolAnnotations): https://modelcontextprotocol.io/specification/latest/schema
- MCP, architecture overview: https://modelcontextprotocol.io/docs/learn/architecture
- Anthropic, writing effective tools for agents: https://www.anthropic.com/engineering/writing-tools-for-agents

---
title: "MCP, part two: defining tools well"
slug: mcp-defining-tools
level: 2
minutes: 50
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
- Repair a badly defined tool, and explain each change.

## Why it matters

The model chooses and calls a tool from its name, description and schema alone. Given `search` and `find`, it picks at random. Given a date field that is just `"type": "string"`, it sends "next Tuesday", gets a stack trace, and repeats the call. A `format` hint and an error saying "dates must be YYYY-MM-DD" turn that into one retry that works.

Think of a tool definition as a prompt you write once and the model reads on every turn. Everything in this course about clear prompts applies here: be specific, give formats, say what you want back, and leave nothing to guess. The difference is that the reader cannot ask you a question. If the definition is unclear, the model guesses, and the guess runs as real code.

## The ideas

### The fields of a tool

From the MCP specification (version `2026-07-28`):

| Field | Required | What it is |
| --- | --- | --- |
| `name` | Yes | Unique within the server. Should be 1 to 128 characters, using only `A-Z`, `a-z`, `0-9`, `_`, `-` and `.`; no spaces. Case-sensitive. |
| `title` | No | A display name for people. |
| `description` | No in the schema, but always write one | What it does; the model's main hint. |
| `icons` | No | Icons a host can show in its interface. |
| `inputSchema` | Yes | A JSON Schema object with `"type": "object"` at the root. Defaults to JSON Schema 2020-12. Must not be `null`. |
| `outputSchema` | No | A JSON Schema for `structuredContent` in the result. |
| `annotations` | No | Hints: `readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`, `title`. |

For a tool with no inputs, the spec recommends `{ "type": "object", "additionalProperties": false }`.

### Names

Use a clear verb and object, and group related tools with a shared prefix: `notes_search`, `notes_get`, `notes_create`. The spec's architecture guide prefers `calculator_arithmetic` to a bare `calculate`.

Names only have to be unique within one server. When a host connects many servers, two of them may both offer `search`. The spec says clients that combine servers should handle this, for example by adding a server prefix, and warns that a server's own name is not guaranteed to be unique either. A prefix of your own costs nothing and removes the doubt.

### Descriptions

Write it like a note to a new teammate. Say:

1. what the tool does;
2. when to use it, and when to use a different tool instead;
3. anything about the inputs that is not obvious (format, limits, units);
4. what it returns.

Name parameters plainly: `user_id`, not `user`. Put units in the name when they matter: `amount_cents`, `timeout_seconds`, `duration_minutes`. A parameter called `amount` invites the model to send `"12.50"`, `12.5` or `1250`, and all three look reasonable.

### Input schemas

- Mark what is `required`.
- Use `enum` for a fixed set of values.
- Use `minimum`, `maximum`, `maxLength` and `format` where they apply.
- Set `"additionalProperties": false` so made-up arguments are rejected.
- Give every property a `description`.
- Pick the narrowest type: `integer` for counts, `boolean` for yes or no, `array` with typed `items` for lists.

The schema is a contract the server can check before any work starts. The spec's security section says servers must validate all tool inputs; a strict schema is the cheapest way to start.

### Output schemas and structured results

A result can carry plain `content` (text, images, audio, links to resources) and, optionally, `structuredContent`: a JSON value a program can read. If a tool declares an `outputSchema`, the spec says the server must return structured results that match it, and clients should check them. For older clients, a tool that returns structured content should also return the same JSON as text.

### Errors the model can recover from

The spec has two kinds:

- **Protocol errors** (JSON-RPC errors) for an unknown tool, a malformed request or a server fault. The model is less likely to recover.
- **Tool execution errors**, returned as a normal result with `"isError": true` and a text message. The spec lists API failures, business-logic errors and input validation errors here (for example, a date in the wrong format or a value out of range), says these carry "actionable feedback", and says clients should pass them to the model so it can correct itself.

A good execution error says what was wrong and what would work: "No note with id 'n_99'. Use notes_search to find ids." A bad one is "Error 500".

### State across calls

MCP has no protocol session in this version, so a server cannot rely on the connection to remember what happened in the last call. The spec's guidance for tools that need state (a shopping basket, a draft, a held booking) is to return an explicit handle, such as `bsk_a1b2c3`, and take it back as an argument on later calls. It adds two points that belong in the description: say how long the handle lasts, so the model can see it before creating state, and return a clear execution error when a handle has expired, so the model can make a new one.

### Small surface area

Fewer, well-chosen tools beat one per API endpoint; Anthropic's tool-writing guide warns that too many or overlapping tools distract agents. Return what the model needs and limit long results.

### Annotations are hints

`readOnlyHint: true` tells a client a tool does not change anything. Clients must treat annotations as untrusted unless the server is trusted, so they help a careful client but are not a safety control.

### Worked example 1: a notes server

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

### Worked example 2: repairing a bad tool

A shop's support server has this tool. It works when a person tests it by hand, and fails in odd ways when a model uses it.

```json
{
  "name": "refund",
  "description": "Refunds an order.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "order": { "type": "string" },
      "amount": { "type": "string" },
      "why": {}
    }
  }
}
```

What goes wrong in practice: the model sends `"order": "the blue jacket one"`, `"amount": "$12.50"` or `"amount": "all"`, and invents a `"notify_customer": true` argument the server silently ignores. Nothing says a refund cannot be undone, so the model treats it as a casual step. When the order id is wrong, the server throws and the model sees a protocol error with nothing to act on.

The repair:

```json
{
  "name": "orders_refund",
  "title": "Refund an order",
  "description": "Refund part or all of one paid order to the customer's original payment method. Use only after the customer has asked for a refund and you have confirmed the order with orders_get. Cannot be undone. Amounts are in cents: 1250 means 12.50. Returns the refund id and the new order balance.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "order_id": { "type": "string", "pattern": "^ord_[0-9]+$", "description": "The order id, such as ord_10442. Get it from orders_search." },
      "amount_cents": { "type": "integer", "minimum": 1, "description": "Amount to refund in cents. Must not exceed the order's remaining balance." },
      "reason": { "type": "string", "enum": ["damaged", "wrong_item", "late", "other"], "description": "Why the customer wants the refund." }
    },
    "required": ["order_id", "amount_cents", "reason"],
    "additionalProperties": false
  },
  "annotations": { "readOnlyHint": false, "destructiveHint": true, "idempotentHint": false }
}
```

And when the order id does not exist, the server returns a tool execution error instead of throwing:

```json
{
  "content": [{ "type": "text", "text": "No order with id ord_10443. Use orders_search with the customer's email to find the right id." }],
  "isError": true
}
```

Why each change works:

1. **The name has a verb, an object and a prefix.** `orders_refund` sits next to `orders_get` and `orders_search` and cannot clash with a payments server's `refund`.
2. **The description says when, not just what.** "Use only after the customer has asked" and "confirmed the order with orders_get" give the model an order of steps. "Cannot be undone" tells it this is a step to take carefully.
3. **Units live in the name and the type.** `amount_cents` as an `integer` with `minimum: 1` rules out "$12.50", "all" and zero before the server does any work.
4. **The id has a pattern and a source.** The pattern rejects "the blue jacket one"; the description says which tool gives a real id.
5. **The reason is an `enum`.** Reports can count refunds by reason because the values are fixed.
6. **Everything is required and nothing extra is allowed.** The invented `notify_customer` argument is now rejected instead of ignored.
7. **The annotations are honest.** `destructiveHint: true` lets a careful client ask a person first. It is still a hint: the host decides whether to trust it.
8. **The error says what would work.** One retry with `orders_search` fixes the problem, instead of the model trying the same bad id again.

## Common mistakes

1. **Vague names.** `do_action`, `helper`. Fix: verb plus object, with a shared prefix.
2. **Descriptions that only restate the name.** "Gets a note." Fix: add when to use it, input rules and what it returns.
3. **Loose schemas.** No `required`, no limits, extra properties allowed. Fix: `required`, `enum`, ranges, `"additionalProperties": false`.
4. **Units left out.** `amount`, `timeout`. Fix: `amount_cents`, `timeout_seconds`.
5. **Errors as protocol failures.** Throwing for a bad date gives the model nothing to fix. Fix: return `isError: true` with a message saying what would work.
6. **Too many tools.** Twenty thin wrappers. Fix: combine into a few tools that match real tasks.
7. **Trusting annotations for safety.** Fix: ask for confirmation on risky calls whatever the hints say.

## Check your understanding

1. Which two fields must every tool definition have?

<details><summary>Answer</summary>

`name` and `inputSchema`. The input schema must be a JSON Schema object, not `null`. A description is optional in the schema but you should always write one.

</details>

2. A model calls your tool with `"date": "next Tuesday"`. Should the server return a protocol error or a tool execution error?

<details><summary>Answer</summary>

A tool execution error with `isError: true`. The spec lists input validation errors as execution errors, and a message like "dates must be YYYY-MM-DD" lets the model fix the call.

</details>

3. Why is `amount_cents` with type `integer` better than `amount` with type `string`?

<details><summary>Answer</summary>

The name gives the unit and the type rules out text such as "$12.50" or "all". The model has one obvious way to fill it in, and the schema can reject anything else before the tool runs.

</details>

4. Your booking tool returns a hold that lasts ten minutes. Where should that fact go, and why?

<details><summary>Answer</summary>

In the description of the tool that creates the hold. The spec's guidance on handles says to state the lifetime there, so the model sees it before it creates state. An expired hold should then return an execution error that says so.

</details>

5. You mark a tool `destructiveHint: true`. Does that stop a client calling it without asking?

<details><summary>Answer</summary>

No. Annotations are hints, and clients must treat them as untrusted unless the server is trusted. They help a careful client decide to ask a person; they are not a safety control.

</details>

## How this changes your prompts

When you ask a model to write tool definitions, you are prompting it to write prompts. Give it the facts and the rules it cannot guess.

Before:

```text
Write MCP tools for our weather API.
```

After:

```text
Write a JSON array of two MCP tool definitions, and nothing else.
weather_current: parameters city (string, required) and units (string, optional,
"celsius" or "fahrenheit", default celsius).
weather_forecast: parameters city (string, required), days (integer, required,
1 to 7) and units (string, optional).
Each description says what the tool does, when to use it (start that sentence
with "Use"), and what it returns. Every inputSchema has type object, a required
list and additionalProperties false.
```

Before:

```text
Make the error messages better.
```

After:

```text
For each way this tool can fail, write the text of an isError result that says
what was wrong and what the model should do next, naming the tool to call if
there is one. No stack traces, no error codes on their own.
```

The second versions work because they fix names, types and required flags, which are exactly the things a model would otherwise guess.

## Try it: three bonus challenges

Work through them in order. Each asks you to write a prompt; the model's output is a JSON list of tool definitions, and it is graded.

### Level 1: repair a weather tool

**Situation.** A teammate wrote one tool called `get` with the description "Gets weather." and three untyped properties: `city`, `days` and `units`. It mixes today's weather and forecasts. You want two clear tools instead: `weather_current`, with `city` (string, required) and `units` (string, optional: celsius or fahrenheit, default celsius); and `weather_forecast`, with `city` (string, required), `days` (integer, required, 1 to 7) and `units` (string, optional).

**Your task.** Get the model to produce a JSON array of exactly those two tool definitions.

**Graded on:**

- Both tools are present with exactly those names.
- Every parameter has the right name, type and required flag.
- Each description says when to use the tool (contains "use"); `weather_current` mentions current weather and celsius, `weather_forecast` mentions the forecast and "1 to 7" days.
- Each `inputSchema` is valid, with type object, typed properties and a required list.

### Level 2: a school library server

**Situation.** A school library wants an MCP server so a model can help students. It must let the model search the catalogue by title or author, get one book's details by its id (ids look like `bk_1234`), and place a hold on a book for a student (student ids look like `st_5678`). Searching and getting change nothing; placing a hold adds a record.

**Your task.** Get the model to produce a JSON list of exactly three tool definitions: `library_search` (parameters `query` and `field`), `library_get_book` (parameter `book_id`) and `library_place_hold` (parameters `book_id` and `student_id`), all strings and all required.

**Graded on:**

- The three tools are present with exactly those names, and every parameter has the right name, type and required flag.
- Each description says when to use the tool; search mentions title and author, get mentions the book, place hold mentions the hold and the student.
- `library_get_book` mentions the `bk_` id format and `library_place_hold` mentions the `st_` format.
- Each `inputSchema` is valid, with type object, typed properties and a required list.

### Level 3: a calendar booking server with handles

**Situation.** A calendar server books meetings in three steps, and holds a slot between finding and confirming it. The tools: `calendar_find_slots` with `attendees` (array of email addresses, required), `duration_minutes` (integer, required), `earliest_date` (string, required, YYYY-MM-DD) and `latest_date` (string, optional, YYYY-MM-DD); it changes nothing and returns slot ids. `calendar_hold_slot` with `slot_id` (string, required); it holds the slot and returns a hold id starting `hold_` that expires after 10 minutes. `calendar_confirm_booking` with `hold_id` (string, required), `title` (string, required) and `notify` (boolean, optional); it turns a hold into a booking and returns a booking id starting `evt_`. `calendar_cancel_booking` with `booking_id` (string, required) and `reason` (string, optional); it cancels a booking, tells the attendees, and cannot be undone.

**Your task.** Get the model to produce a JSON array of exactly those four tool definitions.

**Graded on:**

- All four tools with exactly those names, and every parameter with the right name, type and required flag (`attendees` is an array, `duration_minutes` an integer, `notify` a boolean).
- Each description says when to use the tool; find slots mentions slots, hold slot mentions that the hold expires, confirm mentions the hold, cancel mentions the attendees.
- `calendar_find_slots` mentions the YYYY-MM-DD format; `calendar_hold_slot` says the hold lasts 10 minutes; `calendar_confirm_booking` mentions `hold_` ids; `calendar_cancel_booking` mentions `evt_` ids and says it cannot be undone.
- Each `inputSchema` is valid, with type object, typed properties and a required list.

The grader does not check `enum`, `pattern`, `additionalProperties` or annotation values, but a good answer still uses them, as the worked examples do.

## Prompting tips for these challenges

- Give every name exactly: tools and parameters. Ask for nothing else in the output: no prose, no code fence, just the JSON.
- Give each parameter's type and whether it is required. The grader checks both.
- State id formats, date formats and lifetimes, and say which description each belongs in.
- Ask for each description to say what the tool does, when to use it, and what it returns.
- Say which tools change data, so the annotations are right.

## Go deeper

### Official documentation

- [MCP: build an MCP server](https://modelcontextprotocol.io/docs/2026-07-28/develop/build-server). The official tutorial, from an empty folder to a working server with tools. Read it to see definitions in real code.
- [Claude: define tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools). Anthropic's guidance on tool names, descriptions and schemas for Claude. Read the advice on detailed descriptions.
- [OpenAI: function calling](https://developers.openai.com/api/docs/guides/function-calling). Another vendor's take on the same problem. Read it to see which advice every vendor agrees on.

### Specifications and standards

- [MCP specification: tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools). The tool fields, name rules, output schemas, error kinds and the guidance on stateful tools. Read "Tool Names", "Stateful Tools" and "Error Handling".
- [MCP specification: schema reference](https://modelcontextprotocol.io/specification/2026-07-28/schema). Every type in the protocol, including `Tool` and `ToolAnnotations`. Use it to check a field name.
- [JSON Schema reference](https://json-schema.org/understanding-json-schema/reference). A readable guide to types, `enum`, ranges, `pattern` and `required`. Read the pages on objects and strings.
- [JSON Schema 2020-12: validation vocabulary](https://json-schema.org/draft/2020-12/json-schema-validation). The formal definition of the keywords MCP schemas use by default. Use it when the guide is not precise enough.

### Engineering write-ups from the people who build these tools

- [Anthropic: writing effective tools for AI agents](https://www.anthropic.com/research/writing-tools-for-agents). How Anthropic designs, tests and improves tools with evaluations. The best single read for this lesson.
- [Anthropic: building effective agents](https://www.anthropic.com/research/building-effective-agents). When agents help and when simple workflows are better, with an appendix on prompt engineering your tools. Read the appendix.
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) and [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk). The official libraries for writing servers. Read the README examples of tool definitions.

### Books, papers and API design guides on the underlying ideas

- [Google AIP-193: errors](https://google.aip.dev/193). Google's API design rules for error messages people and programs can act on. Read it next to the execution-error section above.
- [RFC 9457: Problem Details for HTTP APIs](https://www.rfc-editor.org/info/rfc9457/). The web standard for machine-readable error bodies. Read it for the idea of an error that says what went wrong and where to look.
- [Patil et al., "Gorilla"](https://arxiv.org/abs/2305.15334). A study of models calling large sets of real APIs, and of how often they make up API calls that do not exist. Read it for why exact names and strict schemas matter.

Links checked on 2026-11-15.

## Sources

- MCP specification, tools (fields, names, output schemas, error kinds, stateful tools, security considerations): https://modelcontextprotocol.io/specification/latest/server/tools
- MCP specification, schema reference (Tool and ToolAnnotations): https://modelcontextprotocol.io/specification/latest/schema
- MCP, architecture overview: https://modelcontextprotocol.io/docs/learn/architecture
- Anthropic, writing effective tools for agents: https://www.anthropic.com/engineering/writing-tools-for-agents

---
title: "MCP, part one: giving a model tools"
slug: mcp-using-servers
level: 2
minutes: 25
summary: Learn what the Model Context Protocol is, how a client talks to a server, and what to check before you trust one.
bonusChallenge: mcp-server-trust-note
grader: doc
---

# MCP, part one: giving a model tools

## What you will be able to do

- Explain hosts, clients and servers, and the three things a server offers: tools, resources and prompts.
- Follow how a client finds and calls a tool.
- Add a server to a coding tool with an exact command.
- Check a server before you connect it.

## Why it matters

Connect a model to a server and it can read your database, open tickets or run commands. A server you have not checked runs with your permissions: the protocol's own security guide shows a start-up command that quietly sends your SSH key to another machine. Knowing what to check stops you installing one blind.

## The ideas

### The parts

The Model Context Protocol (MCP) is an open protocol for giving AI applications context and actions.

- **Host:** the AI application, such as Claude Code, Claude Desktop or VS Code.
- **Client:** a connection object inside the host. The host makes **one client per server**.
- **Server:** a program that offers context or actions. It can run locally or remotely.

Two transports carry the messages:

- **stdio:** the host starts the server as a local process and talks over standard input and output. Usually one client.
- **Streamable HTTP:** the server runs elsewhere and is reached over HTTP. Usually many clients. The spec recommends OAuth for getting tokens.

Messages are JSON-RPC 2.0.

### What a server offers

| Primitive | What it is | Who decides to use it |
| --- | --- | --- |
| Tools | Functions the model can call: search flights, send a message, query a table | The model |
| Resources | Read-only data with a URI, such as `file:///path/to/doc.md` | The application |
| Prompts | Reusable templates the user picks, often as slash commands | The user |

Each has list methods (`tools/list`, `resources/list`, `prompts/list`) and fetch or run methods (`tools/call`, `resources/read`, `prompts/get`).

### How a client uses a server

1. **Discover (optional).** The client may send `server/discover` to learn the versions and capabilities the server supports.
2. **List.** It sends `tools/list` and gets back each tool's name, description and input schema.
3. **Offer.** The host adds those tools to what the model can use.
4. **Call.** When the model picks a tool, the client sends `tools/call` with the name and arguments, and passes the result back to the model.

This follows spec version `2026-07-28`, where each request carries its own version and capabilities and there is no session (`2025-11-25` and earlier had sessions). Whether a given SDK or client supports the newest version is unconfirmed; check its release notes.

### Adding a server (Claude Code example)

Claude Code adds servers with `claude mcp add`. The `--` separates Claude's options from the server's own command.

```bash
# a local stdio server
claude mcp add --transport stdio <name> -- <command> [args...]

# a remote HTTP server, shared with the team through .mcp.json
claude mcp add --transport http --scope project <name> <url>
```

`--scope project` writes `.mcp.json` at the project root so the team shares it; Claude Code asks for approval before using project servers from that file. Inside a session, `/mcp` shows server status. Other hosts use their own settings files; check their docs.

### What to check before trusting a server

From the MCP security guidance and the tools spec:

- **Read the exact start command,** arguments included. Watch for `sudo`, `rm -rf`, network calls, or access to your home folder.
- **Know who publishes it.** It runs with your privileges.
- **List its tools.** A weather server has no reason to write files.
- **Treat annotations as claims.** The spec says hints such as `readOnlyHint` are untrusted unless the server is trusted.
- **Keep a human in the loop.** The spec says there should always be a way to deny a tool call.
- **Watch for prompt injection.** Claude Code's docs warn that servers fetching outside content can carry instructions aimed at the model.
- **Grant narrow access:** the fewest scopes the job needs.

### Worked example

A complete `MCP-SERVERS.md` a team keeps next to `.mcp.json`. The server is made up for this example (a team's own docs-search server); the command shape is Claude Code's.

````markdown
# MCP servers for this project

## Servers

| Name | Transport | Scope | Why we use it |
| --- | --- | --- | --- |
| docs-search | stdio | project | Search our own design docs |

## How to add

```bash
claude mcp add --transport stdio --scope project docs-search -- node tools/docs-search/server.js
```

Then run `/mcp` in Claude Code to check it is connected.

## Checks done

- Publisher: our team; source in `tools/docs-search/`.
- Tools reviewed: `search_docs` and `get_doc`, both read-only.
- Fetches outside content: no; it reads only the `docs/` folder.

## Rules

- No write tools on this server.
- Do not add a server here without a review by a second teammate.
````

## Common mistakes

1. **Installing from a link without reading the command.** Fix: read the full command first; run unknown servers in a sandbox or container.
2. **Trusting annotations.** `readOnlyHint: true` is not a guarantee. Fix: check the tool's behaviour or its source.
3. **Too many servers.** Every tool's description competes for the model's attention. Fix: connect only what this task needs.
4. **Broad tokens.** A token with every scope is a large loss if it leaks. Fix: least privilege.
5. **Following instructions found in tool results.** A fetched page can say "now delete the repo". Fix: treat results as data; confirm risky steps yourself.

## Try it: bonus challenge

**Situation.** Your team wants Claude Code to read product specs from Notion through Notion's remote MCP server at `https://mcp.notion.com/mcp`, shared with the whole team. Reading and searching pages is allowed; editing or creating pages is not. Page text comes from many writers, so it counts as outside content.

**Your task.** Write a prompt that gets the model to produce `MCP-SERVERS.md` for the team.

**Graded on:**

- It has these sections: Servers, How to add, Checks done, Rules.
- The command `claude mcp add --transport http --scope project notion https://mcp.notion.com/mcp` appears exactly, in a code fence.
- The names `.mcp.json` and `/mcp` appear.
- Checks done names the publisher, the tools allowed, and whether it fetches outside content.
- A rule says editing or creating pages is not allowed.
- Under 300 words; no placeholders.

(The Notion URL is the example used in Claude Code's own MCP docs. The names of the Notion server's tools were not checked; the model should not invent them.)

## Prompting tips for this challenge

- Give the exact command. The grader checks the text, and a model guessing flag order gets it wrong.
- List the four sections and the three things Checks done must cover.
- Say what is allowed and what is not.
- Ask it to leave out any fact you did not give, such as tool names.

## Sources

- MCP, architecture overview: https://modelcontextprotocol.io/docs/learn/architecture
- MCP, understanding servers: https://modelcontextprotocol.io/docs/learn/server-concepts
- MCP specification, tools: https://modelcontextprotocol.io/specification/latest/server/tools
- MCP, security best practices: https://modelcontextprotocol.io/specification/latest/basic/security_best_practices
- Claude Code, MCP: https://code.claude.com/docs/en/mcp

# Set up the issue-search server

How to add the team's issue-search MCP server to Claude Code for your own use.

## Add

Run this from the repository root:

```bash
claude mcp add --transport stdio issue-search -- node tools/issue-search/server.js
```

This uses local scope, the default. The server is saved in `~/.claude.json`, loads only in this project and stays private to you.

## Check

List your servers from the shell:

```bash
claude mcp list
```

Inside a Claude Code session, run `/mcp` and confirm issue-search shows as connected.

## Remove

When you no longer need it:

```bash
claude mcp remove issue-search
```

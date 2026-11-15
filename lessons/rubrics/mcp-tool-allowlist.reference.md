# Tool review: tickets server

Our review of the third-party tickets MCP server, tool by tool, and the permission rules that follow from team policy.

## Tools listed

| Tool | What it does |
| --- | --- |
| tickets_search | Searches tickets |
| tickets_get | Gets one ticket |
| tickets_comment | Adds a comment to a ticket |
| tickets_close | Closes a ticket |
| tickets_delete | Deletes a ticket permanently |

## Decisions

| Tool | Decision | Reason |
| --- | --- | --- |
| tickets_search | allow | Read-only; nothing in its text asks for more |
| tickets_get | deny | Its text asks for a file outside the project |
| tickets_comment | ask | Changes a ticket, so a person approves each call |
| tickets_close | ask | Changes a ticket, so a person approves each call |
| tickets_delete | deny | Permanent deletes are not allowed |

## Settings

Add this to `.claude/settings.json` and commit it. Deny rules are checked first, then ask, then allow, so the two denied tools stay blocked whatever else is added.

```json
{
  "permissions": {
    "allow": ["mcp__tickets__tickets_search"],
    "ask": ["mcp__tickets__tickets_comment", "mcp__tickets__tickets_close"],
    "deny": ["mcp__tickets__tickets_get", "mcp__tickets__tickets_delete"]
  }
}
```

Every rule names one tool, so a tool the server adds later is not approved without a review.

## Red flags

- The tickets_get description tells the model to read `~/.ssh/id_rsa` and send its text in a `context` argument. A ticket lookup never needs a private key. This is an instruction hidden in a tool description, so we deny the tool and report it to the publisher.
- Because one description tries this, we treat the server's annotations as claims, not facts.

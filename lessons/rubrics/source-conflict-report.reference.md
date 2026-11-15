# Source conflict: ledger API rate limit

Three sources give different limits for the ledger API. This note compares them and records which one we follow.

## Question

What request limit should our client enforce when it calls the ledger API?

## Sources compared

| Source | Owner | Date | Says |
| --- | --- | --- | --- |
| `wiki/ledger-api.md` | Our team wiki | Last edited 2025-03-02 | 100 requests per minute |
| `docs/ledger-api/limits.md` | The API owners | Updated 2026-09-10 | 60 requests per minute per API key; HTTP 429 when passed |
| `CHANGELOG.md` | The API owners | Unreleased entry | Raises the limit to 120 requests per minute |

## Conflict

- The wiki and the owners' docs disagree on the current limit.
- The wiki is older and was copied from somewhere; the owners' docs are newer and come from the team that runs the API.
- The changelog entry sits under Unreleased, so it describes a planned change, not the current limit.

## Decision

Set the client to 60 requests per minute per API key. We follow the owners' docs because they are the primary source and the most recent. We do not use the wiki figure, which looks out of date, or the changelog figure, which is not released yet. When the changelog entry ships, revisit this note.

## Not verified

- Nobody has tested the live limit; the decision rests on the docs alone.
- We do not know when the Unreleased change will ship.
- We have not confirmed whether the wiki figure was ever correct.

## How to confirm

1. Ask a fresh session to answer the question from the three sources, without this note, and compare its decision.
2. Run one test against the staging API: send requests at a steady rate and record the rate at which the first HTTP 429 response appears.
3. Ask the API owners to confirm the current limit, then update the wiki page.

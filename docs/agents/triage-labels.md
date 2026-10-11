# Triage Labels

## State (exactly one per triaged issue)

| Label | Meaning |
|---|---|
| `needs-triage` | Maintainer must evaluate |
| `needs-info` | Waiting on reporter |
| `ready-for-agent` | Fully specified, an autonomous agent can take it |
| `ready-for-human` | Needs human implementation |
| `wontfix` | Will not be actioned |

## Structural marker

| Label | Meaning |
|---|---|
| `epic` | A PRD / parent issue decomposed into slices. **Never buildable directly**; never treat as `ready-for-agent`. |

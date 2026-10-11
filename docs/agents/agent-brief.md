# Writing Agent Briefs

An agent brief is the authoritative spec an autonomous agent works from. Write one when an issue becomes `ready-for-agent`.
Edit this file rather than forking copies.

## Principles

- **Durable over precise.** The issue may wait weeks. Describe interfaces, types and behavioural contracts; do not cite file paths or line numbers.
- **Behavioural, not procedural.** Say what the system should do, not how. The agent explores the code fresh.
- **Complete acceptance criteria.** Concrete, independently testable.
- **Explicit scope boundaries.** State what is out of scope.

## Template

```markdown
## Agent Brief

**Category:** bug / enhancement
**Summary:** one line

**Current behavior:**
What happens now (for bugs: the broken behaviour).

**Desired behavior:**
What should happen, including edge cases and error conditions.

**Key interfaces:**
- `TypeName` — what changes and why
- `functionName()` — current vs desired return

**Acceptance criteria:**
- [ ] Testable criterion 1
- [ ] Testable criterion 2

**Out of scope:**
- Adjacent thing that is separate
```

## Bad brief

"Fix the search bug. Look at search.ts line 150." — no category, vague, stale references, no criteria, no boundaries.

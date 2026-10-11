# docs/

Project memory. Anything a new session (human or agent) needs to resume work lives here, not in chat.

| Path | Holds | Written when | Mutable? |
|---|---|---|---|
| `ledger.md` | Open follow-ups (`F-`), questions (`Q-`), decisions (`D-`) across sessions | Every handoff | Yes, living |
| `ledger-archive.md` | Closed/dropped ledger rows, moved out of `ledger.md` | Handoff cleanup | Append only |
| `handoffs/` | One file per session: what happened, what is unverified, what is next | End of a session | No (dated snapshot) |
| `adr/` | One file per architectural decision (`NNNN-slug.md`): context, decision, why, consequences | A decision with lasting cost to reverse is made | Only `Status` changes (Superseded/Amended) |
| `prd/` | Product requirement docs (`PRD-NNN-slug.md`) for features big enough to need slicing into issues | Before building a feature | Yes until built |
| `plans/` | Dated implementation plans for larger pieces of work (`YYYY-MM-DD-slug-plan.md`) | Before building, when a PRD is too heavy | Yes until built |
| `architecture/` | Numbered audit/deep-dive docs of the system as built, with a `README.md` reading order | After an audit; kept current per the README's maintenance list | Yes, dated snapshots |
| `legal/` | Legal/compliance research and reports (`YYYY-MM-DD-slug.md`) | When a compliance question is researched | No (dated) |
| `agents/` | Instructions *for agents*: how to write briefs, which tracker, labels, domain-doc reading rules | Setup; rarely | Yes |

## Agent-facing files (`agents/`)

- `agent-brief.md` — contract for specs handed to autonomous agents (behavioural, no file paths, testable criteria, explicit out-of-scope).
- `domain.md` — what to read before exploring (`CONTEXT.md`, `adr/`), use glossary terms, flag ADR conflicts.
- `issue-tracker.md` — where issues live and the `gh` commands.
- `triage-labels.md` — label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`, marker `epic`.

## Conventions

- Dated files: `YYYY-MM-DD-<slug>-<kind>.md`, zero-padded so newest sorts last.
- Numbered files (`adr/`, `prd/`, `architecture/`): never renumber; supersede instead.
- Ledger IDs are never reused: `F-###` follow-up, `Q-###` question, `D-###` decision.
- Don't duplicate: a decision is written once (ADR or ledger `D-` row) and linked from elsewhere.

# Issue tracker: GitHub

Issues and PRDs live as GitHub issues; use the `gh` CLI.

> **Note:** this repo is not yet a git repository and has no remote. `git init`, create the GitHub repo and push before any `gh issue` command works. Until then track work in `docs/ledger.md`.

- Create: `gh issue create --title "..." --body "..."` (heredoc for multi-line)
- Read: `gh issue view <n> --comments`
- List: `gh issue list --state open --json number,title,body,labels`
- Comment: `gh issue comment <n> --body "..."`
- Labels: `gh issue edit <n> --add-label "..." / --remove-label "..."`
- Close: `gh issue close <n> --comment "..."`

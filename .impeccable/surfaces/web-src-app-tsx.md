---
version: 1
slug: "web-src-app-tsx"
primary_target: "web/src/App.tsx"
related_targets: []
---

## Scope and mode
Whole app (web/src): topics, results, sources. Mode: Operate (read-heavy analyst tool).

## Audience, job, constraints
Media-monitoring analyst, long daytime sessions at a desk, Arabic + English side by side. Must keep all behaviour and the existing test contract (roles, names). Important actions: save topic, pick a day/range, apply filters, open article.

## Direction contract
THESIS: Every article is a numbered line in the day's running order; the screen refuses spreadsheet density and card clutter, giving each line air and a fixed column grid.
OWN-WORLD: Warm-white sheet #fbfbf9 on ink #14202e, one signal blue #1d5fd6 for every primary action, amber #f2b01e only for "new in the last hour" and the average line; Public Sans for UI/headlines, Noto Naskh Arabic for Arabic; tabular numerals; ruled rows, 12px radius cards, no shadows beyond the primary button.
STORY: The analyst sees how much was published and when, scans the day-grouped rundown by time and source without re-reading layout, and opens the original in one click.
FIRST VIEWPORT: Top bar (brand, Topics/Sources, blue Save topic), range presets + chips strip, left column of topics (and filters when opened), main: topic title + query, three KPI tiles, the per-day chart with average line and busiest day labelled, then the rundown with day separators, time | headline | source | open columns.
FORM: Broadcast rundown sheet, assigned index 6 (roll a4c0c7dc), raised by split-flap fixed columns and centre-rail annotation margin.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved
Collapse the topic editor behind "Edit topic" (done with CSS so tests keep their roles); filters stay a toggled panel. Density toggle is new behaviour (test-first).

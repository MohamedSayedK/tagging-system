# Design system: Press Cuttings

A newspaper clipping desk for an analyst who reads hundreds of Arabic and English articles a day. Warm paper, serif headlines, a stamp-red accent and a yellow marker for matched words. Source of truth for tokens: `web/src/styles.css` (`:root`). Prototypes the owner chose from: `design/prototypes/` (B = this system; A, The Rundown, was the previous theme and C, the Split-Flap Concourse, a reference). Token names were kept from The Rundown so no component changed: `--blue*` now holds the stamp red.

## Principles
1. Readability first: large serif headlines, 18px excerpts, WCAG AA contrast minimum, generous card spacing.
2. One loud colour: the stamp red marks every primary action, the New stamp and the chart's average line; everything else is ink on paper.
3. Fixed columns: time, headline, source keep their place on every card, so the eye scans one vertical.
4. Quiet by default: the topic form is folded behind "Edit topic" while reading; excerpts can be hidden (Compact).
5. Arabic and English are equals: `dir="auto"` everywhere; Amiri carries Arabic in both the sans and serif stacks at a larger size than Latin.

## Colour (tokens)
| Role | Token | Light | Night |
|---|---|---|---|
| Page (ground) | `--paper` | `#f1ecde` | `#15130f` |
| Surface (the slip) | `--sheet` | `#fbf8ef` | `#1e1b15` |
| Text | `--ink` | `#1b1a17` (14.7:1 on paper) | `#f1ecde` |
| Secondary text | `--muted` | `#55504a` (6.8:1) | `#bdb4a2` |
| Tertiary / labels | `--faint` | `#625b51` (5.1:1 on wash) | `#a39a88` |
| Rules | `--line` / `--line-strong` | `#d8d0bd` / `#b9ad93` | `#332f26` / `#4a4435` |
| Wash (code, table heads) | `--wash` | `#e8e1ce` | `#26221a` |
| Primary action, links, focus | `--blue` / `--blue-deep` | `#a8211a` / `#8f1a14` | `#e0594f` / `#f08a82` |
| Primary button fill | `--primary` / `--primary-hover` | `#a8211a` / `#8f1a14` (white text 7.3:1) | `#c43a30` / `#d9483d` |
| Chip / selected wash | `--blue-wash` | `#f6e2de` | `#3a1a17` |
| New stamp + average line | `--amber`, `--amber-ink`, `--amber-wash` | same red family as the accent | same |
| Highlight (matched words) | `--mark` | `#ffe36e` (marker) | `#6b5a12` |
| Danger | `--err`, `--err-wash` | `#b42318`, `#fff1ef` | `#ff8a7a`, `#3a1a17` |
| Healthy (status only) | `--ok`, `--ok-wash` | `#2f5d50`, `#e3ece8` | `#7bc4a8`, `#15302a` |
| Chart bars | `--bar`, `--bar-weekend`, `--bar-peak` | `#1b1a17`, `#cdbf9f`, `#a8211a` | `#d9cfb6`, `#6b6350`, `#e0594f` |
| Masthead band | `--mast` / `--mast-ink` | `#1b1a17` / `#f6f0e1` | `#0c0b08` / `#f6f0e1` |
| Stamp button underside | `--stamp-shadow` | `#5a0f0b` | `#2a0705` |

Strategy: Restrained. Paper, ink, one red, one marker.
### Query syntax colours

Used only inside query text (editor and the topic header), never elsewhere. Tokens `--syn-*` in `styles.css`, each with a light and a dark value, all AA on the field background. Colour is never the only cue: operators are bold, unbalanced brackets get a wavy underline.

| Token | Meaning |
|-------|---------|
| `--syn-bool` | `AND`, `OR` (also nesting level 3 brackets) |
| `--syn-not` | `NOT` |
| `--syn-prox` | `NEAR/n`, `PRE/n` |
| `--syn-field` | `title:`, `sourcetype:` ... and date ranges |
| `--syn-phrase` | `"quoted phrases"` |
| `--syn-d1`, `--syn-d2` | brackets at nesting level 1 and 2 (level 0 is ink; the cycle repeats every four levels) |
| `--syn-match` | background of the bracket pair next to the caret |

## Night theme (night press)
Same system, same single red, a different ground: a warm near-black `#15130f` / `#1e1b15`, off-white paper-coloured text `#f1ecde` (never pure white), muted `#bdb4a2`. The accent lifts to `#e0594f` for text and focus while the primary button stays `#c43a30` with white text. Selected pills invert (light fill, dark text via `--on-ink`). The masthead goes darker than the page (`#0c0b08`). Chart bars `#d9cfb6`, weekend `#6b6350`, busiest `#e0594f`; highlight `#6b5a12`; status colours lighten.
Chosen with the Light / Dark / Auto switch in the masthead (Auto follows the system setting); saved in `localStorage` (`tagging.theme`) and applied before first paint from `web/index.html`. Dark tokens live twice in `styles.css` (system preference and `[data-theme="dark"]`): change both.
## Typography

- Headlines, topic titles, excerpts: **Source Serif 4** 400/600/700 (headline 24px / 1.3 bold, excerpt 18px / 1.65, topic title 40px).
- UI, labels, buttons, numbers: **Libre Franklin** 400-800, tabular numerals on; section labels are 13px uppercase with 0.12em tracking.
- Arabic: **Amiri** (400/700) first, **Noto Naskh Arabic** behind it; both sit in the sans and serif stacks after the Latin face, so Arabic glyphs fall through to them. Headline 28px / 1.55, excerpt 22px / 1.9 when the text is right-to-left.
- Query text and code: system monospace, 14px.
- Measure: excerpts max 72ch.
## Layout
- Masthead (`.mast`): the page's one dark band. Row 1: logo with a small caps tagline, the section buttons (Topics, Sources, Registry), the Light / Dark / Auto switch, then the stamped **New topic** button. Row 2 (Topics only): the topics as **folder tabs** (`.folders`); the open topic's tab takes the page colour so it joins the page below.
- Slip bar (`.filter-bar`): date range buttons, From / To, active filter chips, Clear all filters, saved filter sets, duplicates toggle.
- Page (`.wrap`): max 1320px, `minmax(0,1fr) | 360px`, gap 40px; below 1000px the side column stacks under the results. Main column: topic title (40px serif), the query line (clamped to a few lines with "Show the whole query"), Edit / Delete topic, the list header (a 3px double rule), then day groups and clippings. Side column (`.side`): a box with the chart, then a box "Narrow the pile" with the filters as collapsed `+` sections.
- Clipping (`.cutting`): a slip row (source, domain, place, language, time, a tilted red **New** stamp, `Cutting № n` at the right), a dashed rule, then the serif headline (27px, Arabic 32px), the excerpt (18px, Arabic 23px), and Why this matched. One border and one soft shadow per card, 3px radius.
- Day header: uppercase 13px with a hairline rule and the day's count at the right; the list header has a double rule.
- Spacing rhythm: 4/8/12/16/20/24/28; cards 14px apart, 4px radius on controls.
## Sources page
A health view, not a data dump: a one-line count, a **Needs attention** region (failing sources with reason and next retry) when anything fails, a search box and All / Failing / Healthy / Waiting filter with counts, then a five-column table (Source, Status, Coverage, Schedule, Last run). Status is always a labelled badge (dot + words), failing rows sort first, and green is used for this status only.

## States
Loading uses one spinner + sentence; errors name the problem and offer Try again; refreshing dims results to 55% and says "Updating results…". Reduced motion removes the spinner and transitions.

## Motion
One quiet entrance, then stillness. All motion is CSS (`styles.css`, "motion" block), exponential ease-out, 150-900ms, and switched off entirely under `prefers-reduced-motion`.
- Switching topic: heading fades in, the results area rises 8px into place, the first rows of each day follow 40ms apart.
- Chart start-up: bars grow from the baseline left to right (16ms stagger, capped); the average line and the busiest label fade in last. Trend view: the line draws itself, the area fades in, points pop. Switching Bars/Trend replays it.
- Data changes inside a topic (filters, range) move bars and points smoothly rather than replaying the entrance.
- Dialog, popover and hover states use short fades; nothing loops or bounces.

## Do / Don't

- Do keep one red primary action per area; do show full country, language and source-type names.
- Don't add colour for decoration, hero-number tiles, or a second accent.
- Don't put excerpts in a second language-specific style: use `dir="auto"` and the Arabic face rules above.
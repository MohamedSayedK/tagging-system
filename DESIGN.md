# Design system: The Rundown

A broadcast newsroom running-order sheet for an analyst who reads hundreds of Arabic and English articles a day. Calm, ruled, fixed columns; one blue for every primary action. Source of truth for tokens: `web/src/styles.css` (`:root`). Prototypes the owner chose from: `design/prototypes/` (A = this system).

## Principles
1. Readability first: large headlines, 16px+ excerpts, WCAG AA contrast minimum, generous row spacing.
2. One loud colour: signal blue marks every primary action; amber is reserved for "New" and the chart's average line.
3. Fixed columns: time, headline, source never move between rows, so the eye scans one vertical.
4. Quiet by default: the topic form is folded behind "Edit topic" while reading; excerpts can be hidden (Compact).
5. Arabic and English are equals: `dir="auto"` everywhere, Noto Naskh Arabic at a larger size than Latin.

## Colour (tokens)
| Role | Token | Value |
|---|---|---|
| Page | `--paper` | `#fbfbf9` |
| Surface | `--sheet` | `#ffffff` |
| Text | `--ink` | `#14202e` |
| Secondary text | `--muted` | `#4a5666` (7.6:1 on sheet) |
| Tertiary / labels | `--faint` | `#5f6b7b` (5.4:1) |
| Rules | `--line` / `--line-strong` | `#dfe3e8` / `#bcc4cf` |
| Group header wash | `--wash` | `#f3f5f8` |
| Primary action | `--blue` / `--blue-deep` | `#1d5fd6` / `#0f3f9c` |
| Selected / chip | `--blue-wash` | `#e8f0fd` |
| New + average | `--amber`, `--amber-ink`, `--amber-wash` | `#f2b01e`, `#7a5200`, `#fff3cf` |
| Highlight (matched words) | `--mark` | `#fde9a2` |
| Danger | `--err`, `--err-wash` | `#b42318`, `#fff1ef` |
| Healthy (status only) | `--ok`, `--ok-wash` | `#1b6b3a`, `#e6f4ec` (7.2:1) |
| Chart bars | `--bar`, `--bar-weekend`, `--bar-peak` | `#4f86e8`, `#8d9ab0`, `#123f9e` (all >= 3:1 on white) |

Strategy: Restrained. Neutrals plus one accent.

## Dark theme (night reading)
Same system, same single blue, different ground: a deep blue-black sheet `#0f141b` / `#161d27`, off-white text `#e8edf3` (never pure white), muted `#aab5c4`, accent blue lifted to `#7aa7ff` for text and focus while the primary button stays `#2f6fe8` with white text. Selected pills invert (light fill, dark text via `--on-ink`). Chart bars `#5b8def`, weekend `#6b7a90`, busiest `#a9c6ff`; highlight `#5c4a12`; status colours lighten (`--ok #6fd69a`, `--err #ff8a7a`).
Chosen with the Light / Dark / Auto switch in the top bar (Auto follows the system setting); saved in `localStorage` (`tagging.theme`) and applied before first paint from `web/index.html`. Dark tokens live twice in `styles.css` (system preference and `[data-theme="dark"]`): change both.

## Typography

- UI and headlines: **Public Sans** 400/500/600/700, tabular numerals on (times, counts).
- Arabic: **Noto Naskh Arabic** 500/600/700 (headline 23px / 1.65, excerpt 18px / 1.95).
- Scale: page title 32 / topic h1, 20 headline and results heading, 16 body and excerpt, 14 secondary, 12 column labels (uppercase, 0.06em).
- Query text and code: system monospace, 14px.
- Measure: excerpts max 72ch.

## Layout
- Shell: 300px rail (topics, then filters when opened) + fluid main, max 1500px; below 960px the rail stacks on top.
- Rundown rows: `84px | 1fr | 230px` (time | headline + excerpt | source/domain/country·language); inside narrow main (<760px container) the source drops under the headline.
- Spacing rhythm: 4/8/12/16/20/24/28; rows 18px vertical padding, cards 12px radius, one border per card, no stacked shadows.

## Components
- **Primary button**: solid blue, white text, 8px radius, one soft shadow. Only: New topic, Save topic.
- **Segmented control**: ink fill for the pressed item (date presets, density).
- **Chip**: blue-wash pill with a drawn close icon (24px target).
- **Day header**: sticky, wash background, day label left, article count right.
- **Row**: time (+ amber "New" within the last hour), headline link with open icon, excerpt with `mark`, source column.
- **Chart**: Bars and Trend views (a segmented toggle in the caption; same labels, hover sentence and click-to-narrow in both; trend is a 2.5px line over a 12% blue area with ringed points, the busiest point filled). Caption sentence (total, busiest, average), labelled y-axis on round steps, weekday letters (Fri/Sat greyed), dashed amber average line with label on the quieter side, busiest bar darkest and labelled, hover/focus sentence "Sat 10 Oct · 343 articles · 1,143% above average"; bars are buttons (click = filter to that bucket). Buckets are days up to 45 days, weeks to 400, months beyond (server decides).
- **Topic colour**: an optional label colour per topic (teams give colours their own meaning), picked from a nine-colour named palette plus None, or freely with the rainbow **Custom color** button (popover: hex field, saturation/brightness square, hue slider, predefined colours; applies live, Escape or an outside click closes); shown as a dot in the topic list and before the topic's name, and spoken as "Color: Blue". The app's own blue stays the only UI accent: topic colours label topics, they never recolour controls or the chart.
- **Dialog**: alertdialog, focus on the safe choice, danger button only for the destructive action.

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

- Do keep one blue primary action per area; do show full country, language and source-type names.
- Don't add colour for decoration, hero-number tiles, or a second accent.
- Don't put excerpts in a second language-specific style: use `dir="auto"` and the Arabic face rules above.
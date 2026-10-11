import { useState } from "react";
import { Bucket, Interval } from "./api";
import { articlesCount, bucketLabel, bucketRange, compactNumber, dayLabel, isWeekend } from "./dayFormat";

type ChartType = "bars" | "trend";
const TYPE_KEY = "tagging.chart";
function savedType(): ChartType {
  try {
    return localStorage.getItem(TYPE_KEY) === "trend" ? "trend" : "bars";
  } catch {
    return "bars";
  }
}

const W = 760;
const H = 230;
const PAD = { top: 26, bottom: 40, left: 38, right: 12 };

/** A round ceiling and step so the gridlines read as 0 / 10 / 20 / 30, never 0 / 7 / 14. */
function niceScale(max: number): { top: number; step: number } {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  const step = steps.find((s) => max / s <= 4) ?? Math.ceil(max / 4);
  return { top: Math.ceil(max / step) * step, step };
}

export function ResultsChart({
  buckets,
  interval = "day",
  onSelectRange,
}: {
  buckets: Bucket[];
  interval?: Interval;
  /** Called with the first and last day (inclusive) of the clicked bar. */
  onSelectRange: (from: string, to: string) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [type, setTypeState] = useState<ChartType>(savedType);
  const setType = (next: ChartType) => {
    setTypeState(next);
    try {
      localStorage.setItem(TYPE_KEY, next);
    } catch {
      /* remembering is a convenience */
    }
  };
  if (buckets.length === 0) return null;

  const day = (b: Bucket) => b.key.slice(0, 10);
  const unit = interval; // "day" | "week" | "month"
  const total = buckets.reduce((s, b) => s + b.count, 0);
  const average = total / buckets.length;
  const peak = buckets.reduce((a, b) => (b.count > a.count ? b : a));
  const { top, step } = niceScale(peak.count);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / buckets.length;
  const barW = Math.max(2, Math.min(slot * 0.68, 46));
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  // With many days, label the first of each week so the axis stays readable.
  const labelEvery = buckets.length > 40 ? 6 : buckets.length > 20 ? 3 : buckets.length > 14 ? 2 : 1;

  const compare = (n: number) => {
    const diff = n - average;
    if (average === 0 || Math.abs(diff) / average < 0.05) return "about average";
    const pct = Math.round((Math.abs(diff) / average) * 100);
    return `${pct}% ${diff > 0 ? "above" : "below"} average`;
  };
  const hover = buckets.find((b) => day(b) === hovered);
  const points = buckets.map((b, i): [number, number] => [PAD.left + i * slot + slot / 2, y(b.count)]);
  // Write the average label over the quieter end of the chart so it never lands on the tallest bar.
  const edge = Math.max(1, Math.floor(buckets.length / 4));
  const avgOnRight = Math.max(...buckets.slice(-edge).map((b) => b.count)) <= Math.max(...buckets.slice(0, edge).map((b) => b.count));

  return (
    <figure aria-label="Results over time" className="chart">
      <figcaption data-testid="chart-summary">
        <strong>
          {articlesCount(total)} over {buckets.length} {unit}{buckets.length === 1 ? "" : "s"}
        </strong>
        <span>
          Busiest: {bucketLabel(peak.key, interval)} ({peak.count})
        </span>
        <span>Average {compactNumber(average)} a {unit}</span>
        <span className="segmented chart-type" role="group" aria-label="Chart type">
          {(["bars", "trend"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={type === k} onClick={() => setType(k)}>
              {k === "bars" ? "Bars" : "Trend"}
            </button>
          ))}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Results per day">
        {ticks.map((v) => (
          <g key={v}>
            <line className="gridline" x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
            <text className="axis-label" x={PAD.left - 8} y={y(v) + 4} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {type === "trend" && (
          <>
            <path data-testid="trend-area" className="trend-area" d={`${points.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px},${py}`).join(" ")} L${points[points.length - 1]![0]},${PAD.top + plotH} L${points[0]![0]},${PAD.top + plotH} Z`} />
            <path data-testid="trend-line" className="trend-line" pathLength={1} d={points.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px},${py}`).join(" ")} />
          </>
        )}
        {buckets.map((b, i) => {
          const x = PAD.left + i * slot + (slot - barW) / 2;
          const h = Math.max(b.count > 0 ? 2 : 0, (b.count / top) * plotH);
          const stem = interval === "day" ? day(b) : interval === "week" ? `week of ${day(b)}` : `month of ${day(b).slice(0, 7)}`;
          const label = `${stem}: ${b.count} ${b.count === 1 ? "result" : "results"}`;
          const cls = ["bar", interval === "day" && isWeekend(day(b)) ? "weekend" : "", b === peak ? "peak" : ""].filter(Boolean).join(" ");
          const onKey = (e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              select();
            }
          };
          const select = () => {
            const r = bucketRange(b.key, interval);
            onSelectRange(r.from, r.to);
          };
          return (
            <g
              key={b.key}
              className="day"
              onMouseEnter={() => setHovered(day(b))}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(day(b))}
              onBlur={() => setHovered(null)}
            >
              <rect x={PAD.left + i * slot} y={PAD.top} width={slot} height={plotH} className="hit" onClick={select} />
              {type === "bars" ? (
                <rect
                  x={x}
                  y={PAD.top + plotH - h}
                  width={barW}
                  height={h}
                  rx={2}
                  style={{ ["--i" as string]: i }}
                  className={cls}
                  role="button"
                  tabIndex={0}
                  aria-label={label}
                  onClick={select}
                  onKeyDown={onKey}
                />
              ) : (
                <circle
                  cx={points[i]![0]}
                  cy={points[i]![1]}
                  r={b === peak || hovered === day(b) ? 6 : buckets.length > 40 ? 2.5 : 4}
                  className={cls.replace("bar", "point")}
                  style={{ ["--i" as string]: i }}
                  role="button"
                  tabIndex={0}
                  aria-label={label}
                  onClick={select}
                  onKeyDown={onKey}
                />
              )}              {i % labelEvery === 0 && (
                <>
                  <text className="x-label" x={x + barW / 2} y={H - 22} textAnchor="middle">
                    {interval === "day" ? dayLabel(b.key).slice(0, 3) : interval === "week" ? dayLabel(b.key).split(" ")[2] : bucketLabel(b.key, "month").split(" ")[0]}
                  </text>
                  <text className="x-label date" x={x + barW / 2} y={H - 7} textAnchor="middle">
                    {interval === "month" ? day(b).slice(0, 4) : Number(day(b).slice(8, 10))}
                  </text>
                </>
              )}
            </g>
          );
        })}
        <line className="avg-line" x1={PAD.left} x2={W - PAD.right} y1={y(average)} y2={y(average)} />
        <text
          className="avg-label"
          x={avgOnRight ? W - PAD.right : PAD.left + 6}
          y={y(average) - 7}
          textAnchor={avgOnRight ? "end" : "start"}
        >
          average {compactNumber(average)}/{unit}
        </text>
        <text
          className="peak-label"
          data-testid="peak-label"
          x={PAD.left + buckets.indexOf(peak) * slot + slot / 2}
          y={y(peak.count) - 8}
          textAnchor="middle"
        >
          {peak.count}
        </text>
      </svg>
      <p role="status" className="chart-tip">
        {hover ? `${bucketLabel(hover.key, interval)} · ${articlesCount(hover.count)} · ${compare(hover.count)}` : "\u00a0"}
      </p>
    </figure>
  );
}
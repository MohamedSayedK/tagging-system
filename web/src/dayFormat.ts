const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-10..." -> "Sat 10 Oct" (UTC, like every day boundary in the app). */
export function dayLabel(iso: string): string {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}

/** "2026-10-10T09:42:00Z" -> "09:42" (UTC). */
export const timeLabel = (iso: string) => iso.slice(11, 16);

/** Fridays and Saturdays: the Gulf weekend, a normal dip rather than a drop. */
export function isWeekend(iso: string): boolean {
  const day = new Date(iso.slice(0, 10) + "T00:00:00Z").getUTCDay();
  return day === 5 || day === 6;
}

export const articlesCount = (n: number) => `${n} ${n === 1 ? "article" : "articles"}`;

/** 24.5 -> "24.5", 25.0 -> "25", 2 -> "2"; one decimal only while it still means something. */
export function compactNumber(n: number): string {
  return n >= 10 ? String(Math.round(n)) : String(Math.round(n * 10) / 10);
}
const addDays = (isoDay: string, n: number) => {
  const d = new Date(isoDay.slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** The first and last UTC day (inclusive) that a chart bucket covers. */
export function bucketRange(key: string, interval: "day" | "week" | "month"): { from: string; to: string } {
  const from = key.slice(0, 10);
  if (interval === "day") return { from, to: from };
  if (interval === "week") return { from, to: addDays(from, 6) };
  const d = new Date(from + "T00:00:00Z");
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return { from, to: last.toISOString().slice(0, 10) };
}

/** "Sat 10 Oct" for a day, "week of 5 Oct", "Sep 2026" for a month. */
export function bucketLabel(key: string, interval: "day" | "week" | "month"): string {
  if (interval === "day") return dayLabel(key);
  if (interval === "week") return `week of ${dayLabel(key).split(" ").slice(1).join(" ")}`;
  const d = new Date(key.slice(0, 10) + "T00:00:00Z");
  return `${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
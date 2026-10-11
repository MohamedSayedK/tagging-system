const RTF = new Intl.RelativeTimeFormat("en", { numeric: "always" });

/** "5 minutes ago" / "in 1 hour"; a time already past reads as "due now" only where `pastLabel` says so. */
export function relativeTime(iso: string, now: Date): string {
  const seconds = Math.round((Date.parse(iso) - now.getTime()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return seconds < 0 ? "just now" : "in under a minute";
  const [value, unit] =
    abs < 3600 ? [Math.round(seconds / 60), "minute"] : abs < 86_400 ? [Math.round(seconds / 3600), "hour"] : [Math.round(seconds / 86_400), "day"];
  return RTF.format(value as number, unit as Intl.RelativeTimeFormatUnit);
}

const plural = (n: number, unit: string) => (n === 1 ? unit : `${unit}s`);

/** 900000 -> "every 15 minutes", 3600000 -> "every hour". */
export function intervalText(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60 || minutes % 60 !== 0) return minutes === 1 ? "every minute" : `every ${minutes} ${plural(minutes, "minute")}`;
  const hours = minutes / 60;
  if (hours < 24 || hours % 24 !== 0) return hours === 1 ? "every hour" : `every ${hours} ${plural(hours, "hour")}`;
  const days = hours / 24;
  return days === 1 ? "every day" : `every ${days} ${plural(days, "day")}`;
}

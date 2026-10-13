import type { PromotedSource } from "../registry/promote.js";
import type { Source } from "./sources.js";

// Promoted sources are numerous and unvetted by hand, so they are read less often and shallower than curated ones.
const PROMOTED_INTERVAL_MS = 30 * 60_000;
const PROMOTED_MAX_ITEMS = 50;
const PROMOTED_MAX_AGE_DAYS = 30;

/**
 * The sources the worker crawls: the curated ones from sources.yaml, then promoted registry domains.
 * The curated list wins on a shared domain and on a shared name.
 */
export function mergeSources(
  curated: Source[],
  promoted: PromotedSource[],
  options: { /** Leaves out promoted sources that are no longer in scope; curated ones are never filtered. */ inScope?: (p: PromotedSource) => boolean } = {},
): Source[] {
  const domains = new Set(curated.map((s) => s.domain.toLowerCase().replace(/^www\./, "")));
  const names = new Set(curated.map((s) => s.name));
  const extra: Source[] = [];
  for (const p of promoted) {
    const domain = p.domain.toLowerCase().replace(/^www\./, "");
    if (domains.has(domain) || names.has(p.name)) continue;
    if (options.inScope && !options.inScope(p)) continue;
    domains.add(domain);
    names.add(p.name);
    extra.push({
      ...p,
      interval: PROMOTED_INTERVAL_MS,
      maxItems: PROMOTED_MAX_ITEMS,
      maxAgeDays: PROMOTED_MAX_AGE_DAYS,
    });
  }
  return [...curated, ...extra];
}

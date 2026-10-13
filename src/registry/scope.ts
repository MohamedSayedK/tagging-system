import { isMena } from "./region.js";
import { loadOverrides, type Overrides } from "./overrides.js";
import type { PromotedSource } from "./promote.js";

export interface CrawlScope {
  /** May this domain become, or stay, a crawled source? `languages` are ISO 639-3, `country` ISO 3166 alpha-2. */
  allows(domain: string, languages?: string[], country?: string): boolean;
}

const bare = (d: string) => d.trim().toLowerCase().replace(/^www\./, "");
const matches = (set: Set<string>, domain: string) => {
  const labels = bare(domain).split(".");
  return labels.some((_, i) => set.has(labels.slice(i).join(".")));
};

/**
 * What the crawler is for. By default only regional outlets are promoted: Arab-state domains, Arabic
 * publishers, outlets known to be in an Arab state or a neighbour (Turkey, Iran, Israel, Cyprus). Without it
 * the busiest domains in the world crowd out the brief (stock-price spam, Asian dailies).
 * `PROMOTE_SCOPE=all` drops the region rule; `include:` and `blocked:` in registry-overrides.yaml are the
 * owner's say, and the blocklist always wins.
 */
export function loadScope(env: Record<string, string | undefined> = process.env, overrides: Overrides = loadOverrides()): CrawlScope {
  const mode = env.PROMOTE_SCOPE?.trim() || "regional";
  if (mode !== "regional" && mode !== "all") throw new Error(`PROMOTE_SCOPE must be "regional" or "all", got "${mode}"`);
  return {
    allows(domain, languages = [], country) {
      if (matches(overrides.blocked, domain)) return false;
      if (mode === "all" || matches(overrides.include, domain)) return true;
      return isMena(domain, languages, country);
    },
  };
}

/**
 * The same rule for an already promoted source. The source often lacks a language and country, so what the
 * registry recorded for the domain counts too. A source's own language is ISO 639-1 (`ar`), the registry's 639-3.
 */
export const promotedInScope =
  (scope: CrawlScope, registry: Map<string, { languages?: string[]; country?: string }>) => (p: PromotedSource) => {
    const known = registry.get(p.domain);
    const languages = [...(known?.languages ?? []), ...(p.lang === "ar" ? ["ara"] : [])];
    return scope.allows(p.domain, languages, p.country ?? known?.country);
  };
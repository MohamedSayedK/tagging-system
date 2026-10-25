import { catalogDomains } from "../registry/catalog.js";
import { loadOverrides } from "../registry/overrides.js";
import { promotedInScope, loadScope, type CrawlScope } from "../registry/scope.js";
import type { PromotedSource } from "../registry/promote.js";
import { openSearchCatalog } from "./catalogStore.js";
import { openSearchRegistry } from "./registryStore.js";

/** The crawl scope with the business source catalog applied (ADR 0001). Read fresh on every call. */
export async function crawlScope(): Promise<CrawlScope> {
  return loadScope(process.env, loadOverrides(), catalogDomains(await openSearchCatalog().all()));
}

/**
 * Which already promoted sources are still within the crawl scope (see `loadScope`), reading each domain's
 * language and country from the registry. Read again on every call, so edits to registry-overrides.yaml apply.
 */
export async function promotedScope(promoted: PromotedSource[]): Promise<(p: PromotedSource) => boolean> {
  const records = await openSearchRegistry().getMany(promoted.map((p) => p.domain));
  return promotedInScope(await crawlScope(), new Map(records.map((r) => [r.domain, r])));
}

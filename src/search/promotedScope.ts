import { promotedInScope, loadScope } from "../registry/scope.js";
import type { PromotedSource } from "../registry/promote.js";
import { openSearchRegistry } from "./registryStore.js";

/**
 * Which already promoted sources are still within the crawl scope (see `loadScope`), reading each domain's
 * language and country from the registry. Read again on every call, so edits to registry-overrides.yaml apply.
 */
export async function promotedScope(promoted: PromotedSource[]): Promise<(p: PromotedSource) => boolean> {
  const records = await openSearchRegistry().getMany(promoted.map((p) => p.domain));
  return promotedInScope(loadScope(), new Map(records.map((r) => [r.domain, r])));
}
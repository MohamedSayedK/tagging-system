// Country-code top-level domains that are used as generic suffixes, not to say where an outlet is.
const GENERIC_CCTLDS = new Set(["io", "ai", "co", "tv", "me", "fm", "cc", "ws", "to", "sh", "gg", "ac", "vc", "gl", "ms"]);

/**
 * The ISO 3166 country a domain's suffix points at (`alyaum.com.sa` -> `SA`), or undefined for generic
 * suffixes such as `.com`. This is a hint only: many outlets publish from `.com` or `.net` domains.
 */
export function countryFromDomain(domain: string): string | undefined {
  const tld = domain.toLowerCase().split(".").at(-1) ?? "";
  if (tld.length !== 2 || GENERIC_CCTLDS.has(tld)) return undefined;
  return tld === "uk" ? "GB" : tld.toUpperCase();
}

// Country-code domains of the Arab League states, and of the non-Arab neighbours the monitoring also covers.
const ARAB_CCTLDS = new Set([
  "ma", "dz", "tn", "ly", "eg", "sd", "mr", "dj", "so", "km",
  "sa", "ae", "qa", "kw", "bh", "om", "ye", "iq", "sy", "lb", "jo", "ps",
]);
const NEIGHBOUR_CCTLDS = new Set(["tr", "ir", "il", "cy"]);

/**
 * How regional a domain is, for deciding what to try first: 0 for Arabic-language publishers and Arab-state
 * domains, 1 for the non-Arab neighbours (Turkey, Iran, Israel, Cyprus), 2 for everyone else. A known
 * `country` (ISO 3166 alpha-2) counts like the domain suffix, for outlets on `.com` and `.net`.
 */
export function regionTier(domain: string, languages: string[] = [], country?: string): 0 | 1 | 2 {
  const tld = domain.toLowerCase().split(".").at(-1) ?? "";
  const cc = country?.toLowerCase() ?? "";
  if (languages.includes("ara") || ARAB_CCTLDS.has(tld) || ARAB_CCTLDS.has(cc)) return 0;
  return NEIGHBOUR_CCTLDS.has(tld) || NEIGHBOUR_CCTLDS.has(cc) ? 1 : 2;
}

/** Is this domain regional at all (tier 0 or 1)? */
export function isMena(domain: string, languages: string[] = [], country?: string): boolean {
  return regionTier(domain, languages, country) < 2;
}

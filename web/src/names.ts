import { FacetName } from "./api";

// Codes (ISO 3166 regions, BCP 47 languages) are shown by their English names. Unknown or malformed
// codes fall back to the raw value rather than guessing.
const regions = safeDisplayNames("region");
const languages = safeDisplayNames("language");

function safeDisplayNames(type: "region" | "language") {
  try {
    return new Intl.DisplayNames(["en"], { type, fallback: "none" });
  } catch {
    return null;
  }
}

function lookup(names: Intl.DisplayNames | null, code: string): string | null {
  try {
    return names?.of(code) ?? null;
  } catch {
    return null; // RangeError for structurally invalid codes
  }
}

// Source types are free-form codes like ONLINENEWS_NEWSPAPER. Known ones get hand-written names; others
// are built from their parts (`socialmedia_disqus` -> "Social media – Disqus") so nothing shows as a code.
const SOURCE_TYPES: Record<string, string> = {
  onlinenews_newspaper: "Online newspaper",
  onlinenews_magazine: "Online magazine",
  onlinenews_agency: "Online news agency",
  onlinenews_newsagency: "Online news agency",
  onlinenews_pressreleases: "Online press releases",
  onlinenews_other: "Other online news",
  print_newspaper: "Print newspaper",
  print_magazine: "Print magazine",
  print_newspaperinternational: "International print newspaper",
  print_pressreleases: "Print press releases",
  broadcast_tv: "Television",
  broadcast_radio: "Radio",
  broadcast_other: "Other broadcast",
  newsletter_substack: "Substack newsletter",
  blog: "Blog",
  forum: "Forum",
  messageboard: "Message board",
};
/** The source type codes with hand-written names, lower case, for completing `sourcetype:`. */
export const KNOWN_SOURCE_TYPES = Object.keys(SOURCE_TYPES);
const FAMILIES: Record<string, string> = {
  onlinenews: "Online news",
  print: "Print",
  broadcast: "Broadcast",
  socialmedia: "Social media",
  newsletter: "Newsletter",
};
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

export function sourceTypeName(code: string): string {
  const key = code.toLowerCase();
  if (SOURCE_TYPES[key]) return SOURCE_TYPES[key];
  const [family, ...rest] = key.split("_");
  const head = FAMILIES[family!] ?? capitalize(family!);
  return rest.length ? `${head} – ${rest.map(capitalize).join(" ")}` : head;
}

export const countryName = (code: string) => lookup(regions, code.toUpperCase()) ?? code;
export const languageName = (code: string) => lookup(languages, code) ?? code;

/** What to show for a facet value; the value itself (the code) is what filters use. */
export function facetValueLabel(facet: FacetName, value: string): string {
  if (facet === "sourcecountry") return countryName(value);
  if (facet === "lang") return languageName(value);
  if (facet === "sourcetype") return sourceTypeName(value);
  return value;
}

/** Facets whose values are codes (few enough to fetch whole) that people search by name. */
export const isCoded = (facet: FacetName) => facet === "sourcecountry" || facet === "lang" || facet === "sourcetype";


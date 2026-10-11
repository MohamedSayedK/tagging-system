import { Aggregations, Bucket, FacetName, Facets } from "./api";

export const NO_FACETS: Facets = { sourcetype: [], sourcecountry: [], domain: [], lang: [] };

export const FACET_SECTIONS: { facet: FacetName; label: string; options: (a: Aggregations) => Bucket[] }[] = [
  { facet: "sourcetype", label: "Source type", options: (a) => a.sourceTypes ?? [] },
  { facet: "sourcecountry", label: "Country", options: (a) => a.countries ?? [] },
  { facet: "lang", label: "Language", options: (a) => a.languages ?? [] },
  { facet: "domain", label: "Domain", options: (a) => a.domains ?? [] },
];

export const facetLabel = (facet: FacetName) => FACET_SECTIONS.find((s) => s.facet === facet)!.label;

export const hasActiveFacets = (f: Facets) => Object.values(f).some((v) => v.length > 0);

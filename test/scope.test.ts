import { describe, expect, it } from "vitest";
import { parseOverrides } from "../src/registry/overrides.js";
import { loadScope, promotedInScope } from "../src/registry/scope.js";

const scopeOf = (yaml = "", env: Record<string, string | undefined> = {}) => loadScope(env, parseOverrides(yaml));

describe("crawl scope: regional by default", () => {
  const scope = scopeOf();

  it("lets in Arab-state domains, Arabic publishers and the neighbours the monitoring covers", () => {
    expect(scope.allows("okaz.com.sa")).toBe(true);
    expect(scope.allows("someoutlet.com", ["ara"])).toBe(true);
    expect(scope.allows("hurriyet.com.tr")).toBe(true);
    expect(scope.allows("tehrantimes.com", [], "IR")).toBe(true);
  });

  it("uses the country an outlet is known to be in, not only its suffix", () => {
    expect(scope.allows("gulfnews.com", ["eng"], "AE")).toBe(true);
    expect(scope.allows("gulfnews.com", ["eng"])).toBe(false);
  });

  it("keeps out outlets with no regional link, whatever their language", () => {
    expect(scope.allows("tickerreport.com", ["eng"])).toBe(false);
    expect(scope.allows("ifeng.com", ["zho"])).toBe(false);
    expect(scope.allows("thehindu.com", ["eng"], "IN")).toBe(false);
  });
});

describe("crawl scope: owner lists", () => {
  it("include: lets a domain in despite the region rule; blocked: keeps one out and wins over include", () => {
    const scope = scopeOf("include:\n  - arabianbusiness.com\n  - both.example\nblocked:\n  - tickerreport.com\n  - okaz.com.sa\n  - both.example\n");

    expect(scope.allows("arabianbusiness.com", ["eng"])).toBe(true);
    expect(scope.allows("www.arabianbusiness.com", ["eng"])).toBe(true);
    expect(scope.allows("okaz.com.sa")).toBe(false);
    expect(scope.allows("news.tickerreport.com", ["ara"])).toBe(false); // a subdomain of a blocked site
    expect(scope.allows("both.example")).toBe(false);
  });
});

describe("crawl scope: PROMOTE_SCOPE", () => {
  it("all drops the region rule but keeps the blocklist", () => {
    const scope = scopeOf("blocked:\n  - tickerreport.com\n", { PROMOTE_SCOPE: "all" });

    expect(scope.allows("thehindu.com", ["eng"], "IN")).toBe(true);
    expect(scope.allows("tickerreport.com", ["eng"])).toBe(false);
  });

  it("refuses a value it does not know instead of guessing", () => {
    expect(() => scopeOf("", { PROMOTE_SCOPE: "mena" })).toThrow(/PROMOTE_SCOPE/);
  });
});
describe("crawl scope: sources that are already promoted", () => {
  const source = (domain: string, over: Record<string, unknown> = {}) => ({ name: domain, domain, sourcetype: "ONLINENEWS_OTHER", feeds: [], ...over });
  const registry = new Map([
    ["annabaa.org", { languages: ["ara"] }],
    ["gulfnews.com", { languages: ["eng"], country: "AE" }],
    ["tickerreport.com", { languages: ["eng"] }],
  ]);
  const keep = promotedInScope(loadScope({}, parseOverrides("")), registry);

  it("asks the registry what language and country a promoted domain has, since the source often lacks them", () => {
    expect(keep(source("annabaa.org"))).toBe(true); // Arabic per the registry, nothing on the source itself
    expect(keep(source("gulfnews.com"))).toBe(true); // known to be in the UAE
  });

  it("uses what the source itself says too, and drops what has no regional link", () => {
    expect(keep(source("mystery.example", { lang: "ar" }))).toBe(true);
    expect(keep(source("elsewhere.example", { country: "EG" }))).toBe(true);
    expect(keep(source("tickerreport.com"))).toBe(false);
    expect(keep(source("not-in-registry.com"))).toBe(false);
  });
});
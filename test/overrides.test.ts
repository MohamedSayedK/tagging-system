import { describe, expect, it } from "vitest";
import { countryOf, isAggregator, parseOverrides } from "../src/registry/overrides.js";

const yaml = `
country:
  argaam.com: SA
  aljazeera.net: QA
aggregators:
  - mynews-roundup.example
notAggregators:
  - msn.com
`;

describe("parseOverrides", () => {
  it("reads country overrides and aggregator lists", () => {
    const o = parseOverrides(yaml);

    expect(o.country.get("argaam.com")).toBe("SA");
    expect(o.aggregators.has("mynews-roundup.example")).toBe(true);
    expect(o.notAggregators.has("msn.com")).toBe(true);
  });

  it("accepts an empty file", () => {
    const o = parseOverrides("");

    expect(o.country.size + o.aggregators.size + o.notAggregators.size).toBe(0);
  });

  it("rejects a country that is not a two-letter code, naming the domain", () => {
    expect(() => parseOverrides("country:\n  argaam.com: Saudi\n")).toThrow(/argaam\.com/);
  });
});

describe("countryOf", () => {
  const o = parseOverrides(yaml);

  it("prefers the owner's override, then the country-code suffix, else unknown", () => {
    expect(countryOf("argaam.com", o)).toBe("SA");
    expect(countryOf("www.argaam.com", o)).toBe("SA");
    expect(countryOf("okaz.com.sa", o)).toBe("SA");
    expect(countryOf("example.com", o)).toBeUndefined();
  });
});

describe("isAggregator", () => {
  const o = parseOverrides(yaml);

  it("knows the well-known aggregators, including their subdomains", () => {
    expect(isAggregator("zazoom.it", o)).toBe(true);
    expect(isAggregator("news.google.com", o)).toBe(true);
    expect(isAggregator("akhbarak.net", o)).toBe(true);
    expect(isAggregator("arabnews.com", o)).toBe(false);
  });

  it("lets the owner add to the list and take a domain off it", () => {
    expect(isAggregator("mynews-roundup.example", o)).toBe(true);
    expect(isAggregator("msn.com", o)).toBe(false); // built in as an aggregator, overridden
  });
});

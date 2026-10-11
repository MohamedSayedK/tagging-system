import { describe, expect, it } from "vitest";
import { selectToPromote } from "../src/registry/selectToPromote.js";

const NOW = new Date("2026-10-11T12:00:00Z");
const day = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * day).toISOString();
const rec = (domain: string, articleCount: number) => ({ domain, articleCount });

describe("selectToPromote", () => {
  it("takes the busiest domains first, up to the limit", () => {
    const picked = selectToPromote({
      candidates: [rec("small.com", 3), rec("big.com", 900), rec("mid.com", 40)],
      attempts: new Map(),
      curatedDomains: new Set(),
      now: NOW,
      limit: 2,
    });

    expect(picked).toEqual(["big.com", "mid.com"]);
  });

  it("skips domains the owner already configured, with or without www", () => {
    const picked = selectToPromote({
      candidates: [rec("okaz.com.sa", 50), rec("sabq.org", 40)],
      attempts: new Map(),
      curatedDomains: new Set(["www.okaz.com.sa"]),
      now: NOW,
      limit: 10,
    });

    expect(picked).toEqual(["sabq.org"]);
  });

  it("does not retry a domain too soon, but retries a failed one after a week", () => {
    const picked = selectToPromote({
      candidates: [rec("fresh.com", 5), rec("recent-fail.com", 90), rec("old-fail.com", 80), rec("never.com", 70)],
      attempts: new Map([
        ["recent-fail.com", { status: "no_feed" as const, checkedAt: ago(2) }],
        ["old-fail.com", { status: "unreachable" as const, checkedAt: ago(9) }],
      ]),
      curatedDomains: new Set(),
      now: NOW,
      limit: 10,
    });

    expect(picked).toEqual(["old-fail.com", "never.com", "fresh.com"]);
  });

  it("tries the MENA region first: Arabic-language publishers and regional country domains before bigger global ones", () => {
    const picked = selectToPromote({
      candidates: [
        { domain: "bigglobal.com", articleCount: 900, languages: ["eng"] },
        { domain: "arabicsmall.net", articleCount: 5, languages: ["ara"] },
        { domain: "gulfpaper.com.sa", articleCount: 8, languages: ["eng"] },
        { domain: "turkishmid.com.tr", articleCount: 300, languages: ["tur"] },
        { domain: "midglobal.org", articleCount: 400, languages: ["eng"] },
      ],
      attempts: new Map(),
      curatedDomains: new Set(),
      now: NOW,
      limit: 10,
    });

    // Arabic-language and Arab-state domains first, then the non-Arab neighbours (Turkey, Iran, Israel,
    // Cyprus), then everyone else; busiest first within each group.
    expect(picked).toEqual(["gulfpaper.com.sa", "arabicsmall.net", "turkishmid.com.tr", "bigglobal.com", "midglobal.org"]);
  });

  it("retries failures sooner when asked to, e.g. after discovery has been improved", () => {
    const picked = selectToPromote({
      candidates: [rec("recent-fail.com", 90), rec("live.com", 80)],
      attempts: new Map([
        ["recent-fail.com", { status: "no_feed" as const, checkedAt: ago(2) }],
        ["live.com", { status: "active" as const, checkedAt: ago(2) }],
      ]),
      curatedDomains: new Set(),
      now: NOW,
      limit: 10,
      retryAfterDays: 1,
    });

    expect(picked).toEqual(["recent-fail.com"]); // active ones are still left alone
  });

  it("leaves aggregators out: they republish other outlets and are not sources of their own", () => {
    const picked = selectToPromote({
      candidates: [rec("zazoom.it", 900), rec("real-paper.com", 10)],
      attempts: new Map(),
      curatedDomains: new Set(),
      now: NOW,
      limit: 10,
      isAggregator: (d) => d === "zazoom.it",
    });

    expect(picked).toEqual(["real-paper.com"]);
  });

  it("leaves active promotions alone: they are already crawled", () => {
    const picked = selectToPromote({
      candidates: [rec("live.com", 500), rec("todo.com", 10)],
      attempts: new Map([["live.com", { status: "active" as const, checkedAt: ago(40) }]]),
      curatedDomains: new Set(),
      now: NOW,
      limit: 10,
    });

    expect(picked).toEqual(["todo.com"]);
  });
});

import { describe, expect, it } from "vitest";
import { newsdeskToCatalog } from "../src/registry/newsdeskList.js";
import { parseCatalog } from "../src/registry/catalog.js";

const HEAD = "website,example_url,names,country,best_rank,media_types,newsdesk_sources,requires_subscription_sources,access_status,vs_our_catalog";
const csv = (...rows: string[]) => "\uFEFF" + [HEAD, ...rows].join("\r\n") + "\r\n";
const AL_QABAS = "alqabas.com,https://alqabas.com,Al Qabas,Kuwait,1,PrintMedia,1,0,free,NEW";
const BOSTON = 'boston.com,https://www.boston.com,"Boston.com | Boston ""Globe"" Online",United States,2,OnlineNews,2,0,free,NEW';
const RANK3 = "smalltown.example,https://smalltown.example,Small Town Gazette,Canada,3,OnlineNews,1,0,free,NEW";
const JOURNAL = "onlinelibrary.wiley.com,https://onlinelibrary.wiley.com,Journal of Criminology,United States,2,OnlineNews,965,0,free,NEW";
const JOURNAL_SUB = "nph.onlinelibrary.wiley.com,https://nph.onlinelibrary.wiley.com,New Phytologist,United Kingdom,2,OnlineNews,1,0,free,NEW";

describe("newsdeskToCatalog", () => {
  it("makes a catalog file the importer accepts, one record per website with a stable ID, to verify first", () => {
    const { file } = newsdeskToCatalog(csv(AL_QABAS, BOSTON), { maxRank: 2 });

    const { entries, rejected, declaredTotal } = parseCatalog(file);
    expect(rejected).toEqual([]);
    expect(declaredTotal).toBe(2);
    expect(entries.map((e) => [e.id, e.domain])).toEqual([
      ["ND-alqabas.com", "alqabas.com"],
      ["ND-boston.com", "boston.com"],
    ]);
    expect(entries[0]!.record).toMatchObject({
      name: "Al Qabas",
      country: "Kuwait",
      priority: "P1",
      homepage_url: "https://alqabas.com",
      identity_verification: "unconfirmed",
      crawl_handling: "candidate_verify_first",
      origin: "newsdesk",
      newsdesk_rank: 1,
    });
    expect(entries[1]!.record).toMatchObject({ name: "Boston.com", priority: "P2", newsdesk_sources: 2 });
  });

  it("takes only sites up to the given rank", () => {
    const { file } = newsdeskToCatalog(csv(AL_QABAS, RANK3), { maxRank: 2 });

    expect(parseCatalog(file).entries.map((e) => e.domain)).toEqual(["alqabas.com"]);
  });

  it("leaves out excluded sites and their subdomains, and lists what it left out", () => {
    const { file, excluded } = newsdeskToCatalog(csv(AL_QABAS, JOURNAL, JOURNAL_SUB), { maxRank: 2, exclude: new Set(["onlinelibrary.wiley.com"]) });

    expect(parseCatalog(file).entries.map((e) => e.domain)).toEqual(["alqabas.com"]);
    expect(excluded).toEqual(["onlinelibrary.wiley.com", "nph.onlinelibrary.wiley.com"]);
  });

  it("refuses a file that is not the Newsdesk list instead of guessing", () => {
    expect(() => newsdeskToCatalog("a,b\r\n1,2\r\n", { maxRank: 2 })).toThrow(/website/);
  });
});

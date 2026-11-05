import { describe, expect, it } from "vitest";
import { parseFeed } from "../src/ingest/feeds.js";
import { parseHeadlines } from "../src/ingest/headlines.js";

const PAGE = "https://news.example.com/";
const a = (href: string, text: string) => `<a href="${href}">${text}</a>`;

describe("parseHeadlines", () => {
  it("takes the article links of a front page with their link text as the headline", () => {
    const html = `<html><body>
      ${a("/world/2026/10/28/talks-resume-after-ceasefire", "Talks resume after the ceasefire holds overnight")}
      ${a("https://news.example.com/economy/inflation-slows-in-october", "Inflation slows in October for a second month")}
    </body></html>`;

    expect(parseHeadlines(html, PAGE)).toEqual([
      { url: "https://news.example.com/world/2026/10/28/talks-resume-after-ceasefire", title: "Talks resume after the ceasefire holds overnight" },
      { url: "https://news.example.com/economy/inflation-slows-in-october", title: "Inflation slows in October for a second month" },
    ]);
  });

  it("leaves out menus, section pages, other sites and short link texts", () => {
    const html = `
      ${a("/category/politics", "Politics and government news and analysis")}
      ${a("/about", "About this newspaper and its history")}
      ${a("/login", "Sign in to your subscriber account")}
      ${a("https://other.net/world/some-story-about-the-economy", "A story on another site entirely about money")}
      ${a("/world/short-one", "Read more")}
      ${a("#top", "Back to the top of this very long page")}
      ${a("mailto:desk@example.com", "Email the newsroom with your tips today")}
      ${a("/world/real-story-about-the-budget-vote", "Parliament passes the budget after a late vote")}`;

    expect(parseHeadlines(html, PAGE).map((h) => h.url)).toEqual(["https://news.example.com/world/real-story-about-the-budget-vote"]);
  });

  it("leaves out menu labels, even a long single word or a four-word section name", () => {
    const html = `${a("/showbiz/entertainment-news", "Entertainment")}
      ${a("/ca/estates", "Wills, Trusts & Estates")}
      ${a("/watch/catalog/golf", "Watch Golf on ESPN")}`;

    expect(parseHeadlines(html, PAGE)).toEqual([]);
  });

  it("keeps a Japanese headline, which has no spaces", () => {
    const html = a("https://news.example.com/usa/35254088.html", "トランプ氏、「公正な選挙なら」中間選挙の結果受け入れ");

    expect(parseHeadlines(html, PAGE)).toHaveLength(1);
  });

  it("reads the text inside nested tags and decodes entities", () => {
    const html = a("/business/2026/10/markets-rally", `<span class="kicker">Markets</span> <h3>Stocks rally &amp; bonds slip on rate hopes</h3>`);

    expect(parseHeadlines(html, PAGE)).toEqual([{ url: "https://news.example.com/business/2026/10/markets-rally", title: "Markets Stocks rally & bonds slip on rate hopes" }]);
  });

  it("lists each article once, keeping the longest text of its links", () => {
    const html = `${a("/world/talks-resume-after-ceasefire", "Talks resume after the ceasefire holds")}
      ${a("/world/talks-resume-after-ceasefire#comments", "Talks resume after the ceasefire holds overnight, officials say")}`;

    const found = parseHeadlines(html, PAGE);

    expect(found).toHaveLength(1);
    expect(found[0]!.title).toBe("Talks resume after the ceasefire holds overnight, officials say");
  });

  it("accepts Arabic headlines and links to the site's subdomains", () => {
    const html = a("https://english.example.com/news/2026/10/28/12345", "وزير المالية يعلن ميزانية جديدة للعام المقبل");

    expect(parseHeadlines(html, "https://example.com/")).toHaveLength(1);
  });

  it("is what parseFeed returns for a page of headlines", () => {
    const html = a("/world/talks-resume-after-ceasefire", "Talks resume after the ceasefire holds overnight");

    expect(parseFeed(html, "html", PAGE)).toEqual(parseHeadlines(html, PAGE));
  });
});

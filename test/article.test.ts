import { describe, expect, it } from "vitest";
import { extractArticle, looksLikeProse } from "../src/ingest/article.js";

const page = (head: string, body: string) => `<!doctype html><html lang="ar"><head><title>t</title>${head}</head><body>${body}</body></html>`;
const URL = "https://example.test/a/1";

const realParagraphs = `<article><h1>الميزانية العامة تسجل عجزا أقل</h1>
  <p>أعلنت وزارة المالية أن عجز الميزانية جاء دون التقديرات الأولية للربع الثالث، بفضل نمو الإيرادات غير النفطية.</p>
  <p>وأشار البيان إلى أن الإنفاق الرأسمالي ارتفع بنسبة ملحوظة مقارنة بالفترة نفسها من العام الماضي، مع استمرار ضبط المصروفات الجارية.</p>
  <p>وقال محللون إن هذه المؤشرات تعزز الثقة في الموازنة الجديدة وتمنح الحكومة هامشا أوسع للمشاريع التنموية.</p></article>`;

// A site footer whose links have no whitespace between them: this is what Readability returned for Al Madina.
const chromeOnly = `<footer><p>صحيفة سعودية رائدة، تأسست لتقديم تغطية إخبارية متميزة وتحليلات عميقة بشفافية ومصداقية. نسعى لنكون المصدر الأول للأخبار.</p>
  <h4>أقسام الموقع</h4><ul><li><a href="/">الصفحة الرئيسية</a></li><li><a href="/a">أرشيف الصحيفة</a></li><li><a href="/b">آخر الأخبار</a></li><li><a href="/c">محليات</a></li><li><a href="/d">اقتصاد</a></li><li><a href="/e">دولية</a></li><li><a href="/f">ثقافة</a></li><li><a href="/g">رياضة</a></li><li><a href="/h">كتاب</a></li><li><a href="/i">منتدى</a></li><li><a href="/j">وظائف</a></li><li><a href="/k">ميديا</a></li><li><a href="/l">أخبار الشركاء</a></li><li><a href="/m">اتصل بنا</a></li></ul></footer>`;

describe("extractArticle", () => {
  it("returns the article's own text, with words separated", () => {
    const ex = extractArticle(page("", realParagraphs), URL)!;

    expect(ex.body).toContain("أعلنت وزارة المالية");
    expect(ex.body).toContain("الإنفاق الرأسمالي");
    expect(ex.body).not.toMatch(/\S{40,}/); // nothing glued together
  });

  it("separates words that sit in adjacent elements", () => {
    const html = page("", `<article><p>${"نص عادي طويل يشرح الخبر بالتفصيل ".repeat(6)}</p><ul><li>اقتصاد</li><li>سياسة</li></ul></article>`);

    expect(extractArticle(html, URL)!.body).toContain("اقتصاد سياسة");
  });

  it("uses the page's own description when the extracted text is site chrome", () => {
    const html = page(
      '<meta property="og:description" content="تدشن دارة الملك عبدالعزيز برنامج الأعمال الكاملة للمؤرخين الرواد بإطلاق كتاب جديد.">',
      chromeOnly,
    );

    expect(extractArticle(html, URL)!.body).toBe("تدشن دارة الملك عبدالعزيز برنامج الأعمال الكاملة للمؤرخين الرواد بإطلاق كتاب جديد.");
  });

  it("reads name=description and twitter:description too, and decodes entities", () => {
    const html = page('<meta name="description" content="Budget &quot;deficit&quot; narrows &amp; spending rises in the third quarter of the year.">', chromeOnly);

    expect(extractArticle(html, URL)!.body).toBe('Budget "deficit" narrows & spending rises in the third quarter of the year.');
  });

  it("returns null when there is only chrome and no description, so the feed's own summary is used", () => {
    expect(extractArticle(page("", chromeOnly), URL)).toBeNull();
  });
});

describe("extractArticle: where the text came from", () => {
  const longProse =
    "The finance ministry announced on Sunday that the budget deficit narrowed in the third quarter, helped by growth in non-oil revenue. " +
    "Officials said capital spending rose against the same period last year while current expenditure stayed under control. " +
    "Analysts told reporters the figures strengthen confidence in the new budget and leave the government more room for development projects.";
  const ld = (o: object) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`;

  it("says whether the text is the page's article, structured data, or only the page description", () => {
    expect(extractArticle(page("", realParagraphs), URL)!.via).toBe("page");
    expect(extractArticle(page(ld({ "@type": "NewsArticle", articleBody: longProse }), chromeOnly), URL)!.via).toBe("structured");
    const described = page('<meta property="og:description" content="Budget deficit narrows in the third quarter as non-oil revenue grows.">', chromeOnly);
    expect(extractArticle(described, URL)!.via).toBe("description");
  });

  it("reads the JSON-LD articleBody when the page itself yields only site chrome", () => {
    const ex = extractArticle(page(ld({ "@type": "NewsArticle", articleBody: longProse }), chromeOnly), URL)!;

    expect(ex.body).toBe(longProse);
  });

  it("finds the articleBody inside a JSON-LD graph, and reads an itemprop=articleBody element", () => {
    const graph = ld({ "@graph": [{ "@type": "WebSite", name: "x" }, { "@type": "NewsArticle", articleBody: longProse }] });
    expect(extractArticle(page(graph, chromeOnly), URL)!.body).toBe(longProse);

    const micro = page("", `<div itemprop="articleBody">${longProse}</div>${chromeOnly}`);
    expect(extractArticle(micro, URL)!.body).toContain("budget deficit narrowed in the third quarter");
  });

  it("takes the structured text when it is clearly fuller than what the page extraction found", () => {
    const thin = `<article><h1>Budget</h1><p>The finance ministry announced the budget deficit narrowed, officials said on Sunday morning.</p></article>`;
    const ex = extractArticle(page(ld({ "@type": "NewsArticle", articleBody: longProse }), thin), URL)!;

    expect(ex.body).toBe(longProse);
    expect(ex.via).toBe("structured");
  });

  it("ignores a structured body that is itself site chrome", () => {
    const glued = "Ø£Ù‚Ø³Ø§Ù…Ø§Ù„Ù…ÙˆÙ‚Ø¹Ø§Ù„ØµÙØ­Ø©Ø§Ù„Ø±Ø¦ÙŠØ³ÙŠØ©".repeat(12);
    expect(extractArticle(page(ld({ "@type": "NewsArticle", articleBody: glued }), chromeOnly), URL)).toBeNull();
  });
});

describe("extractArticle: the page's own publication date", () => {
  const withMeta = (head: string, body = realParagraphs) => extractArticle(page(head, body), URL)!;

  it("reads article:published_time, JSON-LD datePublished, then a <time datetime> in the article", () => {
    expect(withMeta('<meta property="article:published_time" content="2026-10-12T08:30:00+03:00">').published).toBe("2026-10-12T05:30:00.000Z");
    expect(withMeta('<script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2026-10-11T10:00:00Z"}</script>').published).toBe("2026-10-11T10:00:00.000Z");
    expect(withMeta("", realParagraphs.replace("<article>", '<article><time datetime="2026-10-10T07:00:00Z">yesterday</time>')).published).toBe("2026-10-10T07:00:00.000Z");
  });

  it("has no date when the page gives none or something unparseable, and never makes one up", () => {
    expect(withMeta("").published).toBeUndefined();
    expect(withMeta('<meta property="article:published_time" content="soon">').published).toBeUndefined();
  });
});
describe("looksLikeProse", () => {
  it("accepts ordinary paragraphs in Arabic and English", () => {
    expect(looksLikeProse("أعلنت وزارة المالية أن عجز الميزانية جاء دون التقديرات الأولية للربع الثالث. وأشار البيان إلى ارتفاع الإنفاق الرأسمالي.")).toBe(true);
    expect(looksLikeProse("Officials said the deficit fell well below the forecast. Spending discipline improved across ministries, they added.")).toBe(true);
  });

  it("rejects a menu glued together without spaces", () => {
    expect(looksLikeProse("أقسام الموقعالصفحة الرئيسيةأرشيف الصحيفةآخر الأخبارمحلياتطيبةاقتصاددوليةثقافةرياضةكتابمنتدىوظائفميدياأخبار الشركاء")).toBe(false);
  });

  it("rejects a long run of short items with no sentences", () => {
    const menu = Array.from({ length: 60 }, (_, i) => `قسم${i}`).join(" ");
    expect(looksLikeProse(menu + " " + menu)).toBe(false);
  });

  it("does not judge very short text", () => {
    expect(looksLikeProse("Breaking news")).toBe(true);
  });
});
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
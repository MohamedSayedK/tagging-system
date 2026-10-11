import { describe, expect, it } from "vitest";
import { titleKey } from "../src/ingest/titleKey.js";

describe("titleKey", () => {
  it("is the same for one headline republished with different case, spacing and punctuation", () => {
    const a = titleKey("Saudi Arabia offers 5% annual return on October Sah savings sukuk");
    const b = titleKey("  SAUDI ARABIA offers 5% annual return on October Sah savings sukuk! ");

    expect(a).toBeDefined();
    expect(a).toBe(b);
  });

  it("ignores a trailing outlet name after a dash or pipe, as syndicated copies often add one", () => {
    const a = titleKey("Government approves the new housing programme for families");
    const b = titleKey("Government approves the new housing programme for families | Gulf Daily");
    const c = titleKey("Government approves the new housing programme for families - Arab News");

    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it("treats Arabic spelling variants of the same headline as equal: alef forms, ya, ta marbuta, diacritics, tatweel", () => {
    const a = titleKey("وزير المالية يعلن إطلاق برنامج دعم الأسر السعودية الجديدة");
    const b = titleKey("وزيـر المالية يعلن اطلاق برنامج دعم الاسر السعوديه الجديده");

    expect(a).toBeDefined();
    expect(a).toBe(b);
  });

  it("tells different headlines apart", () => {
    expect(titleKey("Oil prices rise as supply tightens across the region")).not.toBe(
      titleKey("Oil prices fall as supply expands across the region"),
    );
  });

  it("gives no key to headlines too short to compare safely, so they are never collapsed", () => {
    expect(titleKey("Breaking news")).toBeUndefined();
    expect(titleKey("")).toBeUndefined();
    expect(titleKey(undefined)).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { baseLanguage, detectLanguage, toIso3 } from "../src/registry/language.js";

describe("detectLanguage", () => {
  it("recognises Arabic by script", () => {
    expect(detectLanguage(["وزير المالية يعلن الميزانية الجديدة للدولة", "ارتفاع أسعار النفط في الأسواق العالمية"])).toBe("ar");
  });

  it("recognises English from its common words, not just the Latin alphabet", () => {
    expect(detectLanguage(["The government said that the budget will be approved in the next session of parliament"])).toBe("en");
  });

  it("does not call Turkish, French or Spanish English", () => {
    expect(detectLanguage(["Cumhurbaşkanı bugün yaptığı açıklamada ekonomiye ilişkin yeni adımları duyurdu"])).toBeUndefined();
    expect(detectLanguage(["Le gouvernement a annoncé hier de nouvelles mesures pour soutenir les familles"])).toBeUndefined();
    expect(detectLanguage(["El gobierno anunció ayer nuevas medidas para apoyar a las familias del país"])).toBeUndefined();
  });

  it("leaves very short text undecided", () => {
    expect(detectLanguage(["Hello"])).toBeUndefined();
    expect(detectLanguage([])).toBeUndefined();
  });
});

describe("language codes", () => {
  it("reduces a tag to its base language", () => {
    expect(baseLanguage("ar-SA")).toBe("ar");
    expect(baseLanguage(" EN_us ")).toBe("en");
    expect(baseLanguage("not a tag!")).toBeUndefined();
  });

  it("maps two-letter codes to the three-letter ones GDELT uses", () => {
    expect(toIso3("ar")).toBe("ara");
    expect(toIso3("ENG")).toBe("eng");
  });
});

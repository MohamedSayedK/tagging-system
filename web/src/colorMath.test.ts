import { describe, expect, it } from "vitest";
import { hexToHsv, hsvToHex, normalizeHex } from "./colorMath";

describe("colorMath", () => {
  it("normalises hex input: optional #, any case, three or six digits", () => {
    expect(normalizeHex("#9980FA")).toBe("#9980fa");
    expect(normalizeHex("9980fa")).toBe("#9980fa");
    expect(normalizeHex(" #abc ")).toBe("#aabbcc");
    expect(normalizeHex("#12345")).toBeNull();
    expect(normalizeHex("#12345g")).toBeNull();
    expect(normalizeHex("")).toBeNull();
  });

  it("converts to HSV and back without drifting", () => {
    for (const hex of ["#e5484d", "#3e63dd", "#30a46c", "#9980fa", "#000000", "#ffffff", "#808080"]) {
      const { h, s, v } = hexToHsv(hex);
      expect(hsvToHex(h, s, v)).toBe(hex);
    }
  });

  it("knows the primaries", () => {
    expect(hexToHsv("#ff0000")).toEqual({ h: 0, s: 1, v: 1 });
    const green = hexToHsv("#00ff00");
    expect(green.h).toBe(120);
    expect(hsvToHex(240, 1, 1)).toBe("#0000ff");
    expect(hsvToHex(0, 0, 0.5)).toBe("#808080");
  });
});
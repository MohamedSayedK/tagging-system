import { describe, expect, it } from "vitest";
import { addObservations } from "../src/registry/registry.js";

const seen = (domain: string, seenAt: string, language = "eng") => ({ domain, seenAt, language });

describe("addObservations", () => {
  it("builds one record per domain: first and last time seen, article count and languages", () => {
    const records = addObservations(
      [],
      [
        seen("a.com", "2026-10-11T10:00:00.000Z"),
        seen("b.com", "2026-10-11T09:00:00.000Z", "ara"),
        seen("a.com", "2026-10-11T08:00:00.000Z"),
        seen("a.com", "2026-10-11T12:00:00.000Z", "ara"),
      ],
    );

    expect(records.find((r) => r.domain === "a.com")).toEqual({
      domain: "a.com",
      firstSeen: "2026-10-11T08:00:00.000Z",
      lastSeen: "2026-10-11T12:00:00.000Z",
      articleCount: 3,
      languages: ["ara", "eng"],
    });
    expect(records.map((r) => r.domain).sort()).toEqual(["a.com", "b.com"]);
  });

  it("folds a new batch into existing records without changing the input", () => {
    const existing = addObservations([], [seen("a.com", "2026-10-11T08:00:00.000Z"), seen("a.com", "2026-10-11T09:00:00.000Z")]);
    const snapshot = structuredClone(existing);

    const updated = addObservations(existing, [
      seen("a.com", "2026-10-11T11:00:00.000Z", "ara"),
      seen("c.com", "2026-10-11T11:30:00.000Z"),
    ]);

    expect(existing).toEqual(snapshot);
    expect(updated.find((r) => r.domain === "a.com")).toEqual({
      domain: "a.com",
      firstSeen: "2026-10-11T08:00:00.000Z",
      lastSeen: "2026-10-11T11:00:00.000Z",
      articleCount: 3,
      languages: ["ara", "eng"],
    });
    expect(updated.map((r) => r.domain).sort()).toEqual(["a.com", "c.com"]);
  });
});

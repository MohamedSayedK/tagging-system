// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { installFakeApi } from "./test/fakeApi";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const topic = { id: "1", name: "Economy", query: "budget" };
const article = { id: "a", title: "Budget news", source: "S", domain: "s.com", url: "https://s.com/a", published: "2026-10-10T09:00:00Z" };

describe("remove duplicates", () => {
  it("is not offered in the public demo, whose snapshot carries no duplicate information", async () => {
    vi.stubEnv("MODE", "demo");
    installFakeApi({ topics: [topic], resultsByTopic: { "1": [article] } });
    render(<App now={() => new Date("2026-10-11T12:00:00Z")} />);
    await screen.findByRole("heading", { name: "1 results" });

    expect(screen.queryByRole("checkbox", { name: "Remove duplicates" })).not.toBeInTheDocument();
  });

  it("is off at first, and turning it on asks for results without syndicated copies", async () => {
    const api = installFakeApi({ topics: [topic], resultsByTopic: { "1": [article] } });
    // The editor also sends live query checks; only the results calls say anything about duplicates.
    const lastResults = () => api.requests.filter((r) => /\/topics\/[^/]+\/results/.test(r.path)).at(-1)?.path ?? "";
    const user = userEvent.setup();
    render(<App now={() => new Date("2026-10-11T12:00:00Z")} />);
    await user.click(await screen.findByRole("button", { name: /Economy/ }));
    await screen.findByRole("heading", { name: "1 results" });
    const box = screen.getByRole("checkbox", { name: "Remove duplicates" });
    expect(box).not.toBeChecked();
    expect(lastResults()).not.toContain("dedupe");

    await user.click(box);

    expect(box).toBeChecked();
    await vi.waitFor(() => expect(lastResults()).toContain("dedupe=true"), { timeout: 5000 });

    await user.click(box);
    await vi.waitFor(() => expect(lastResults()).not.toContain("dedupe"), { timeout: 5000 });
  });
});

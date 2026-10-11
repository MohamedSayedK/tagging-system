// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { installFakeApi } from "./test/fakeApi";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("demo banner", () => {
  it("is not shown in the normal app", () => {
    installFakeApi();
    render(<App />);

    expect(screen.queryByRole("note", { name: "About this demo" })).not.toBeInTheDocument();
  });

  it("opens the first topic straight away in the demo, so there is something to read at once", async () => {
    vi.stubEnv("MODE", "demo");
    installFakeApi({
      topics: [{ id: "1", name: "Economy", query: "budget" }],
      resultsByTopic: { "1": [{ id: "a", title: "Budget news", source: "S", domain: "s.com", url: "https://s.com/a", published: "2026-10-10T09:00:00Z" }] },
    });
    render(<App />);

    expect(await screen.findByRole("heading", { name: "1 results" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Economy" })).toBeInTheDocument();
  });

  it("does not open a topic by itself in the normal app", async () => {
    installFakeApi({ topics: [{ id: "1", name: "Economy", query: "budget" }], resultsByTopic: { "1": [] } });
    render(<App />);
    await screen.findByRole("button", { name: "Economy" });

    expect(screen.queryByRole("heading", { name: /results$/ })).not.toBeInTheDocument();
  });

  it("explains the public demo: real snapshot, runs in the browser, nothing leaves the device", () => {
    vi.stubEnv("MODE", "demo");
    installFakeApi();
    render(<App />);

    const note = screen.getByRole("note", { name: "About this demo" });
    expect(note).toHaveTextContent("snapshot of real crawled headlines");
    expect(note).toHaveTextContent("registry of news outlets");
    expect(note).toHaveTextContent("stay in this browser");
    expect(screen.getByRole("link", { name: "Source on GitHub" })).toHaveAttribute("href", "https://github.com/MohamedSayedK/tagging-system");
  });
});
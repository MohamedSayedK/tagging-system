// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { installFakeApi } from "./test/fakeApi";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const article = (n: number, over: Record<string, unknown> = {}) => ({
  id: `a${n}`,
  title: `Article ${n}`,
  source: "Arab News",
  domain: "arabnews.com",
  url: `https://arabnews.com/${n}`,
  sourcecountry: "sa",
  lang: "en",
  published: `2026-10-${String(n).padStart(2, "0")}T09:00:00Z`,
  ...over,
});

describe("press cuttings layout", () => {
  it("lists the topics as folder tabs under the masthead, with the open topic marked", async () => {
    installFakeApi({ topics: [{ id: "1", name: "Economy", query: "x" }, { id: "2", name: "Energy", query: "y" }] });
    const user = userEvent.setup();
    render(<App />);

    const tabs = within(await screen.findByRole("navigation", { name: "Topics" }));
    await user.click(await tabs.findByRole("button", { name: "Energy" }));

    expect(tabs.getByRole("button", { name: "Energy" })).toHaveAttribute("aria-pressed", "true");
    expect(tabs.getByRole("button", { name: "Economy" })).toHaveAttribute("aria-pressed", "false");
    // the tabs belong to the masthead: the same header holds the section buttons
    const masthead = screen.getByRole("navigation", { name: "Topics" }).closest("header")!;
    expect(within(masthead).getByRole("button", { name: "Sources" })).toBeInTheDocument();
  });

  it("puts the chart and the filters in a column beside the results", async () => {
    installFakeApi({
      topics: [{ id: "1", name: "T", query: "x" }],
      resultsByTopic: { "1": [article(5), article(9)] },
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "T" }));
    await screen.findByRole("heading", { name: "2 results" });

    const side = screen.getByRole("complementary", { name: "Beside the results" });
    expect(within(side).getByRole("figure", { name: "Results over time" })).toBeInTheDocument();
    expect(within(side).getByRole("complementary", { name: "Filters" })).toBeInTheDocument();
    expect(within(screen.getByRole("main")).queryByRole("figure")).not.toBeInTheDocument();
  });

  it("shows each result as a clipping: a slip with source, place, language, time and a cutting number, then the headline", async () => {
    installFakeApi({
      topics: [{ id: "1", name: "T", query: "x" }],
      resultsByTopic: { "1": [article(9), article(5)] },
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "T" }));
    await screen.findByRole("heading", { name: "2 results" });

    const first = within(screen.getAllByRole("article")[0]!);
    expect(first.getByText("Arab News")).toBeInTheDocument();
    expect(first.getByText(/Saudi Arabia/)).toBeInTheDocument();
    expect(first.getByText(/English/)).toBeInTheDocument();
    expect(first.getByTestId("time")).toHaveTextContent("09:00");
    expect(first.getByText("Cutting № 1")).toBeInTheDocument();
    expect(first.getByRole("heading", { level: 3 })).toHaveTextContent("Article 9");
    expect(within(screen.getAllByRole("article")[1]!).getByText("Cutting № 2")).toBeInTheDocument();
  });

  it("keeps a long query to a few lines until asked for the rest", async () => {
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" OR ");
    installFakeApi({ topics: [{ id: "1", name: "T", query: long }] });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "T" }));

    const toggle = await screen.findByRole("button", { name: "Show the whole query" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Show less of the query" })).toHaveAttribute("aria-expanded", "true");
  });
});
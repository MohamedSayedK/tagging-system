// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { FakeSource, installFakeApi } from "./test/fakeApi";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const NOW = new Date("2026-10-11T12:00:00Z");
const src = (over: Partial<FakeSource> & { name: string }): FakeSource => ({
  domain: `${over.name.toLowerCase().replace(/\W/g, "")}.com`,
  sourcetype: "ONLINENEWS_NEWSPAPER",
  country: "SA",
  lang: "en",
  feedCount: 1,
  intervalMs: 15 * 60_000,
  status: "ok",
  ...over,
});

const sources: FakeSource[] = [
  src({ name: "Zeta Daily", lastRun: "2026-10-11T11:55:00Z", nextRun: "2026-10-11T12:10:00Z", found: 40, indexed: 7, consecutiveFailures: 0 }),
  src({ name: "Alpha Post", country: "EG", lang: "ar", intervalMs: 2 * 3_600_000, lastRun: "2026-10-11T11:00:00Z", nextRun: "2026-10-11T13:00:00Z", found: 12, indexed: 0, consecutiveFailures: 0 }),
  src({
    name: "Broken News",
    sourcetype: "ONLINENEWS_MAGAZINE",
    status: "failing",
    lastRun: "2026-10-11T11:30:00Z",
    nextRun: "2026-10-11T13:30:00Z",
    found: 0,
    indexed: 0,
    consecutiveFailures: 3,
    error: "HTTP 503 https://broken.example/rss",
  }),
  src({ name: "Brand New", status: "pending" }),
];

async function openSources() {
  installFakeApi({ sources });
  const user = userEvent.setup();
  render(<App now={() => NOW} />);
  await user.click(screen.getByRole("button", { name: "Sources" }));
  await screen.findByRole("table", { name: "Sources" });
  return user;
}

describe("sources page", () => {
  it("summarises how many sources are crawled and how many are failing", async () => {
    await openSources();

    expect(screen.getByText("4 sources · 1 failing")).toBeInTheDocument();
  });

  it("lists failing sources first, then the rest by name", async () => {
    await openSources();

    const rows = within(screen.getByRole("table", { name: "Sources" })).getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getAllByRole("cell")[0]!.textContent)).toEqual(["Broken News", "Alpha Post", "Brand New", "Zeta Daily"]);
  });

  it("shows each source's type, country, language, interval, last and next run in plain words", async () => {
    await openSources();

    const row = within(screen.getByRole("row", { name: /Alpha Post/ }));
    expect(row.getByText("Online newspaper")).toBeInTheDocument();
    expect(row.getByText("Egypt")).toBeInTheDocument();
    expect(row.getByText("Arabic")).toBeInTheDocument();
    expect(row.getByText("every 2 hours")).toBeInTheDocument();
    expect(row.getByText("1 hour ago")).toBeInTheDocument();
    expect(row.getByText("in 1 hour")).toBeInTheDocument();
    expect(row.getByText("Healthy")).toBeInTheDocument();
  });

  it("shows how many new articles the last run found, out of how many feed items", async () => {
    await openSources();

    expect(within(screen.getByRole("row", { name: /Zeta Daily/ })).getByText("7 new of 40")).toBeInTheDocument();
  });

  it("explains a failing source: how many failures in a row, and the error", async () => {
    await openSources();

    const row = within(screen.getByRole("row", { name: /Broken News/ }));
    expect(row.getByText("Failing · 3 in a row")).toBeInTheDocument();
    expect(row.getByText("HTTP 503 https://broken.example/rss")).toBeInTheDocument();
    expect(row.getByText("Online magazine")).toBeInTheDocument();
  });

  it("says a source that has never run is waiting for its first run", async () => {
    await openSources();

    const row = within(screen.getByRole("row", { name: /Brand New/ }));
    expect(row.getByText("Waiting for first run")).toBeInTheDocument();
  });

  it("goes back to the topics view", async () => {
    const user = await openSources();

    await user.click(screen.getByRole("button", { name: "Topics" }));

    expect(screen.queryByRole("table", { name: "Sources" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New topic" })).toBeInTheDocument();
  });
});

describe("sources page: finding and fixing", () => {
  const rowNames = () =>
    within(screen.getByRole("table", { name: "Sources" }))
      .getAllByRole("row")
      .slice(1)
      .map((r) => within(r).getAllByRole("cell")[0]!.textContent);

  it("puts what needs attention first, in its own region with the reason and the next retry", async () => {
    await openSources();

    const region = within(screen.getByRole("region", { name: "Needs attention" }));
    expect(region.getByText("Broken News")).toBeInTheDocument();
    expect(region.getByText("HTTP 503 https://broken.example/rss")).toBeInTheDocument();
    expect(region.getByText(/failed 3 times in a row/)).toBeInTheDocument();
    expect(region.getByText(/next try in 2 hours/)).toBeInTheDocument();
    expect(region.queryByText("Zeta Daily")).not.toBeInTheDocument();
  });

  it("has no attention region when everything is healthy", async () => {
    installFakeApi({ sources: sources.filter((s) => s.status !== "failing") });
    const user = userEvent.setup();
    render(<App now={() => NOW} />);
    await user.click(screen.getByRole("button", { name: "Sources" }));
    await screen.findByRole("table", { name: "Sources" });

    expect(screen.queryByRole("region", { name: "Needs attention" })).not.toBeInTheDocument();
    expect(screen.getByText("3 sources · 0 failing")).toBeInTheDocument();
  });

  it("filters by status, with the counts on the buttons", async () => {
    const user = await openSources();
    const group = within(screen.getByRole("group", { name: "Show sources" }));
    expect(group.getByRole("button", { name: "All 4" })).toHaveAttribute("aria-pressed", "true");

    await user.click(group.getByRole("button", { name: "Failing 1" }));
    expect(rowNames()).toEqual(["Broken News"]);

    await user.click(group.getByRole("button", { name: "Healthy 2" }));
    expect(rowNames()).toEqual(["Alpha Post", "Zeta Daily"]);

    await user.click(group.getByRole("button", { name: "Waiting 1" }));
    expect(rowNames()).toEqual(["Brand New"]);

    await user.click(group.getByRole("button", { name: "All 4" }));
    expect(rowNames()).toHaveLength(4);
  });

  it("searches by name, domain, country or language, ignoring case", async () => {
    const user = await openSources();
    const search = screen.getByRole("searchbox", { name: "Search sources" });

    await user.type(search, "zeta");
    expect(rowNames()).toEqual(["Zeta Daily"]);

    await user.clear(search);
    await user.type(search, "EGYPT");
    expect(rowNames()).toEqual(["Alpha Post"]);

    await user.clear(search);
    await user.type(search, "arabic");
    expect(rowNames()).toEqual(["Alpha Post"]);

    await user.clear(search);
    await user.type(search, "alphapost.com");
    expect(rowNames()).toEqual(["Alpha Post"]);
  });

  it("says when nothing matches and offers to show everything again", async () => {
    const user = await openSources();

    await user.type(screen.getByRole("searchbox", { name: "Search sources" }), "no such outlet");

    expect(screen.queryByRole("table", { name: "Sources" })).not.toBeInTheDocument();
    expect(screen.getByText("No sources match “no such outlet”.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show all sources" }));
    expect(rowNames()).toHaveLength(4);
    expect(screen.getByRole("searchbox", { name: "Search sources" })).toHaveValue("");
  });

  it("shows the status as a labelled badge, never colour alone", async () => {
    await openSources();

    const row = within(screen.getByRole("row", { name: /Zeta Daily/ }));
    expect(row.getByText("Healthy").closest("[data-status]")).toHaveAttribute("data-status", "ok");
    expect(within(screen.getByRole("row", { name: /Broken News/ })).getByText("Failing · 3 in a row").closest("[data-status]")).toHaveAttribute("data-status", "failing");
  });
});
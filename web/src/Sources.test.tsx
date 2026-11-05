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

  it("lists the working sources by name, leaving failing ones to their own tab", async () => {
    await openSources();

    const rows = within(screen.getByRole("table", { name: "Sources" })).getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getAllByRole("cell")[0]!.textContent)).toEqual(["Alpha Post", "Brand New", "Zeta Daily"]);
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
    const user = await openSources();
    await user.click(screen.getByRole("tab", { name: "Failing 1" }));

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

  it("marks sources that came from the registry, so they are told apart from the hand-picked ones", async () => {
    installFakeApi({ sources: [src({ name: "Picked Daily", origin: "curated" }), src({ name: "dostor.org", origin: "registry" })] });
    const user = userEvent.setup();
    render(<App now={() => NOW} />);
    await user.click(screen.getByRole("button", { name: "Sources" }));
    await screen.findByRole("table", { name: "Sources" });

    expect(within(screen.getByRole("row", { name: /dostor\.org/ })).getByText("From registry")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /Picked Daily/ })).queryByText("From registry")).not.toBeInTheDocument();
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

  it("keeps failing sources in their own tab, with the reason and the next retry", async () => {
    const user = await openSources();
    expect(screen.getByRole("tab", { name: "Working 3" })).toHaveAttribute("aria-selected", "true");

    await user.click(screen.getByRole("tab", { name: "Failing 1" }));

    expect(screen.getByRole("tab", { name: "Failing 1" })).toHaveAttribute("aria-selected", "true");
    expect(rowNames()).toEqual(["Broken News"]);
    const row = within(screen.getByRole("row", { name: /Broken News/ }));
    expect(row.getByText("HTTP 503 https://broken.example/rss")).toBeInTheDocument();
    expect(row.getByText("in 2 hours")).toBeInTheDocument();
  });

  it("says so when nothing is failing", async () => {
    installFakeApi({ sources: sources.filter((s) => s.status !== "failing") });
    const user = userEvent.setup();
    render(<App now={() => NOW} />);
    await user.click(screen.getByRole("button", { name: "Sources" }));
    await screen.findByRole("table", { name: "Sources" });
    expect(screen.getByText("3 sources · 0 failing")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Failing 0" }));

    expect(screen.getByText("Nothing is failing.")).toBeInTheDocument();
  });

  it("filters the working sources by status, with the counts on the buttons", async () => {
    const user = await openSources();
    const group = within(screen.getByRole("group", { name: "Show sources" }));
    expect(group.getByRole("button", { name: "All 3" })).toHaveAttribute("aria-pressed", "true");

    await user.click(group.getByRole("button", { name: "Healthy 2" }));
    expect(rowNames()).toEqual(["Alpha Post", "Zeta Daily"]);

    await user.click(group.getByRole("button", { name: "Waiting 1" }));
    expect(rowNames()).toEqual(["Brand New"]);

    await user.click(group.getByRole("button", { name: "All 3" }));
    expect(rowNames()).toHaveLength(3);
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
    expect(rowNames()).toHaveLength(3);
    expect(screen.getByRole("searchbox", { name: "Search sources" })).toHaveValue("");
  });

  it("shows the status as a labelled badge, never colour alone", async () => {
    await openSources();

    const row = within(screen.getByRole("row", { name: /Zeta Daily/ }));
    expect(row.getByText("Healthy").closest("[data-status]")).toHaveAttribute("data-status", "ok");
  });
});
describe("sources page: pages", () => {
  const many = Array.from({ length: 120 }, (_, i) => src({ name: `Outlet ${String(i + 1).padStart(3, "0")}` }));
  const rowNames = () =>
    within(screen.getByRole("table", { name: "Sources" }))
      .getAllByRole("row")
      .slice(1)
      .map((r) => within(r).getAllByRole("cell")[0]!.textContent);

  async function openMany() {
    installFakeApi({ sources: many });
    const user = userEvent.setup();
    render(<App now={() => NOW} />);
    await user.click(screen.getByRole("button", { name: "Sources" }));
    await screen.findByRole("table", { name: "Sources" });
    return user;
  }

  it("shows 50 sources a page and moves between pages", async () => {
    const user = await openMany();
    const pages = within(screen.getByRole("navigation", { name: "Source pages" }));

    expect(rowNames()).toHaveLength(50);
    expect(rowNames()[0]).toBe("Outlet 001");
    expect(pages.getByText("1–50 of 120")).toBeInTheDocument();
    expect(pages.getByRole("button", { name: "Previous page" })).toBeDisabled();

    await user.click(pages.getByRole("button", { name: "Next page" }));
    expect(rowNames()[0]).toBe("Outlet 051");

    await user.click(pages.getByRole("button", { name: "Next page" }));
    expect(rowNames()).toHaveLength(20);
    expect(pages.getByText("101–120 of 120")).toBeInTheDocument();
    expect(pages.getByRole("button", { name: "Next page" })).toBeDisabled();

    await user.click(pages.getByRole("button", { name: "Previous page" }));
    expect(rowNames()[0]).toBe("Outlet 051");
  });

  it("goes back to the first page when the search changes", async () => {
    const user = await openMany();
    await user.click(screen.getByRole("button", { name: "Next page" }));

    await user.type(screen.getByRole("searchbox", { name: "Search sources" }), "Outlet 00");

    expect(rowNames()[0]).toBe("Outlet 001");
    expect(screen.queryByRole("navigation", { name: "Source pages" })).not.toBeInTheDocument();
  });
});

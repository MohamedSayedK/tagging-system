// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { FakeRegistryRecord, installFakeApi } from "./test/fakeApi";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const NOW = new Date("2026-10-11T12:00:00Z");
const rec = (domain: string, articleCount: number, languages: string[], lastSeen = "2026-10-11T11:00:00.000Z"): FakeRegistryRecord => ({
  domain,
  firstSeen: "2026-10-11T08:00:00.000Z",
  lastSeen,
  articleCount,
  languages,
});

const records = [
  rec("argaam.com", 305, ["ara"]),
  rec("zazoom.it", 270, ["ita"], "2026-10-10T12:00:00.000Z"),
  rec("ansa.it", 34, ["ara", "ita"]),
  rec("arabnews.com", 40, ["eng"]),
];

async function openRegistry(data = records) {
  const api = installFakeApi({ registry: data });
  const user = userEvent.setup();
  render(<App now={() => NOW} />);
  await user.click(screen.getByRole("button", { name: "Registry" }));
  await screen.findByRole("table", { name: "Known domains" });
  return { user, api };
}

const domains = () =>
  within(screen.getByRole("table", { name: "Known domains" }))
    .getAllByRole("row")
    .slice(1)
    // the cell reads "domain" then, in smaller type, its country and flags; the domain is the first text
    .map((r) => within(r).getAllByRole("cell")[0]!.childNodes[0]!.textContent);

describe("registry page", () => {
  it("is offered in the public demo too, which answers it from a registry snapshot", async () => {
    vi.stubEnv("MODE", "demo");
    installFakeApi({ registry: [rec("argaam.com", 604, ["ara"])] });
    const user = userEvent.setup();
    render(<App now={() => NOW} />);

    await user.click(screen.getByRole("button", { name: "Registry" }));

    expect(await screen.findByRole("table", { name: "Known domains" })).toBeInTheDocument();
    expect(domains()).toEqual(["argaam.com"]);
  });

  it("says how many domains are known and lists them by volume with language, articles seen and last seen", async () => {
    await openRegistry();

    expect(screen.getByText("4 domains known")).toBeInTheDocument();
    expect(domains()).toEqual(["argaam.com", "zazoom.it", "arabnews.com", "ansa.it"]);
    const row = within(screen.getByRole("row", { name: /ansa\.it/ }));
    expect(row.getByText("Arabic, Italian")).toBeInTheDocument();
    expect(row.getByText("34")).toBeInTheDocument();
    expect(row.getByText("1 hour ago")).toBeInTheDocument();
  });

  it("says in plain words whether each domain is being crawled yet", async () => {
    await openRegistry([
      { ...rec("live.com", 50, ["ara"]), crawl: { status: "active", checkedAt: "2026-10-11T10:00:00.000Z" } },
      { ...rec("nofeed.com", 40, ["eng"]), crawl: { status: "no_feed", checkedAt: "2026-10-11T10:00:00.000Z" } },
      { ...rec("down.com", 30, ["eng"]), crawl: { status: "unreachable", checkedAt: "2026-10-11T10:00:00.000Z" } },
      { ...rec("closed.com", 20, ["eng"]), crawl: { status: "blocked", checkedAt: "2026-10-11T10:00:00.000Z" } },
      rec("new.com", 10, ["eng"]),
    ]);

    const state = (domain: string) => within(screen.getByRole("row", { name: new RegExp(domain.replace(".", "\\.")) }));
    expect(state("live.com").getByText("Crawled")).toBeInTheDocument();
    expect(state("nofeed.com").getByText("No usable feed")).toBeInTheDocument();
    expect(state("down.com").getByText("Unreachable")).toBeInTheDocument();
    expect(state("closed.com").getByText("Blocks crawlers")).toBeInTheDocument();
    expect(state("new.com").getByText("Not tried yet")).toBeInTheDocument();
  });

  it("shows each outlet's country by name and marks aggregators", async () => {
    await openRegistry([
      { ...rec("argaam.com", 50, ["ara"]), country: "SA", aggregator: false },
      { ...rec("zazoom.it", 40, ["ita"]), country: "IT", aggregator: true },
      rec("mystery.com", 10, ["eng"]),
    ]);

    const argaam = within(screen.getByRole("row", { name: /argaam\.com/ }));
    expect(argaam.getByText("Saudi Arabia")).toBeInTheDocument();
    expect(argaam.queryByText("Aggregator")).not.toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /zazoom\.it/ })).getByText("Aggregator")).toBeInTheDocument();
  });

  it("can hide aggregators, so the list is outlets that report their own stories", async () => {
    const { user } = await openRegistry([
      { ...rec("argaam.com", 50, ["ara"]), aggregator: false },
      { ...rec("zazoom.it", 40, ["ita"]), aggregator: true },
    ]);
    expect(domains()).toEqual(["argaam.com", "zazoom.it"]);

    await user.click(screen.getByRole("checkbox", { name: "Hide aggregators" }));

    expect(await screen.findByText("1 domain matches")).toBeInTheDocument();
    expect(domains()).toEqual(["argaam.com"]);
  });

  it("'Show all domains' also turns hiding aggregators off, so it really shows everything", async () => {
    const { user } = await openRegistry([{ ...rec("zazoom.it", 40, ["ita"]), aggregator: true }]);

    await user.click(screen.getByRole("checkbox", { name: "Hide aggregators" }));
    expect(await screen.findByText("No domains in this view.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show all domains" }));

    expect(await screen.findByRole("table", { name: "Known domains" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Hide aggregators" })).not.toBeChecked();
  });

  it("searches domains as you type, case-insensitively, and says how many match", async () => {
    const { user } = await openRegistry();

    await user.type(screen.getByRole("searchbox", { name: "Search domains" }), "ARAB");

    expect(await screen.findByText("1 domain matches")).toBeInTheDocument();
    expect(domains()).toEqual(["arabnews.com"]);
  });

  it("says when no domain matches and offers to clear the search", async () => {
    const { user } = await openRegistry();

    await user.type(screen.getByRole("searchbox", { name: "Search domains" }), "zzz");

    expect(await screen.findByText("No domains match “zzz”.")).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Known domains" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show all domains" }));
    expect(await screen.findByText("4 domains known")).toBeInTheDocument();
  });

  it("filters by language, keeping publishers that carry more than one", async () => {
    const { user } = await openRegistry();
    const group = within(screen.getByRole("group", { name: "Show domains in" }));
    expect(group.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");

    await user.click(group.getByRole("button", { name: "Arabic" }));

    expect(await screen.findByText("2 domains match")).toBeInTheDocument();
    expect(domains()).toEqual(["argaam.com", "ansa.it"]);
    expect(group.getByRole("button", { name: "Arabic" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows the busiest 50 first and loads more on request, until all are shown", async () => {
    const many = Array.from({ length: 120 }, (_, i) => rec(`site${String(i + 1).padStart(3, "0")}.com`, 1000 - i, ["eng"]));
    const { user } = await openRegistry(many);
    expect(domains()).toHaveLength(50);
    expect(screen.getByText("Showing 50 of 120")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show more" }));
    expect(await screen.findByText("Showing 100 of 120")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show more" }));
    expect(await screen.findByText("Showing 120 of 120")).toBeInTheDocument();
    expect(domains()).toHaveLength(120);
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
    expect(domains()[0]).toBe("site001.com");
    expect(domains()[119]).toBe("site120.com");
  });
});

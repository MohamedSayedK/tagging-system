// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { installFakeApi } from "./test/fakeApi";

const NOW = new Date("2026-10-12T12:00:00Z");
const article = (n: number, over: Record<string, unknown> = {}) => ({
  id: `a${n}`,
  title: `Article ${n}`,
  source: "S",
  domain: "a.com",
  url: `https://a.com/${n}`,
  sourcetype: "blog",
  sourcecountry: "us",
  lang: "en",
  published: `2026-10-${String(n).padStart(2, "0")}T09:00:00Z`,
  ...over,
});

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const seed = () =>
  installFakeApi({
    topics: [{ id: "1", name: "T", query: "x" }],
    resultsByTopic: { "1": [article(1, { domain: "b.com" }), article(8, { domain: "b.com" }), article(9), article(10)] },
  });

const open = async (now = NOW) => {
  const user = userEvent.setup();
  render(<App now={() => now} />);
  await user.click(await screen.findByRole("button", { name: "T" }));
  await screen.findByRole("heading", { name: /\d+ results/ });
  return user;
};
const bar = () => within(screen.getByRole("region", { name: "Filter bar" }));
const chooseDomain = async (user: ReturnType<typeof userEvent.setup>, label: string) => {
  await user.click(screen.getByRole("button", { name: "Domain" }));
  await user.click(within(screen.getByRole("group", { name: "Domain" })).getByRole("checkbox", { name: label }));
};
const saveAs = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
  await user.click(bar().getByRole("button", { name: "Save filters" }));
  await user.type(bar().getByRole("textbox", { name: "Name for these filters" }), name);
  await user.click(bar().getByRole("button", { name: "Save" }));
};

describe("saved filters", () => {
  it("can only be saved when some filter is active", async () => {
    seed();
    const user = await open();
    expect(bar().getByRole("button", { name: "Save filters" })).toBeDisabled();

    await user.click(bar().getByRole("button", { name: "7D" }));
    expect(bar().getByRole("button", { name: "Save filters" })).toBeEnabled();
  });

  it("saves the active facets and date range under a name and applies them again later", async () => {
    seed();
    const user = await open();
    await chooseDomain(user, "b.com (2)");
    await user.click(bar().getByRole("button", { name: "30D" }));
    await saveAs(user, "Blog month");

    expect(bar().getByRole("button", { name: "Apply saved filters: Blog month" })).toBeInTheDocument();

    await user.click(bar().getByRole("button", { name: "Clear all filters" }));
    await user.click(bar().getByRole("button", { name: "All time" }));
    expect(bar().getByText("No active filters.")).toBeInTheDocument();

    await user.click(bar().getByRole("button", { name: "Apply saved filters: Blog month" }));

    expect(bar().getByText("Domain: b.com")).toBeInTheDocument();
    expect(bar().getByRole("button", { name: "30D" })).toHaveAttribute("aria-pressed", "true");
  });

  it("is still there after a reload", async () => {
    seed();
    const user = await open();
    await user.click(bar().getByRole("button", { name: "7D" }));
    await saveAs(user, "Last week");
    cleanup();

    seed();
    await open();

    expect(bar().getByRole("button", { name: "Apply saved filters: Last week" })).toBeInTheDocument();
  });

  it("keeps a preset relative: 7D applied three days later covers the last seven days from then", async () => {
    seed();
    const user = await open();
    await user.click(bar().getByRole("button", { name: "7D" }));
    await saveAs(user, "Last week");
    cleanup();

    seed();
    const later = await open(new Date("2026-10-15T12:00:00Z"));
    await later.click(bar().getByRole("button", { name: "Apply saved filters: Last week" }));

    expect(bar().getByLabelText("From")).toHaveValue("2026-10-08");
    expect(bar().getByLabelText("To")).toHaveValue("2026-10-15");
  });

  it("deletes a saved filter set", async () => {
    seed();
    const user = await open();
    await user.click(bar().getByRole("button", { name: "7D" }));
    await saveAs(user, "Last week");

    await user.click(bar().getByRole("button", { name: "Delete saved filters: Last week" }));

    expect(bar().queryByRole("button", { name: "Apply saved filters: Last week" })).not.toBeInTheDocument();
  });
});
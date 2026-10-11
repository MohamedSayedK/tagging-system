// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
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
  published: `2026-10-${String(n).padStart(2, "0")}T09:00:00Z`,
  ...over,
});
const topics = [{ id: "1", name: "T", query: "x" }];
const titles = () => screen.getAllByRole("listitem").map((li) => within(li).getByRole("link").textContent);

describe("topics list", () => {
  it("says it is loading, then shows the topics", async () => {
    const api = installFakeApi({ topics });
    const release = api.hold(/GET \/topics$/);
    render(<App />);

    expect(await screen.findByText("Loading topics…")).toBeInTheDocument();
    await act(async () => release());

    expect(await screen.findByRole("button", { name: "T" })).toBeInTheDocument();
    expect(screen.queryByText("Loading topics…")).not.toBeInTheDocument();
  });

  it("explains a failure with the reason, and Try again recovers", async () => {
    const api = installFakeApi({ topics });
    api.failNext(/GET \/topics$/, { status: 500, message: "OpenSearch is down" });
    const user = userEvent.setup();
    render(<App />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load the topics");
    expect(alert).toHaveTextContent("OpenSearch is down");

    await user.click(within(alert).getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("button", { name: "T" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("treats a gateway error (the dev proxy with the API down) as 'can't reach the server'", async () => {
    const api = installFakeApi({ topics });
    api.failNext(/GET \/topics$/, { status: 502 });
    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Can't reach the server");
  });

  it("says when the server cannot be reached at all", async () => {
    const api = installFakeApi({ topics });
    api.networkDownNext(/GET \/topics$/);
    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Can't reach the server");
  });
});

describe("results", () => {
  const seed = () =>
    installFakeApi({ topics, resultsByTopic: { "1": [article(5), article(9)] } });

  it("shows a loading message instead of nothing while the first results arrive", async () => {
    const api = seed();
    const release = api.hold(/GET \/topics\/1\/results/);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "T" }));

    expect(await screen.findByText("Loading results…")).toBeInTheDocument();
    await act(async () => release());

    expect(await screen.findByRole("heading", { name: "2 results" })).toBeInTheDocument();
    expect(screen.queryByText("Loading results…")).not.toBeInTheDocument();
  });

  it("keeps the previous results visible, marked as updating, while a filter change loads", async () => {
    const api = seed();
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "T" }));
    await screen.findByRole("heading", { name: "2 results" });

    const release = api.hold(/GET \/topics\/1\/results.*sort=oldest/);
    await user.selectOptions(screen.getByRole("combobox", { name: "Sort by" }), "Oldest first");

    expect(await screen.findByText("Updating results…")).toBeInTheDocument();
    expect(titles()).toEqual(["Article 9", "Article 5"]); // still the old order, not blank
    await act(async () => release());

    await waitFor(() => expect(titles()).toEqual(["Article 5", "Article 9"]));
    expect(screen.queryByText("Updating results…")).not.toBeInTheDocument();
  });

  it("shows an error with the reason when results fail, and Try again reloads them", async () => {
    const api = seed();
    api.failNext(/GET \/topics\/1\/results/, { status: 503, message: "Search is warming up" });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "T" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load the results");
    expect(alert).toHaveTextContent("Search is warming up");
    expect(screen.queryByRole("heading", { name: /results$/ })).not.toBeInTheDocument();

    await user.click(within(alert).getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { name: "2 results" })).toBeInTheDocument();
  });
});

describe("load more", () => {
  const many = () =>
    installFakeApi({
      topics,
      resultsByTopic: { "1": Array.from({ length: 30 }, (_, i) => article(i + 1, { published: `2026-09-${String(i + 1).padStart(2, "0")}T00:00:00Z` })) },
    });
  const open = async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "T" }));
    await screen.findByRole("heading", { name: "30 results" });
    return user;
  };

  it("disables the button and says Loading… while the next page is on its way", async () => {
    const api = many();
    const user = await open();
    const release = api.hold(/offset=25/);

    await user.click(screen.getByRole("button", { name: "Load more" }));

    const busy = await screen.findByRole("button", { name: "Loading…" });
    expect(busy).toBeDisabled();
    await act(async () => release());
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(30));
  });

  it("keeps the results and offers another try when loading more fails", async () => {
    const api = many();
    const user = await open();
    api.failNext(/offset=25/, { status: 500, message: "Timeout" });

    await user.click(screen.getByRole("button", { name: "Load more" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load more results");
    expect(screen.getAllByRole("listitem")).toHaveLength(25);

    await user.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(30));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("saving and deleting topics", () => {
  it("tells the user why saving failed and keeps what they typed", async () => {
    const api = installFakeApi({ topics });
    api.failNext(/POST \/topics$/, { status: 400, message: "`name` is required" });
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByRole("textbox", { name: "Topic name" }), "Budget");
    await user.type(screen.getByRole("textbox", { name: "Topic query" }), "budget");
    const save = screen.getByRole("button", { name: "Save topic" });
    await waitFor(() => expect(save).toBeEnabled());

    await user.click(save);

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save the topic: `name` is required");
    expect(screen.getByRole("textbox", { name: "Topic name" })).toHaveValue("Budget");
    expect(save).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Budget" })).not.toBeInTheDocument();

    await user.click(save); // second attempt works and clears the message
    expect(await screen.findByRole("button", { name: "Budget" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("disables Save while it is saving, so a double click cannot create two topics", async () => {
    const api = installFakeApi({ topics });
    const release = api.hold(/POST \/topics$/);
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByRole("textbox", { name: "Topic name" }), "Budget");
    await user.type(screen.getByRole("textbox", { name: "Topic query" }), "budget");
    const save = screen.getByRole("button", { name: "Save topic" });
    await waitFor(() => expect(save).toBeEnabled());

    await user.click(save);

    expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();
    await act(async () => release());
    await screen.findByRole("button", { name: "Budget" });
    expect(api.requests.filter((r) => r.method === "POST" && r.path === "/api/topics")).toHaveLength(1);
  });

  it("keeps the topic and says why when deleting fails", async () => {
    const api = installFakeApi({ topics, resultsByTopic: { "1": [] } });
    api.failNext(/DELETE /, { status: 500, message: "Index is read-only" });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "T" }));

    await user.click(screen.getByRole("button", { name: "Delete topic" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't delete the topic: Index is read-only");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "T" })).toBeInTheDocument();
  });
});

describe("query checking", () => {
  it("says so when the query could not be checked, instead of staying silent", async () => {
    const api = installFakeApi({ topics });
    api.failNext(/POST \/query\/validate/, { status: 500, message: "Parser crashed" });
    const user = userEvent.setup();
    render(<App />);

    const query = screen.getByRole("textbox", { name: "Topic query" });
    await user.type(query, "budget");

    await waitFor(() => expect(query).toHaveAccessibleDescription("Couldn't check the query: Parser crashed"));
    expect(screen.getByRole("button", { name: "Save topic" })).toBeDisabled();
  });
});

describe("sources page", () => {
  const open = async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Sources" }));
    return user;
  };

  it("says it is loading", async () => {
    const api = installFakeApi({ topics });
    const release = api.hold(/GET \/sources/);
    await open();

    expect(await screen.findByText("Loading sources…")).toBeInTheDocument();
    await act(async () => release());
    await waitFor(() => expect(screen.queryByText("Loading sources…")).not.toBeInTheDocument());
  });

  it("explains a failure and recovers on Try again", async () => {
    const api = installFakeApi({
      topics,
      sources: [{ name: "Arab News", domain: "arabnews.com", sourcetype: "BLOG", feedCount: 1, intervalMs: 900000, status: "ok", found: 1, indexed: 1, consecutiveFailures: 0 }],
    });
    api.failNext(/GET \/sources/, { status: 500, message: "sources.yaml is invalid" });
    const user = await open();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load the sources");
    expect(alert).toHaveTextContent("sources.yaml is invalid");

    await user.click(within(alert).getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("table", { name: "Sources" })).toBeInTheDocument();
  });
});

describe("filters panel", () => {
  it("shows an error when Show more fails and lets the user try again", async () => {
    const api = installFakeApi({
      topics,
      resultsByTopic: { "1": Array.from({ length: 25 }, (_, i) => article(i + 1, { domain: `d${String(i + 1).padStart(2, "0")}.com` })) },
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "T" }));
    await screen.findByRole("heading", { name: "25 results" });
    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.click(screen.getByRole("button", { name: "Domain" }));
    api.failNext(/GET \/topics\/1\/facets\/domain/, { status: 500, message: "Facet query failed" });

    await user.click(screen.getByRole("button", { name: "Show more" }));

    const panel = within(screen.getByRole("complementary", { name: "Filters" }));
    expect(await panel.findByRole("alert")).toHaveTextContent("Couldn't load more values: Facet query failed");

    await user.click(panel.getByRole("button", { name: "Show more" }));
    await waitFor(() => expect(panel.getAllByRole("checkbox")).toHaveLength(25));
    expect(panel.queryByRole("alert")).not.toBeInTheDocument();
  });
});


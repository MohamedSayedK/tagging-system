// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { installFakeApi } from "./test/fakeApi";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("topic editor: live query validation", () => {
  it("reports the syntax error and its position while typing, then confirms a valid query", async () => {
    installFakeApi();
    const user = userEvent.setup();
    render(<App />);

    const query = screen.getByRole("textbox", { name: "Topic query" });
    await user.type(query, '("a" OR "b"');
    await waitFor(() => expect(query).toHaveAccessibleDescription("Missing closing parenthesis (at position 0)"));

    await user.type(query, ")");
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Topic query" })).toHaveAccessibleDescription("Query is valid"));
  });
});

describe("topic editor: saving a new topic", () => {
  it("keeps Save disabled until there is a name and a valid query, then saves and lists the topic", async () => {
    const api = installFakeApi();
    const user = userEvent.setup();
    render(<App />);

    const save = screen.getByRole("button", { name: "Save topic" });
    expect(save).toBeDisabled();

    await user.type(screen.getByRole("textbox", { name: "Topic query" }), '"حساب المواطن" NEAR/8 دعم');
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Topic query" })).toHaveAccessibleDescription("Query is valid"));
    expect(save).toBeDisabled(); // still no name

    await user.type(screen.getByRole("textbox", { name: "Topic name" }), "Citizen account");
    expect(save).toBeEnabled();

    await user.click(save);

    expect(await screen.findByRole("button", { name: "Citizen account" })).toBeInTheDocument();
    expect(api.requests.find((r) => r.method === "POST" && r.path === "/api/topics")?.body).toMatchObject({
      name: "Citizen account",
      query: '"حساب المواطن" NEAR/8 دعم',
    });
  });
});

describe("topic editor: exclude from topic", () => {
  it("validates the exclude query too, blocks Save while it is invalid, and saves it with the topic", async () => {
    const api = installFakeApi();
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole("textbox", { name: "Topic name" }), "Budget");
    await user.type(screen.getByRole("textbox", { name: "Topic query" }), "budget");
    const exclude = screen.getByRole("textbox", { name: "Exclude from topic" });
    await user.type(exclude, "(sports");

    const save = screen.getByRole("button", { name: "Save topic" });
    await waitFor(() => expect(exclude).toHaveAccessibleDescription(/Missing closing parenthesis/));
    expect(save).toBeDisabled();

    await user.type(exclude, ")");
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);

    await screen.findByRole("button", { name: "Budget" });
    expect(api.requests.find((r) => r.method === "POST" && r.path === "/api/topics")?.body).toEqual({
      name: "Budget",
      query: "budget",
      exclude: "(sports)",
    });
  });
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

describe("results list", () => {
  it("shows the total and each result's title, source, date and highlighted snippet for the selected topic", async () => {
    installFakeApi({
      topics: [{ id: "1", name: "Citizen account", query: "citizen" }],
      resultsByTopic: {
        "1": [
          article(9, { title: "حساب المواطن يعلن الدفعة", source: "الشرق", highlight: { body: ["موعد <em>الدعم</em> القادم"] } }),
          article(8, { title: "Payment date set" }),
        ],
      },
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Citizen account" }));

    expect(await screen.findByRole("heading", { name: "2 results" })).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);

    const first = within(items[0]!);
    expect(first.getByRole("link", { name: "حساب المواطن يعلن الدفعة" })).toHaveAttribute("href", "https://arabnews.com/9");
    expect(first.getByText("الشرق")).toBeInTheDocument();
    expect(first.getByTestId("time")).toHaveTextContent("09:00");
    expect(screen.getByRole("group", { name: "Fri 9 Oct" })).toContainElement(first.getByTestId("time"));
    expect(first.getByText("الدعم", { selector: "mark" })).toBeInTheDocument();
  });
});

const titles = () => screen.getAllByRole("listitem").map((li) => within(li).getByRole("link").textContent);

describe("results list: untrusted article text and Arabic", () => {
  it("renders markup in titles and snippets as plain text, and lets each text pick its own direction", async () => {
    installFakeApi({
      topics: [{ id: "1", name: "T", query: "x" }],
      resultsByTopic: {
        "1": [
          article(9, {
            title: "<img src=x onerror=alert(1)> عنوان",
            highlight: { body: ["قبل <script>alert(1)</script> <em>حساب</em> بعد"] },
          }),
        ],
      },
    });
    const user = userEvent.setup();
    const { container } = render(<App />);
    await user.click(await screen.findByRole("button", { name: "T" }));

    const link = await screen.findByRole("link", { name: "<img src=x onerror=alert(1)> عنوان" });
    expect(link).toHaveAttribute("dir", "auto");
    expect(container.querySelector("img, script")).toBeNull();
    expect(screen.getByText("حساب", { selector: "mark" })).toBeInTheDocument();
    expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toHaveAttribute("dir", "auto");
  });
});

describe("results list: sorting", () => {
  it("offers Most relevant: asks the server for the best matches first and lists them as one ranked group", async () => {
    const api = installFakeApi({
      topics: [{ id: "1", name: "T", query: "x" }],
      // fixture order is the relevance order: the oldest article is the best match
      resultsByTopic: { "1": [article(5), article(9), article(7)] },
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "T" }));
    await screen.findByRole("heading", { name: "3 results" });

    await user.selectOptions(screen.getByRole("combobox", { name: "Sort by" }), "Most relevant");

    await waitFor(() => expect(titles()).toEqual(["Article 5", "Article 9", "Article 7"]));
    expect(api.requests.some((r) => r.path.includes("/results") && r.path.includes("sort=relevance"))).toBe(true);
    // one group instead of a heading per day, and each row says which day it is from
    expect(screen.getAllByRole("group", { name: "Best matches first" })).toHaveLength(1);
    expect(screen.getAllByTestId("time")[0]!.parentElement).toHaveTextContent(/\d{1,2} \w{3}/);
  });
  it("lists the most recent first and re-sorts to oldest first on request", async () => {
    installFakeApi({
      topics: [{ id: "1", name: "T", query: "x" }],
      resultsByTopic: { "1": [article(5), article(9), article(7)] },
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "T" }));
    await screen.findByRole("heading", { name: "3 results" });
    expect(titles()).toEqual(["Article 9", "Article 7", "Article 5"]);

    await user.selectOptions(screen.getByRole("combobox", { name: "Sort by" }), "Oldest first");

    await waitFor(() => expect(titles()).toEqual(["Article 5", "Article 7", "Article 9"]));
  });
});

describe("results list: paging", () => {
  it("appends the next page on Load more and hides the button once everything is shown", async () => {
    installFakeApi({
      topics: [{ id: "1", name: "T", query: "x" }],
      resultsByTopic: { "1": Array.from({ length: 30 }, (_, i) => article(i + 1, { published: `2026-09-${String(i + 1).padStart(2, "0")}T00:00:00Z` })) },
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "T" }));
    await screen.findByRole("heading", { name: "30 results" });
    expect(screen.getAllByRole("listitem")).toHaveLength(25);

    await user.click(screen.getByRole("button", { name: "Load more" }));

    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(30));
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("starts again from the first page when the sort order changes", async () => {
    installFakeApi({
      topics: [{ id: "1", name: "T", query: "x" }],
      resultsByTopic: { "1": Array.from({ length: 30 }, (_, i) => article(i + 1, { published: `2026-09-${String(i + 1).padStart(2, "0")}T00:00:00Z` })) },
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "T" }));
    await screen.findByRole("heading", { name: "30 results" });
    await user.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(30));

    await user.selectOptions(screen.getByRole("combobox", { name: "Sort by" }), "Oldest first");

    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(25));
  });
});

describe("results list: date range", () => {
  it("narrows results to the chosen days, including the whole of the last day", async () => {
    installFakeApi({
      topics: [{ id: "1", name: "T", query: "x" }],
      resultsByTopic: {
        "1": [
          article(5, { published: "2026-10-05T12:00:00Z" }),
          article(8, { published: "2026-10-08T00:00:00Z" }),
          article(10, { published: "2026-10-10T20:30:00Z" }),
          article(12, { published: "2026-10-12T08:00:00Z" }),
        ],
      },
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "T" }));
    await screen.findByRole("heading", { name: "4 results" });

    await user.type(screen.getByLabelText("From"), "2026-10-08");
    await user.type(screen.getByLabelText("To"), "2026-10-10");

    await screen.findByRole("heading", { name: "2 results" });
    expect(titles()).toEqual(["Article 10", "Article 8"]);
  });
});

describe("topic editor: editing and deleting", () => {
  const setup = () =>
    installFakeApi({
      topics: [{ id: "1", name: "Citizen account", query: "citizen", exclude: "weather" }],
      resultsByTopic: { "1": [article(9)] },
    });

  it("loads the selected topic into the editor and saves changes to it instead of creating a new one", async () => {
    const api = setup();
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Citizen account" }));
    const name = screen.getByRole("textbox", { name: "Topic name" });
    expect(name).toHaveValue("Citizen account");
    expect(screen.getByRole("textbox", { name: "Topic query" })).toHaveValue("citizen");
    expect(screen.getByRole("textbox", { name: "Exclude from topic" })).toHaveValue("weather");

    await user.clear(name);
    await user.type(name, "Citizen account v2");
    const save = screen.getByRole("button", { name: "Save topic" });
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);

    expect(await screen.findByRole("button", { name: "Citizen account v2" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Citizen account" })).not.toBeInTheDocument();
    const put = api.requests.find((r) => r.method === "PUT");
    expect(put?.path).toBe("/api/topics/1");
    expect(put?.body).toMatchObject({ name: "Citizen account v2", query: "citizen", exclude: "weather" });
    expect(api.requests.some((r) => r.method === "POST" && r.path === "/api/topics")).toBe(false);
  });

  it("re-runs the results after a saved edit, since the query may have changed", async () => {
    const api = setup();
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Citizen account" }));
    await screen.findByRole("heading", { name: "1 results" });
    const resultCalls = () => api.requests.filter((r) => r.path.startsWith("/api/topics/1/results")).length;
    const before = resultCalls();

    await user.type(screen.getByRole("textbox", { name: "Topic query" }), " OR account");
    const save = screen.getByRole("button", { name: "Save topic" });
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);

    await waitFor(() => expect(resultCalls()).toBe(before + 1));
  });

  describe("deleting asks in the app, not with the browser's dialog", () => {
    const openDialog = async () => {
      setup();
      const confirm = vi.fn(() => true);
      vi.stubGlobal("confirm", confirm);
      const user = userEvent.setup();
      render(<App />);
      await user.click(await screen.findByRole("button", { name: "Citizen account" }));
      await screen.findByRole("heading", { name: "1 results" });
      const trigger = screen.getByRole("button", { name: "Delete topic" });
      await user.click(trigger);
      const dialog = await screen.findByRole("alertdialog", { name: "Delete “Citizen account”?" });
      return { user, dialog: within(dialog), confirm, trigger };
    };

    it("opens a dialog that names the topic and says what is and is not affected", async () => {
      const { dialog, confirm } = await openDialog();

      expect(dialog.getByText(/removes the topic and its saved query/i)).toBeInTheDocument();
      expect(dialog.getByText(/articles themselves are not affected/i)).toBeInTheDocument();
      expect(confirm).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Citizen account" })).toBeInTheDocument(); // nothing deleted yet
    });

    it("starts on the safe choice: Keep topic has focus", async () => {
      const { dialog } = await openDialog();

      expect(dialog.getByRole("button", { name: "Keep topic" })).toHaveFocus();
    });

    it("deletes the topic and clears its results when confirmed", async () => {
      const { user, dialog } = await openDialog();

      await user.click(dialog.getByRole("button", { name: "Delete" }));

      await waitFor(() => expect(screen.queryByRole("button", { name: "Citizen account" })).not.toBeInTheDocument());
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "1 results" })).not.toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Topic name" })).toHaveValue("");
    });

    it("keeps the topic on Keep topic, and puts focus back where it was", async () => {
      const { user, dialog, trigger } = await openDialog();

      await user.click(dialog.getByRole("button", { name: "Keep topic" }));

      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Citizen account" })).toBeInTheDocument();
      expect(trigger).toHaveFocus();
    });

    it("keeps the topic on Escape", async () => {
      const { user } = await openDialog();

      await user.keyboard("{Escape}");

      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Citizen account" })).toBeInTheDocument();
    });

    it("keeps focus inside the dialog when tabbing", async () => {
      const { user, dialog } = await openDialog();

      await user.tab();
      expect(dialog.getByRole("button", { name: "Delete" })).toHaveFocus();
      await user.tab();
      expect(dialog.getByRole("button", { name: "Keep topic" })).toHaveFocus();
    });

    it("shows Deleting… and blocks both buttons while the request is in flight", async () => {
      const api = installFakeApi({ topics: [{ id: "1", name: "Citizen account", query: "citizen" }], resultsByTopic: { "1": [] } });
      const release = api.hold(/DELETE /);
      const user = userEvent.setup();
      render(<App />);
      await user.click(await screen.findByRole("button", { name: "Citizen account" }));
      await user.click(screen.getByRole("button", { name: "Delete topic" }));
      const dialog = within(await screen.findByRole("alertdialog"));

      await user.click(dialog.getByRole("button", { name: "Delete" }));

      expect(await dialog.findByRole("button", { name: "Deleting…" })).toBeDisabled();
      expect(dialog.getByRole("button", { name: "Keep topic" })).toBeDisabled();
      await act(async () => release());
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    });
  });
  it("New topic clears the editor and the results", async () => {
    setup();
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Citizen account" }));
    await screen.findByRole("heading", { name: "1 results" });

    await user.click(screen.getByRole("button", { name: "New topic" }));

    expect(screen.getByRole("textbox", { name: "Topic name" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Topic query" })).toHaveValue("");
    expect(screen.queryByRole("heading", { name: "1 results" })).not.toBeInTheDocument();
  });
});

describe("results over time", () => {
  const seed = () =>
    installFakeApi({
      topics: [{ id: "1", name: "T", query: "x" }],
      resultsByTopic: {
        "1": [
          article(1, { published: "2026-10-05T08:00:00Z" }),
          article(2, { published: "2026-10-05T18:00:00Z" }),
          article(3, { published: "2026-10-07T09:00:00Z" }),
          article(4, { published: "2026-10-09T09:00:00Z" }),
        ],
      },
    });

  it("charts the number of matching results per day for the selected topic", async () => {
    seed();
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "T" }));

    const chart = await screen.findByRole("figure", { name: "Results over time" });
    expect(within(chart).getByRole("button", { name: "2026-10-05: 2 results" })).toBeInTheDocument();
    expect(within(chart).getByRole("button", { name: "2026-10-07: 1 result" })).toBeInTheDocument();
    expect(within(chart).getByRole("button", { name: "2026-10-09: 1 result" })).toBeInTheDocument();
  });

  it("follows the date range", async () => {
    seed();
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "T" }));
    const chart = await screen.findByRole("figure", { name: "Results over time" });
    await within(chart).findByRole("button", { name: "2026-10-05: 2 results" });

    await user.type(screen.getByLabelText("From"), "2026-10-07");

    await waitFor(() => expect(within(chart).queryByRole("button", { name: "2026-10-05: 2 results" })).not.toBeInTheDocument());
    expect(within(chart).getByRole("button", { name: "2026-10-07: 1 result" })).toBeInTheDocument();
  });

  it("filters to a single day when its bar is clicked, and the preset is no longer highlighted", async () => {
    seed();
    const user = userEvent.setup();
    render(<App now={() => new Date("2026-10-10T12:00:00Z")} />);
    await user.click(await screen.findByRole("button", { name: "T" }));
    await user.click(screen.getByRole("button", { name: "7D" }));
    const chart = await screen.findByRole("figure", { name: "Results over time" });
    await within(chart).findByRole("button", { name: "2026-10-05: 2 results" });

    await user.click(within(chart).getByRole("button", { name: "2026-10-05: 2 results" }));

    await screen.findByRole("heading", { name: "2 results" });
    expect(titles()).toEqual(["Article 2", "Article 1"]);
    expect(screen.getByLabelText("From")).toHaveValue("2026-10-05");
    expect(screen.getByLabelText("To")).toHaveValue("2026-10-05");
    expect(screen.getByRole("button", { name: "7D" })).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(within(chart).queryByRole("button", { name: "2026-10-07: 1 result" })).not.toBeInTheDocument());
  });

  describe("getting back from a single day", () => {
    const NOW = new Date("2026-10-10T12:00:00Z");
    const drill = async (preset?: string) => {
      seed();
      const user = userEvent.setup();
      render(<App now={() => NOW} />);
      await user.click(await screen.findByRole("button", { name: "T" }));
      await screen.findByRole("heading", { name: "4 results" });
      expect(screen.queryByRole("button", { name: "Back to full view" })).not.toBeInTheDocument();
      if (preset) await user.click(screen.getByRole("button", { name: preset }));
      const chart = screen.getByRole("figure", { name: "Results over time" });
      await user.click(await within(chart).findByRole("button", { name: "2026-10-05: 2 results" }));
      await screen.findByRole("heading", { name: "2 results" });
      return user;
    };

    it("Back to full view restores the range that was active before the click", async () => {
      const user = await drill("7D");
      expect(screen.getByLabelText("From")).toHaveValue("2026-10-05");

      await user.click(screen.getByRole("button", { name: "Back to full view" }));

      await screen.findByRole("heading", { name: "4 results" });
      expect(screen.getByLabelText("From")).toHaveValue("2026-10-03");
      expect(screen.getByLabelText("To")).toHaveValue("2026-10-10");
      expect(screen.getByRole("button", { name: "7D" })).toHaveAttribute("aria-pressed", "true");
      expect(screen.queryByRole("button", { name: "Back to full view" })).not.toBeInTheDocument();
      const chart = screen.getByRole("figure", { name: "Results over time" });
      expect(await within(chart).findByRole("button", { name: "2026-10-09: 1 result" })).toBeInTheDocument();
    });

    it("goes back to all time when the day was picked from the unfiltered view", async () => {
      const user = await drill();

      await user.click(screen.getByRole("button", { name: "Back to full view" }));

      await screen.findByRole("heading", { name: "4 results" });
      expect(screen.getByLabelText("From")).toHaveValue("");
      expect(screen.getByRole("button", { name: "All time" })).toHaveAttribute("aria-pressed", "true");
    });

    it("disappears once the user picks a range themselves", async () => {
      const user = await drill("7D");

      await user.click(screen.getByRole("button", { name: "30D" }));

      expect(screen.queryByRole("button", { name: "Back to full view" })).not.toBeInTheDocument();
    });
  });

  it("can be operated from the keyboard", async () => {
    seed();
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "T" }));
    const bar = await screen.findByRole("button", { name: "2026-10-07: 1 result" });

    bar.focus();
    await user.keyboard("{Enter}");

    await screen.findByRole("heading", { name: "1 results" });
    expect(screen.getByLabelText("From")).toHaveValue("2026-10-07");
  });

  it("is not shown when nothing matches", async () => {
    installFakeApi({ topics: [{ id: "1", name: "T", query: "x" }], resultsByTopic: { "1": [] } });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "T" }));
    await screen.findByRole("heading", { name: "0 results" });

    expect(screen.queryByRole("figure", { name: "Results over time" })).not.toBeInTheDocument();
  });
});

describe("filter bar and filters panel", () => {
  const NOW = new Date("2026-10-11T12:00:00Z");
  const seed = () =>
    installFakeApi({
      topics: [
        { id: "1", name: "T", query: "x" },
        { id: "2", name: "Other", query: "y" },
      ],
      resultsByTopic: {
        "1": [
          article(1, { sourcetype: "blog", sourcecountry: "us", domain: "b.com", lang: "en", published: "2026-09-01T00:00:00Z" }),
          article(2, { sourcetype: "blog", sourcecountry: "us", domain: "b.com", lang: "en", published: "2026-10-10T00:00:00Z" }),
          article(3, { sourcetype: "onlinenews_newspaper", sourcecountry: "sa", domain: "a.sa", lang: "ar", published: "2026-10-09T00:00:00Z" }),
          article(4, { sourcetype: "print_newspaper", sourcecountry: "eg", domain: "c.eg", lang: "ar", published: "2026-10-01T00:00:00Z" }),
        ],
        "2": [article(5, { sourcetype: "blog", sourcecountry: "us", domain: "b.com", lang: "en" })],
      },
    });

  const open = async () => {
    const user = userEvent.setup();
    render(<App now={() => NOW} />);
    await user.click(await screen.findByRole("button", { name: "T" }));
    await screen.findByRole("heading", { name: "4 results" });
    return user;
  };
  // The filters sit beside the results and are always there once a topic is open: nothing to press.
  const openPanel = (_user: ReturnType<typeof userEvent.setup>) => Promise.resolve();
  const expand = async (user: ReturnType<typeof userEvent.setup>, section: string) => {
    await user.click(screen.getByRole("button", { name: section }));
    return within(screen.getByRole("group", { name: section }));
  };

  it("says there are no active filters, and shows the filters beside the results with nothing to open", async () => {
    seed();
    await open();

    expect(screen.getByText("No active filters.")).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Filters" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Filters" })).not.toBeInTheDocument();
  });

  it("has collapsed sections for source type, country, language and domain, with counts", async () => {
    seed();
    const user = await open();
    await openPanel(user);

    for (const name of ["Source type", "Country", "Language", "Domain"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-expanded", "false");
    }
    expect(screen.queryByRole("checkbox", { name: "Blog (2)" })).not.toBeInTheDocument();

    const types = await expand(user, "Source type");
    expect(screen.getByRole("button", { name: "Source type" })).toHaveAttribute("aria-expanded", "true");
    expect(types.getByRole("checkbox", { name: "Blog (2)" })).not.toBeChecked();
    expect(types.getByRole("checkbox", { name: "Print newspaper (1)" })).toBeInTheDocument();
    expect((await expand(user, "Language")).getByRole("checkbox", { name: "Arabic (2)" })).toBeInTheDocument();
  });

  it("narrows results, chart and the other sections to the chosen value, but keeps that section's own options", async () => {
    seed();
    const user = await open();
    await openPanel(user);

    const types = await expand(user, "Source type");
    await user.click(types.getByRole("checkbox", { name: "Blog (2)" }));

    await screen.findByRole("heading", { name: "2 results" });
    expect(titles()).toEqual(["Article 2", "Article 1"]);
    expect(types.getByRole("checkbox", { name: "Blog (2)" })).toBeChecked();
    expect(types.getByRole("checkbox", { name: "Print newspaper (1)" })).toBeInTheDocument();
    const countries = await expand(user, "Country");
    expect(countries.getByRole("checkbox", { name: "United States (2)" })).toBeInTheDocument();
    expect(countries.queryByRole("checkbox", { name: /^Saudi Arabia/ })).not.toBeInTheDocument();
  });

  it("widens within a section (OR) and narrows across sections (AND)", async () => {
    seed();
    const user = await open();
    await openPanel(user);
    const types = await expand(user, "Source type");

    await user.click(types.getByRole("checkbox", { name: "Blog (2)" }));
    await screen.findByRole("heading", { name: "2 results" });
    await user.click(types.getByRole("checkbox", { name: "Print newspaper (1)" }));
    await screen.findByRole("heading", { name: "3 results" });

    const countries = await expand(user, "Country");
    await user.click(countries.getByRole("checkbox", { name: "Egypt (1)" }));
    await screen.findByRole("heading", { name: "1 results" });
    expect(titles()).toEqual(["Article 4"]);
  });

  it("shows active filters as removable chips in the bar and clears them all at once", async () => {
    seed();
    const user = await open();
    await openPanel(user);
    await user.click((await expand(user, "Domain")).getByRole("checkbox", { name: "b.com (2)" }));
    await screen.findByRole("heading", { name: "2 results" });

    const bar = within(screen.getByRole("region", { name: "Filter bar" }));
    expect(bar.queryByText("No active filters.")).not.toBeInTheDocument();
    expect(bar.getByText("Domain: b.com")).toBeInTheDocument();

    await user.click(bar.getByRole("button", { name: "Remove Domain: b.com" }));
    await screen.findByRole("heading", { name: "4 results" });
    expect(bar.getByText("No active filters.")).toBeInTheDocument();

    await user.click((await expand(user, "Language")).getByRole("checkbox", { name: "Arabic (2)" }));
    await screen.findByRole("heading", { name: "2 results" });
    await user.click(bar.getByRole("button", { name: "Clear all filters" }));
    await screen.findByRole("heading", { name: "4 results" });
  });

  it("searches all filters: shows only matching options and opens their sections", async () => {
    seed();
    const user = await open();
    await openPanel(user);

    await user.type(screen.getByRole("searchbox", { name: "Search all filters" }), "eg");

    expect(await screen.findByRole("checkbox", { name: "Egypt (1)" })).toBeInTheDocument();
    expect(await screen.findByRole("checkbox", { name: "c.eg (1)" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Blog/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Language" })).not.toBeInTheDocument();
  });

  describe("full country and language names", () => {
    it("never shows the abbreviation: options and chips use the full name, the filter still uses the code", async () => {
      const api = seed();
      const user = await open();
      await openPanel(user);

      await user.click((await expand(user, "Country")).getByRole("checkbox", { name: "Saudi Arabia (1)" }));
      await screen.findByRole("heading", { name: "1 results" });

      const bar = within(screen.getByRole("region", { name: "Filter bar" }));
      expect(bar.getByText("Country: Saudi Arabia")).toBeInTheDocument();
      expect(api.requests.some((r) => r.path.includes("sourcecountry=sa"))).toBe(true);
      expect(screen.queryByText(/^sa$/)).not.toBeInTheDocument();

      await user.click((await expand(user, "Language")).getByRole("checkbox", { name: "Arabic (1)" }));
      expect(bar.getByText("Language: Arabic")).toBeInTheDocument();
    });

    it("finds a country or language by its full name", async () => {
      seed();
      const user = await open();
      await openPanel(user);

      await user.type(screen.getByRole("searchbox", { name: "Search all filters" }), "arab");

      expect(await screen.findByRole("checkbox", { name: "Saudi Arabia (1)" })).toBeInTheDocument();
      expect(await screen.findByRole("checkbox", { name: "Arabic (2)" })).toBeInTheDocument();
      expect(screen.queryByRole("checkbox", { name: "Egypt (1)" })).not.toBeInTheDocument();
    });

    it("shows friendly names for source types in options and chips, and finds them by name", async () => {
      installFakeApi({
        topics: [{ id: "1", name: "T", query: "x" }],
        resultsByTopic: {
          "1": [
            article(1, { sourcetype: "onlinenews_newspaper" }),
            article(2, { sourcetype: "broadcast_tv" }),
            article(3, { sourcetype: "broadcast_radio" }),
            article(4, { sourcetype: "print_newspaperinternational" }),
            article(5, { sourcetype: "socialmedia_disqus" }),
            article(6, { sourcetype: "onlinenews_somethingnew" }),
          ],
        },
      });
      const user = userEvent.setup();
      render(<App />);
      await user.click(await screen.findByRole("button", { name: "T" }));
      await screen.findByRole("heading", { name: "6 results" });
      await openPanel(user);

      const types = await expand(user, "Source type");
      for (const name of [
        "Online newspaper (1)",
        "Television (1)",
        "Radio (1)",
        "International print newspaper (1)",
        "Social media – Disqus (1)", // not in the table: built from its parts
        "Online news – Somethingnew (1)",
      ]) {
        expect(types.getByRole("checkbox", { name })).toBeInTheDocument();
      }
      expect(screen.queryByText(/_/)).not.toBeInTheDocument();

      await user.click(types.getByRole("checkbox", { name: "Television (1)" }));
      await screen.findByRole("heading", { name: "1 results" });
      expect(within(screen.getByRole("region", { name: "Filter bar" })).getByText("Source type: Television")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Clear all filters" }));
      await screen.findByRole("heading", { name: "6 results" });
      await user.type(screen.getByRole("searchbox", { name: "Search all filters" }), "radio");
      expect(await screen.findByRole("checkbox", { name: "Radio (1)" })).toBeInTheDocument();
      expect(screen.queryByRole("checkbox", { name: "Television (1)" })).not.toBeInTheDocument();
    });

    it("falls back to the raw value for a code it does not know", async () => {
      installFakeApi({
        topics: [{ id: "1", name: "T", query: "x" }],
        resultsByTopic: { "1": [article(1, { sourcecountry: "xx", lang: "qqq-unknown" })] },
      });
      const user = userEvent.setup();
      render(<App />);
      await user.click(await screen.findByRole("button", { name: "T" }));
      await screen.findByRole("heading", { name: "1 results" });
      await openPanel(user);

      expect((await expand(user, "Country")).getByRole("checkbox", { name: "xx (1)" })).toBeInTheDocument();
      expect((await expand(user, "Language")).getByRole("checkbox", { name: "qqq-unknown (1)" })).toBeInTheDocument();
    });
  });

  it("starts without filters when another topic is selected", async () => {
    seed();
    const user = await open();
    await openPanel(user);
    await user.click((await expand(user, "Source type")).getByRole("checkbox", { name: "Blog (2)" }));
    await screen.findByRole("heading", { name: "2 results" });

    await user.click(screen.getByRole("button", { name: "Other" }));

    await screen.findByRole("heading", { name: "1 results" });
    expect(screen.getByText("No active filters.")).toBeInTheDocument();
  });

  it("keeps the filters when loading more results", async () => {
    installFakeApi({
      topics: [{ id: "1", name: "T", query: "x" }],
      resultsByTopic: {
        "1": Array.from({ length: 40 }, (_, i) =>
          article(i + 1, { sourcetype: i < 30 ? "blog" : "print_newspaper", published: new Date(Date.UTC(2026, 8, i + 1)).toISOString() }),
        ),
      },
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "T" }));
    await screen.findByRole("heading", { name: "40 results" });
    await openPanel(user);
    await user.click((await expand(user, "Source type")).getByRole("checkbox", { name: "Blog (30)" }));
    await screen.findByRole("heading", { name: "30 results" });

    await user.click(screen.getByRole("button", { name: "Load more" }));

    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(30));
  });

  describe("long lists of values", () => {
    const seedMany = () =>
      installFakeApi({
        topics: [{ id: "1", name: "T", query: "x" }],
        resultsByTopic: {
          "1": Array.from({ length: 25 }, (_, i) =>
            article(i + 1, { domain: `d${String(i + 1).padStart(2, "0")}.com`, sourcetype: "blog", lang: "en" }),
          ),
        },
      });
    const openMany = async () => {
      seedMany();
      const user = userEvent.setup();
      render(<App />);
      await user.click(await screen.findByRole("button", { name: "T" }));
      await screen.findByRole("heading", { name: "25 results" });
      await openPanel(user);
      return user;
    };

    it("offers Show more when a section is cut off, and then lists every value", async () => {
      const user = await openMany();
      const domains = await expand(user, "Domain");
      expect(domains.getAllByRole("checkbox")).toHaveLength(20);
      expect(domains.queryByRole("checkbox", { name: "d25.com (1)" })).not.toBeInTheDocument();

      await user.click(domains.getByRole("button", { name: "Show more" }));

      await waitFor(() => expect(domains.getAllByRole("checkbox")).toHaveLength(25));
      expect(domains.getByRole("checkbox", { name: "d25.com (1)" })).toBeInTheDocument();
      expect(domains.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
    });

    it("does not offer Show more for short sections", async () => {
      const user = await openMany();

      const languages = await expand(user, "Language");

      expect(languages.getByRole("checkbox", { name: "English (25)" })).toBeInTheDocument();
      expect(languages.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
    });

    it("searches all values on the server, finding ones beyond the first 20, and they can be applied", async () => {
      const user = await openMany();

      await user.type(screen.getByRole("searchbox", { name: "Search all filters" }), "D25");

      const hit = await screen.findByRole("checkbox", { name: "d25.com (1)" });
      expect(screen.queryByRole("checkbox", { name: "d01.com (1)" })).not.toBeInTheDocument();
      await user.click(hit);

      await screen.findByRole("heading", { name: "1 results" });
      expect(titles()).toEqual(["Article 25"]);
      expect(within(screen.getByRole("region", { name: "Filter bar" })).getByText("Domain: d25.com")).toBeInTheDocument();
    });
  });

  describe("date presets", () => {
    it("7D shows the last seven days, fills the From/To inputs, and All time clears it", async () => {
      seed();
      const user = await open();

      await user.click(screen.getByRole("button", { name: "7D" }));

      await screen.findByRole("heading", { name: "2 results" });
      expect(titles()).toEqual(["Article 2", "Article 3"]);
      expect(screen.getByRole("button", { name: "7D" })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByLabelText("From")).toHaveValue("2026-10-04");
      expect(screen.getByLabelText("To")).toHaveValue("2026-10-11");

      await user.click(screen.getByRole("button", { name: "All time" }));
      await screen.findByRole("heading", { name: "4 results" });
      expect(screen.getByLabelText("From")).toHaveValue("");
      expect(screen.getByRole("button", { name: "7D" })).toHaveAttribute("aria-pressed", "false");
    });

    it("30D reaches back thirty days; a manually edited range un-highlights the preset", async () => {
      seed();
      const user = await open();

      await user.click(screen.getByRole("button", { name: "30D" }));
      await screen.findByRole("heading", { name: "3 results" }); // 09-01 is 40 days back
      expect(screen.getByLabelText("From")).toHaveValue("2026-09-11");

      fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-08" } });
      await screen.findByRole("heading", { name: "2 results" });
      expect(screen.getByRole("button", { name: "30D" })).toHaveAttribute("aria-pressed", "false");
    });
  });
});
describe("topic list", () => {
  it("shows the saved topics from the API", async () => {
    installFakeApi({
      topics: [
        { id: "1", name: "مواضيع التقرير الاستباقي", query: '"حساب المواطن"' },
        { id: "2", name: "Budget news", query: "budget NEAR/5 saudi" },
      ],
    });
    render(<App />);

    expect(await screen.findByRole("button", { name: "مواضيع التقرير الاستباقي" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Budget news" })).toBeInTheDocument();
  });
});










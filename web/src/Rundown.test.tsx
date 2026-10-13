// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { installFakeApi } from "./test/fakeApi";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  try {
    localStorage.clear();
  } catch {
    /* storage unavailable */
  }
});

const article = (n: number, over: Record<string, unknown> = {}) => ({
  id: `a${n}`,
  title: `Article ${n}`,
  source: "Arab News",
  domain: "arabnews.com",
  url: `https://arabnews.com/${n}`,
  published: "2026-10-10T09:42:00Z",
  highlight: { body: [`excerpt of <em>article</em> ${n}`] },
  ...over,
});
const topic = { id: "1", name: "Economy", query: "budget NEAR/8 deficit", exclude: "sports" };

// Oct 5 and 7 are 2 and 1; Oct 10 (a Saturday) has 3. Total 6 over 3 busy days of the 6-day span.
const data = [
  article(1, { published: "2026-10-05T08:00:00Z" }),
  article(2, { published: "2026-10-05T18:30:00Z" }),
  article(3, { published: "2026-10-07T09:00:00Z" }),
  article(4, { published: "2026-10-10T07:05:00Z", title: "الميزانية العامة" }),
  article(5, { published: "2026-10-10T09:42:00Z" }),
  article(6, { published: "2026-10-10T21:10:00Z" }),
];

async function open(extra: Parameters<typeof installFakeApi>[0] = {}) {
  installFakeApi({ topics: [topic], resultsByTopic: { "1": data }, ...extra });
  const user = userEvent.setup();
  render(<App now={() => new Date("2026-10-11T12:00:00Z")} />);
  await user.click(await screen.findByRole("button", { name: "Economy" }));
  await screen.findByRole("heading", { name: /^\d+ results$/ });
  return user;
}

describe("the rundown: results grouped by day with a time column", () => {
  it("groups articles under their day, newest day first, with a count", async () => {
    await open();

    const groups = screen.getAllByRole("group", { name: /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d+ \w+$/ });
    expect(groups.map((g) => g.getAttribute("aria-label"))).toEqual(["Sat 10 Oct", "Wed 7 Oct", "Mon 5 Oct"]);
    expect(within(groups[0]!).getByText("3 articles")).toBeInTheDocument();
    expect(within(groups[1]!).getByText("1 article")).toBeInTheDocument();
  });

  it("shows each article's time (UTC) in its own column", async () => {
    await open();

    const sat = within(screen.getByRole("group", { name: "Sat 10 Oct" }));
    expect(sat.getAllByRole("listitem").map((li) => within(li).getByTestId("time").textContent)).toEqual(["21:10", "09:42", "07:05"]);
  });

  it("marks articles from the last hour as new", async () => {
    installFakeApi({
      topics: [topic],
      resultsByTopic: { "1": [article(1, { published: "2026-10-11T11:30:00Z" }), article(2, { published: "2026-10-11T09:00:00Z" })] },
    });
    const user = userEvent.setup();
    render(<App now={() => new Date("2026-10-11T12:00:00Z")} />);
    await user.click(await screen.findByRole("button", { name: "Economy" }));
    await screen.findByRole("heading", { name: "2 results" });

    const items = screen.getAllByRole("listitem");
    expect(within(items[0]!).getByText("New")).toBeInTheDocument();
    expect(within(items[1]!).queryByText("New")).not.toBeInTheDocument();
  });
});

describe("the chart says what is normal and what is not", () => {
  it("summarises the range in one line: total, busiest day, average", async () => {
    await open();

    const summary = screen.getByTestId("chart-summary");
    expect(summary).toHaveTextContent("6 articles over 3 days");
    expect(summary).toHaveTextContent("Busiest: Sat 10 Oct (3)");
    expect(summary).toHaveTextContent("Average 2 a day");
  });

  it("draws the average as a labelled line to read each bar against", async () => {
    await open();

    const chart = screen.getByRole("figure", { name: "Results over time" });
    expect(within(chart).getByText("average 2/day")).toBeInTheDocument();
  });

  it("puts the average label on the side where the bars are lower, so it never sits on the tallest bar", async () => {
    await open(); // the busiest day is the last bar here

    const label = within(screen.getByRole("figure", { name: "Results over time" })).getByText("average 2/day");
    expect(label).toHaveAttribute("text-anchor", "start");
  });

  it("labels the busiest bar with its count", async () => {
    await open();

    const chart = screen.getByRole("figure", { name: "Results over time" });
    expect(within(chart).getByTestId("peak-label")).toHaveTextContent("3");
  });

  it("tells how a day compares with the average when the bar is focused", async () => {
    const user = await open();
    const chart = screen.getByRole("figure", { name: "Results over time" });

    await user.hover(within(chart).getByRole("button", { name: "2026-10-10: 3 results" }));

    expect(await within(chart).findByRole("status")).toHaveTextContent("Sat 10 Oct · 3 articles · 50% above average");
  });
});

describe("density", () => {
  it("shows excerpts by default and hides them in Compact, then restores them", async () => {
    const user = await open();
    expect(screen.getByRole("button", { name: "Comfortable" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByText(/excerpt of/)).toHaveLength(6);

    await user.click(screen.getByRole("button", { name: "Compact" }));

    expect(screen.getByRole("button", { name: "Compact" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText(/excerpt of/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(6); // same articles, less per row

    await user.click(screen.getByRole("button", { name: "Comfortable" }));
    expect(screen.getAllByText(/excerpt of/)).toHaveLength(6);
  });

  it("remembers the choice for next time", async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Compact" }));
    cleanup();

    installFakeApi({ topics: [topic], resultsByTopic: { "1": data } });
    render(<App now={() => new Date("2026-10-11T12:00:00Z")} />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Economy" }));
    await screen.findByRole("heading", { name: /^\d+ results$/ });

    expect(screen.getByRole("button", { name: "Compact" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText(/excerpt of/)).not.toBeInTheDocument();
  });
});

describe("the topic editor gets out of the way while reading", () => {
  it("shows the topic's name and query as a heading, with the form folded behind Edit topic", async () => {
    const user = await open();

    expect(screen.getByRole("heading", { level: 1, name: "Economy" })).toBeInTheDocument();
    expect(document.querySelector(".topic-query code")).toHaveTextContent("budget NEAR/8 deficit");
    const edit = screen.getByRole("button", { name: "Edit topic" });
    expect(edit).toHaveAttribute("aria-expanded", "false");

    await user.click(edit);
    expect(screen.getByRole("button", { name: "Edit topic" })).toHaveAttribute("aria-expanded", "true");
  });

  it("starts expanded for a new topic, and folds again after saving", async () => {
    installFakeApi({ topics: [topic] });
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByRole("button", { name: "Edit topic" })).toHaveAttribute("aria-expanded", "true");
    await user.type(screen.getByRole("textbox", { name: "Topic name" }), "Budget");
    await user.type(screen.getByRole("textbox", { name: "Topic query" }), "budget");
    const save = screen.getByRole("button", { name: "Save topic" });
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);

    await screen.findByRole("heading", { level: 1, name: "Budget" });
    expect(screen.getByRole("button", { name: "Edit topic" })).toHaveAttribute("aria-expanded", "false");
  });
});

describe("long spans are charted by week or month, so the chart stays readable", () => {
  const spread = [
    article(1, { published: "2026-08-04T10:00:00Z" }),
    article(2, { published: "2026-09-01T10:00:00Z" }),
    article(3, { published: "2026-09-02T10:00:00Z" }),
    article(4, { published: "2026-10-07T10:00:00Z" }),
    article(5, { published: "2026-10-08T10:00:00Z" }),
    article(6, { published: "2026-10-09T10:00:00Z" }),
  ];

  it("labels weekly bars as weeks and says so in the summary", async () => {
    const user = await open({ resultsByTopic: { "1": spread } });
    const chart = screen.getByRole("figure", { name: "Results over time" });

    expect(screen.getByTestId("chart-summary")).toHaveTextContent("6 articles over 11 weeks".replace("11", "3")); // 3 non-empty weeks in the fake
    expect(within(chart).getByRole("button", { name: "week of 2026-10-05: 3 results" })).toBeInTheDocument();
    expect(within(chart).getByRole("button", { name: "week of 2026-08-03: 1 result" })).toBeInTheDocument();
    expect(screen.getByTestId("chart-summary")).toHaveTextContent("Busiest: week of 5 Oct (3)");
    expect(user).toBeTruthy();
  });

  it("clicking a week narrows to that whole week, Monday to Sunday", async () => {
    const user = await open({ resultsByTopic: { "1": spread } });
    const chart = screen.getByRole("figure", { name: "Results over time" });

    await user.click(within(chart).getByRole("button", { name: "week of 2026-10-05: 3 results" }));

    await screen.findByRole("heading", { name: "3 results" });
    expect(screen.getByLabelText("From")).toHaveValue("2026-10-05");
    expect(screen.getByLabelText("To")).toHaveValue("2026-10-11");
  });

  it("charts a very long span by month and clicking a month covers all of it", async () => {
    const years = [
      article(1, { published: "2024-01-15T10:00:00Z" }),
      article(2, { published: "2025-06-10T10:00:00Z" }),
      article(3, { published: "2026-09-10T10:00:00Z" }),
      article(4, { published: "2026-09-20T10:00:00Z" }),
    ];
    const user = await open({ resultsByTopic: { "1": years } });
    const chart = screen.getByRole("figure", { name: "Results over time" });
    expect(screen.getByTestId("chart-summary")).toHaveTextContent("Busiest: Sep 2026 (2)");

    await user.click(within(chart).getByRole("button", { name: "month of 2026-09: 2 results" }));

    await screen.findByRole("heading", { name: "2 results" });
    expect(screen.getByLabelText("From")).toHaveValue("2026-09-01");
    expect(screen.getByLabelText("To")).toHaveValue("2026-09-30");
  });
});
describe("chart type: bars or trend, the reader's choice", () => {
  it("defaults to bars and switches to a trend line over the same days, keeping every label", async () => {
    const user = await open();
    const chart = screen.getByRole("figure", { name: "Results over time" });
    expect(within(screen.getByRole("group", { name: "Chart type" })).getByRole("button", { name: "Bars" })).toHaveAttribute("aria-pressed", "true");
    expect(within(chart).queryByTestId("trend-line")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Trend" }));

    expect(screen.getByRole("button", { name: "Trend" })).toHaveAttribute("aria-pressed", "true");
    expect(within(chart).getByTestId("trend-line")).toBeInTheDocument();
    expect(within(chart).getByTestId("trend-area")).toBeInTheDocument();
    expect(within(chart).getByRole("button", { name: "2026-10-10: 3 results" })).toBeInTheDocument();
    expect(within(chart).getByRole("button", { name: "2026-10-05: 2 results" })).toBeInTheDocument();
    expect(within(chart).getByText("average 2/day")).toBeInTheDocument();
    expect(within(chart).getByTestId("peak-label")).toHaveTextContent("3");
    expect(screen.getByTestId("chart-summary")).toHaveTextContent("Busiest: Sat 10 Oct (3)");
  });

  it("clicking a point narrows to that day, like clicking a bar", async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Trend" }));
    const chart = screen.getByRole("figure", { name: "Results over time" });

    await user.click(within(chart).getByRole("button", { name: "2026-10-05: 2 results" }));

    await screen.findByRole("heading", { name: "2 results" });
    expect(screen.getByLabelText("From")).toHaveValue("2026-10-05");
    expect(screen.getByLabelText("To")).toHaveValue("2026-10-05");
  });

  it("describes a point against the average when hovered", async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Trend" }));
    const chart = screen.getByRole("figure", { name: "Results over time" });

    await user.hover(within(chart).getByRole("button", { name: "2026-10-10: 3 results" }));

    expect(await within(chart).findByRole("status")).toHaveTextContent("Sat 10 Oct · 3 articles · 50% above average");
  });

  it("remembers the chart type for next time", async () => {
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Trend" }));
    cleanup();

    installFakeApi({ topics: [topic], resultsByTopic: { "1": data } });
    render(<App now={() => new Date("2026-10-11T12:00:00Z")} />);
    await userEvent.setup().click(await screen.findByRole("button", { name: "Economy" }));
    await screen.findByRole("heading", { name: /^\d+ results$/ });

    expect(screen.getByRole("button", { name: "Trend" })).toHaveAttribute("aria-pressed", "true");
    expect(within(screen.getByRole("figure", { name: "Results over time" })).getByTestId("trend-line")).toBeInTheDocument();
  });
});
describe("moving between topics", () => {
  it("renders the new topic's results as a fresh view, so its entrance animation plays", async () => {
    installFakeApi({
      topics: [topic, { id: "2", name: "Energy", query: "oil" }],
      resultsByTopic: { "1": data, "2": [article(1, { published: "2026-10-10T08:00:00Z" })] },
    });
    const user = userEvent.setup();
    render(<App now={() => new Date("2026-10-11T12:00:00Z")} />);
    await user.click(await screen.findByRole("button", { name: "Economy" }));
    await screen.findByRole("heading", { name: "6 results" });
    const first = screen.getByRole("figure", { name: "Results over time" });

    await user.click(screen.getByRole("button", { name: "Energy" }));
    await screen.findByRole("heading", { name: "1 results" });

    expect(first.isConnected).toBe(false);
    expect(screen.getByRole("figure", { name: "Results over time" })).not.toBe(first);
  });

  it("keeps the same chart while filters change within a topic, so bars move instead of replaying", async () => {
    const user = await open();
    const chart = screen.getByRole("figure", { name: "Results over time" });

    await user.click(screen.getByRole("button", { name: "30D" }));
    await waitFor(() => expect(screen.getByLabelText("From")).not.toHaveValue(""));

    expect(chart.isConnected).toBe(true);
  });
});
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

const article = { id: "a1", title: "Budget deficit narrows", source: "S", domain: "a.com", url: "https://a.com/1", published: "2026-10-10T09:00:00Z" };
const leaf = (label: string, matched: boolean) => ({ kind: "term", label, matched, children: [] });

const open = async (explanation: unknown, extra: Parameters<typeof installFakeApi>[0] = {}) => {
  const api = installFakeApi({
    topics: [{ id: "1", name: "T", query: "x" }],
    resultsByTopic: { "1": [article] },
    explanations: { a1: explanation },
    ...extra,
  });
  const user = userEvent.setup();
  render(<App />);
  await user.click(await screen.findByRole("button", { name: "T" }));
  await screen.findByRole("heading", { name: "1 results" });
  await user.click(screen.getByRole("button", { name: "Why “Budget deficit narrows” matched" }));
  return { user, api };
};

describe("results list: why did this match", () => {
  it("shows each clause of the topic's query with whether it matched this article", async () => {
    await open({
      kind: "and", label: "(budget OR deficit) AND NOT sports", matched: true,
      children: [
        { kind: "or", label: "budget OR deficit", matched: true, children: [leaf("budget", false), leaf("deficit", true)] },
        { kind: "not", label: "NOT sports", matched: true, children: [leaf("sports", false)] },
      ],
    });

    const panel = await screen.findByRole("region", { name: "Why this matched" });
    expect(within(panel).getByText(/This article is a result/)).toBeInTheDocument();
    const clause = (label: string) => within(panel).getByText(label, { selector: "code" }).closest("li")!;
    expect(clause("deficit")).toHaveTextContent(/^✓matched: deficit/);
    expect(clause("budget")).toHaveTextContent(/^–not matched: budget/);
    expect(clause("NOT sports")).toHaveTextContent(/^✓matched: NOT sports/);
  });

  it("folds a long list of alternatives to the ones that matched", async () => {
    const terms = ["alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta"];
    await open({
      kind: "or", label: terms.join(" OR "), matched: true,
      children: terms.map((t) => leaf(t, t === "gamma" || t === "eta")),
    });

    const panel = await screen.findByRole("region", { name: "Why this matched" });
    expect(within(panel).getByText("8 alternatives, 2 matched")).toBeInTheDocument();
    expect(within(panel).getByText("gamma", { selector: "code" })).toBeVisible();
    expect(within(panel).getByText("eta", { selector: "code" })).toBeVisible();
    expect(within(panel).getByText("Show the 6 that did not match")).toBeInTheDocument();
  });

  it("says when the topic's exclude query takes the article out again", async () => {
    await open({ kind: "term", label: "budget", matched: true, excluded: true, children: [] });

    expect(await screen.findByText(/taken out again by the topic’s exclude query/i)).toBeInTheDocument();
  });

  it("explains a failure and offers to try again", async () => {
    const { user, api } = await open(leaf("budget", true));
    await user.click(screen.getByRole("button", { name: "Why “Budget deficit narrows” matched" })); // close
    api.failNext(/GET \/topics\/1\/explain/, { status: 500 });
    await user.click(screen.getByRole("button", { name: "Why “Budget deficit narrows” matched" })); // open again

    expect(await screen.findByText(/Couldn.t explain this result/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("region", { name: "Why this matched" })).toBeInTheDocument();
  });
});
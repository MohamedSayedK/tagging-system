// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { installFakeApi } from "./test/fakeApi";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// The coloured copy of the query sits behind the textarea; it is decoration, so it is hidden from
// assistive tech and found here by its marker.
const tokens = (container: HTMLElement) =>
  [...container.querySelectorAll("[data-token]")].map((el) => [el.textContent, el.getAttribute("data-token")]);

describe("topic editor: colour-coded query", () => {
  it("colours operators, fields and phrases as the query is typed", async () => {
    installFakeApi();
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.type(screen.getByRole("textbox", { name: "Topic query" }), 'title:budget AND "a b" NEAR/3 c');

    expect(tokens(container)).toEqual(
      expect.arrayContaining([
        ["title:", "field"],
        ["AND", "and"],
        ['"a b"', "phrase"],
        ["NEAR/3", "proximity"],
      ]),
    );
  });

  it("marks both brackets of a pair when the caret sits next to one of them", async () => {
    installFakeApi();
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.type(screen.getByRole("textbox", { name: "Topic query" }), "(a OR (b AND c)) d");
    expect(container.querySelectorAll('[data-match="true"]')).toHaveLength(0);

    await user.keyboard("{ArrowLeft}{ArrowLeft}{ArrowLeft}"); // caret right after the outer ")"
    const marked = [...container.querySelectorAll('[data-match="true"]')].map((el) => el.textContent);
    expect(marked).toEqual(["(", ")"]);
  });

  it("flags a bracket that has no partner", async () => {
    installFakeApi();
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.type(screen.getByRole("textbox", { name: "Topic query" }), "(a OR b");

    const unmatched = [...container.querySelectorAll('[data-unmatched="true"]')].map((el) => el.textContent);
    expect(unmatched).toEqual(["("]);
  });
});

const longQuery =
  '(("وزير المالية" OR "Minister of Finance") NEAR/6 (السعودية OR Saudi)) AND NOT (sourcetype:SOCIALMEDIA_TWITTER OR title:"sports") AND (محمد NEAR/2 الجدعان OR "Mohammed Al-Jadaan" OR (Jadaan PRE/1 minister))';

describe("topic editor: reading a long query", () => {
  it("shows the saved query in the topic header laid out one clause per line and colour-coded", async () => {
    installFakeApi({ topics: [{ id: "t1", name: "Finance", query: longQuery }] });
    const user = userEvent.setup();
    const { container } = render(<App />);

    await user.click(await screen.findByRole("button", { name: "Finance" }));

    const header = await screen.findByRole("heading", { name: "Finance" });
    const shown = header.closest("header")!.querySelector(".topic-query")!;
    expect(shown.querySelectorAll('[data-token="and"]').length).toBeGreaterThan(0);
    expect(shown.querySelectorAll("div").length).toBeGreaterThan(3); // one block per line
    expect(container.querySelectorAll(".topic-query [data-token]").length).toBeGreaterThan(10);
  });

  it("rewrites the text in the editor as a readable layout when Format query is pressed", async () => {
    installFakeApi();
    const user = userEvent.setup();
    render(<App />);

    const query = screen.getByRole("textbox", { name: "Topic query" });
    await user.click(query);
    await user.paste(longQuery);
    await user.click(screen.getByRole("button", { name: "Format query" }));

    expect((query as HTMLTextAreaElement).value.split("\n").length).toBeGreaterThan(3);
    expect((query as HTMLTextAreaElement).value).toContain("\nAND NOT (");
  });
});

describe("topic editor: hovering a bracket", () => {
  // jsdom has no layout: give every bracket in the coloured copy a 10px-wide box at its offset in the text.
  const fakeLayout = () =>
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const start = Number(this.getAttribute("data-start"));
      const x = Number.isNaN(start) ? 0 : start * 10;
      return { x, y: 0, left: x, top: 0, right: x + 10, bottom: 20, width: 10, height: 20, toJSON: () => ({}) } as DOMRect;
    });

  it("lights up the bracket under the pointer and its partner, and clears when the pointer leaves", async () => {
    installFakeApi();
    const user = userEvent.setup();
    const { container } = render(<App />);
    const query = screen.getByRole("textbox", { name: "Topic query" });
    await user.type(query, "(a OR (b AND c)) d");
    await user.tab(); // move the caret away from any bracket
    fakeLayout();

    fireEvent.mouseMove(query, { clientX: 6 * 10 + 4, clientY: 8 }); // over the inner "(" at offset 6
    const marked = () => [...container.querySelectorAll('[data-match="true"]')].map((el) => el.getAttribute("data-start"));
    expect(marked()).toEqual(["6", "14"]);

    fireEvent.mouseMove(query, { clientX: 3 * 10 + 4, clientY: 8 }); // over plain text
    expect(marked()).toEqual([]);

    fireEvent.mouseMove(query, { clientX: 0 * 10 + 4, clientY: 8 }); // over the outer "("
    expect(marked()).toEqual(["0", "15"]);
    fireEvent.mouseLeave(query);
    expect(marked()).toEqual([]);
  });
});

describe("topic editor: completion", () => {
  const setup = () => {
    installFakeApi();
    const user = userEvent.setup();
    render(<App />);
    return { user, query: screen.getByRole("textbox", { name: "Topic query" }) as HTMLTextAreaElement };
  };

  it("suggests field names while typing and completes the highlighted one with Enter", async () => {
    const { user, query } = setup();

    await user.type(query, "sourcet");
    expect(await screen.findByRole("option", { name: /sourcetype:/ })).toBeInTheDocument();
    expect(query).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{Enter}");

    expect(query.value).toBe("sourcetype:");
    // the field takes known values, so they are offered straight away
    expect(await screen.findByRole("option", { name: /ONLINENEWS_NEWSPAPER/ })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("moves through the suggestions with the arrow keys and closes on Escape without changing the text", async () => {
    const { user, query } = setup();

    await user.type(query, "so");
    const options = await screen.findAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([expect.stringContaining("source:"), expect.stringContaining("sourcetype:"), expect.stringContaining("sourcecountry:")]);
    expect(options[0]).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowDown}");
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(query.value).toBe("so");
  });

  it("completes a value after sourcetype: when a suggestion is clicked", async () => {
    const { user, query } = setup();

    await user.type(query, "sourcetype:blo");
    await user.click(await screen.findByRole("option", { name: /BLOG/ }));

    expect(query.value).toBe("sourcetype:BLOG");
  });

  it("fills in a date range with today's date and leaves the caret inside it", async () => {
    const { user, query } = setup();

    await user.type(query, "harvest");
    await user.click(await screen.findByRole("option", { name: /harvestDate/ }));

    expect(query.value).toMatch(/^harvestDate:\[\d{4}-\d{2}-\d{2} TO \*\]$/);
    expect(query.selectionStart).toBe("harvestDate:[".length + 10);
  });

  it("stays quiet for ordinary words, and Enter still starts a new line", async () => {
    const { user, query } = setup();

    await user.type(query, "budget{Enter}deficit");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(query.value).toBe("budget\ndeficit");
  });
});
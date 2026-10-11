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
});

const palette = () => within(screen.getByRole("group", { name: "Topic color" }));

describe("topic colour", () => {
  it("offers a named palette, with None selected by default", () => {
    installFakeApi();
    render(<App />);

    const names = palette().getAllByRole("radio").map((r) => r.getAttribute("aria-label"));
    expect(names).toEqual(["None", "Red", "Orange", "Yellow", "Green", "Teal", "Blue", "Purple", "Pink", "Gray"]);
    expect(palette().getByRole("radio", { name: "None" })).toBeChecked();
  });

  it("saves the chosen colour with the topic and shows it in the topic list", async () => {
    const api = installFakeApi();
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByRole("textbox", { name: "Topic name" }), "Budget");
    await user.type(screen.getByRole("textbox", { name: "Topic query" }), "budget");
    await user.click(palette().getByRole("radio", { name: "Blue" }));
    const save = screen.getByRole("button", { name: "Save topic" });
    await waitFor(() => expect(save).toBeEnabled());

    await user.click(save);

    const button = await screen.findByRole("button", { name: "Budget" });
    expect(button).toHaveAccessibleDescription("Color: Blue");
    expect(api.requests.find((r) => r.method === "POST" && r.path === "/api/topics")?.body).toMatchObject({ name: "Budget", color: "#3e63dd" });
  });

  it("loads a topic's colour into the editor, and a change is saved to that topic", async () => {
    const api = installFakeApi({ topics: [{ id: "1", name: "Aviation", query: "airport", color: "#30a46c" }] });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Aviation" }));
    expect(palette().getByRole("radio", { name: "Green" })).toBeChecked();

    await user.click(palette().getByRole("radio", { name: "Red" }));
    const save = screen.getByRole("button", { name: "Save topic" });
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);

    await waitFor(() => expect(screen.getByRole("button", { name: "Aviation" })).toHaveAccessibleDescription("Color: Red"));
    expect(api.requests.find((r) => r.method === "PUT")?.body).toMatchObject({ color: "#e5484d" });
  });

  it("None removes the colour", async () => {
    const api = installFakeApi({ topics: [{ id: "1", name: "Aviation", query: "airport", color: "#30a46c" }] });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Aviation" }));

    await user.click(palette().getByRole("radio", { name: "None" }));
    const save = screen.getByRole("button", { name: "Save topic" });
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);

    await waitFor(() => expect(screen.getByRole("button", { name: "Aviation" })).toHaveAccessibleDescription(""));
    expect(api.requests.find((r) => r.method === "PUT")?.body).not.toHaveProperty("color");
  });

  it("starts a new topic without a colour, and shows the colour beside the topic's name", async () => {
    installFakeApi({ topics: [{ id: "1", name: "Aviation", query: "airport", color: "#8e4ec6" }] });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Aviation" }));

    const heading = screen.getByRole("heading", { level: 1, name: "Aviation" });
    expect(within(heading.parentElement!).getByTestId("topic-color")).toHaveAttribute("data-color", "#8e4ec6");

    await user.click(screen.getByRole("button", { name: "New topic" }));
    expect(palette().getByRole("radio", { name: "None" })).toBeChecked();
  });

  it("copes with a colour set outside the palette (through the API): shows it, does not lose it", async () => {
    installFakeApi({ topics: [{ id: "1", name: "Legacy", query: "x", color: "#123456" }] });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Legacy" }));

    expect(screen.getByRole("button", { name: "Legacy" })).toHaveAccessibleDescription("Color: #123456");
    expect(palette().getByRole("radio", { name: "Custom #123456" })).toBeChecked();
  });
});
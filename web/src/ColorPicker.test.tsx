// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { hexToHsv } from "./colorMath";
import { installFakeApi } from "./test/fakeApi";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const open = async (init: Parameters<typeof installFakeApi>[0] = {}) => {
  const api = installFakeApi(init);
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole("button", { name: "Custom color" }));
  const dialog = within(await screen.findByRole("dialog", { name: "Choose a custom color" }));
  return { api, user, dialog };
};

describe("free colour picker", () => {
  it("opens from a Custom color button next to the palette, showing the current colour and a hex field", async () => {
    const { dialog } = await open({ topics: [] });

    expect(screen.getByRole("button", { name: "Custom color" })).toHaveAttribute("aria-expanded", "true");
    expect(dialog.getByRole("textbox", { name: "Hex color" })).toHaveValue("#3e63dd"); // a sensible start when there is no colour yet
    expect(dialog.getByRole("slider", { name: "Hue" })).toBeInTheDocument();
    expect(dialog.getByRole("application", { name: "Saturation and brightness" })).toBeInTheDocument();
  });

  it("applies a typed hex colour at once, with or without #, and selects it as the topic colour", async () => {
    const { user, dialog } = await open();
    const hex = dialog.getByRole("textbox", { name: "Hex color" });

    await user.clear(hex);
    await user.type(hex, "9980FA");

    expect(screen.getByRole("radio", { name: "Custom #9980fa" })).toBeChecked();
    expect(hex).toHaveAttribute("aria-invalid", "false");
  });

  it("saves the chosen colour with the topic", async () => {
    const { api, user, dialog } = await open();
    const hex = dialog.getByRole("textbox", { name: "Hex color" });
    await user.clear(hex);
    await user.type(hex, "#1a2b3c");
    await user.keyboard("{Escape}");
    await user.type(screen.getByRole("textbox", { name: "Topic name" }), "Custom coloured");
    await user.type(screen.getByRole("textbox", { name: "Topic query" }), "budget");
    const save = screen.getByRole("button", { name: "Save topic" });
    await waitFor(() => expect(save).toBeEnabled());

    await user.click(save);

    await screen.findByRole("button", { name: "Custom coloured" });
    expect(api.requests.find((r) => r.method === "POST" && r.path === "/api/topics")?.body).toMatchObject({ color: "#1a2b3c" });
  });

  it("flags an invalid hex without changing the colour", async () => {
    const { user, dialog } = await open();
    const hex = dialog.getByRole("textbox", { name: "Hex color" });

    await user.clear(hex);
    await user.type(hex, "#12");

    expect(hex).toHaveAttribute("aria-invalid", "true");
    expect(dialog.getByText("Enter a six-digit hex color, like #9980fa.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "None" })).toBeChecked();
  });

  it("moves the hue with the slider", async () => {
    const { dialog } = await open();

    fireEvent.change(dialog.getByRole("slider", { name: "Hue" }), { target: { value: "120" } });

    const hex = (dialog.getByRole("textbox", { name: "Hex color" }) as HTMLInputElement).value;
    expect(Math.round(hexToHsv(hex).h)).toBe(120);
  });

  it("moves saturation and brightness with the arrow keys on the square", async () => {
    const { user, dialog } = await open();
    const hex = dialog.getByRole("textbox", { name: "Hex color" }) as HTMLInputElement;
    const before = hexToHsv(hex.value);

    dialog.getByRole("application", { name: "Saturation and brightness" }).focus();
    await user.keyboard("{ArrowLeft}{ArrowLeft}{ArrowDown}");

    const after = hexToHsv(hex.value);
    expect(after.s).toBeLessThan(before.s);
    expect(after.v).toBeLessThan(before.v);
    expect(Math.abs(after.h - before.h)).toBeLessThan(2);
  });

  it("offers the palette inside the popover too", async () => {
    const { user, dialog } = await open();

    await user.click(dialog.getByRole("button", { name: "Green" }));

    expect(screen.getByRole("radio", { name: "Green" })).toBeChecked();
    expect((dialog.getByRole("textbox", { name: "Hex color" }) as HTMLInputElement).value).toBe("#30a46c");
  });

  it("closes on Escape or an outside click, and returns focus to the trigger", async () => {
    const { user } = await open();
    const trigger = screen.getByRole("button", { name: "Custom color" });

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Choose a custom color" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await screen.findByRole("dialog", { name: "Choose a custom color" });
    await user.click(screen.getByRole("textbox", { name: "Topic name" }));
    expect(screen.queryByRole("dialog", { name: "Choose a custom color" })).not.toBeInTheDocument();
  });

  it("starts from a topic's existing colour", async () => {
    const api = installFakeApi({ topics: [{ id: "1", name: "Aviation", query: "airport", color: "#e5484d" }] });
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Aviation" }));

    await user.click(screen.getByRole("button", { name: "Custom color" }));

    const dialog = within(await screen.findByRole("dialog", { name: "Choose a custom color" }));
    expect(dialog.getByRole("textbox", { name: "Hex color" })).toHaveValue("#e5484d");
    expect(api.requests.length).toBeGreaterThan(0);
  });
});
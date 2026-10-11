// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { installFakeApi } from "./test/fakeApi";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute("data-theme");
  try {
    localStorage.clear();
  } catch {
    /* storage unavailable */
  }
});

const theme = () => within(screen.getByRole("group", { name: "Theme" }));
const attr = () => document.documentElement.getAttribute("data-theme");

describe("theme: light, dark or follow the system", () => {
  it("follows the system by default (Auto), leaving the document without an explicit theme", () => {
    installFakeApi();
    render(<App />);

    expect(theme().getByRole("button", { name: "Auto" })).toHaveAttribute("aria-pressed", "true");
    expect(attr()).toBeNull();
  });

  it("switches the document to dark, to light, and back to following the system", async () => {
    installFakeApi();
    const user = userEvent.setup();
    render(<App />);

    await user.click(theme().getByRole("button", { name: "Dark" }));
    expect(attr()).toBe("dark");
    expect(theme().getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
    expect(theme().getByRole("button", { name: "Auto" })).toHaveAttribute("aria-pressed", "false");

    await user.click(theme().getByRole("button", { name: "Light" }));
    expect(attr()).toBe("light");

    await user.click(theme().getByRole("button", { name: "Auto" }));
    expect(attr()).toBeNull();
  });

  it("remembers the choice for next time", async () => {
    installFakeApi();
    const user = userEvent.setup();
    render(<App />);
    await user.click(theme().getByRole("button", { name: "Dark" }));
    cleanup();
    document.documentElement.removeAttribute("data-theme");

    installFakeApi();
    render(<App />);

    expect(attr()).toBe("dark");
    expect(theme().getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
  });

  it("still switches when the browser will not let the page remember", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    installFakeApi();
    const user = userEvent.setup();
    render(<App />);

    await user.click(theme().getByRole("button", { name: "Dark" }));

    expect(attr()).toBe("dark");
  });
});
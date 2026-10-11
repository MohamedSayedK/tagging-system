import { useEffect, useState } from "react";

export type Theme = "auto" | "light" | "dark";
const KEY = "tagging.theme";

function saved(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "auto";
  } catch {
    return "auto"; // storage can be unavailable (private windows, blocked site data)
  }
}

/** "auto" leaves the document without an explicit theme so the stylesheet follows the system setting. */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(saved);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
  }, [theme]);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* remembering is a convenience */
    }
  };
  return [theme, setTheme];
}
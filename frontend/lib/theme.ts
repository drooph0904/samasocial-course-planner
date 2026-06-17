"use client";
import { useEffect, useState } from "react";
import { Theme } from "./types";

/** Theme applied as a class on <html> (.theme-light overrides the dark :root).
 *  Persisted to localStorage; defaults to dark. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    // Sync the persisted choice on mount. Reading localStorage during render
    // would cause an SSR/client hydration mismatch, so this must run in an effect.
    const saved = (localStorage.getItem("theme") as Theme | null) ?? "dark";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(saved);
    document.documentElement.classList.toggle("theme-light", saved === "light");
  }, []);

  const toggle = () => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      localStorage.setItem("theme", next);
      document.documentElement.classList.toggle("theme-light", next === "light");
      return next;
    });
  };

  return [theme, toggle];
}

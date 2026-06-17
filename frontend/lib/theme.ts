"use client";
import { useEffect, useState } from "react";
import { Theme } from "./types";

/** Theme applied as a class on <html> (.theme-light overrides the dark :root).
 *  Persisted to localStorage; defaults to dark. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const saved = (localStorage.getItem("theme") as Theme | null) ?? "dark";
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

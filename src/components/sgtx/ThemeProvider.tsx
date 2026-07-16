"use client";

// SGTX Theme Provider — manages light/dark theme via localStorage + prefers-color-scheme.
// Reads the saved theme on mount, falls back to the OS preference, and applies the
// matching `className` ("light" | "dark") to <html>. Exposes a `toggleTheme()` for
// the Alt+T keyboard shortcut and the topbar sun/moon button.

import { createContext, useContext, useEffect, useState, useCallback } from "react";

export type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  toggleTheme: () => {},
  setTheme: () => {},
});

const STORAGE_KEY = "sgtx-theme";

function readInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* localStorage unavailable — fall through to media query */
  }
  try {
    const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
    return prefersLight ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Lazy initialiser runs once on the client (and once on the server with a
  // safe default). Avoids the setState-in-effect cascade that React 19's
  // stricter lint rules flag — we synchronise the documentElement className
  // in a separate passive effect that does not call setState.
  const [theme, setThemeState] = useState<Theme>(() => readInitialTheme());

  useEffect(() => {
    try {
      document.documentElement.className = theme;
    } catch {
      /* document unavailable */
    }
  }, [theme]);

  const applyTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      document.documentElement.className = next;
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable — in-memory only */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    applyTheme(theme === "dark" ? "light" : "dark");
  }, [theme, applyTheme]);

  const setTheme = useCallback((t: Theme) => {
    applyTheme(t);
  }, [applyTheme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);

"use client";

// SGTX minimal i18n — useLocale() hook + t(key) translation function.
// Reads/writes the active locale to localStorage; applies dir="rtl" on <html>
// when the locale is Arabic. (FIX-12 — i18n + Arabic RTL support)
//
// Uses useSyncExternalStore for correct React 19 semantics (no setState-in-effect).
//
// Usage:
//   const { locale, setLocale, t } = useLocale();
//   t("login")                  // -> "Login" / "تسجيل الدخول" / etc.
//   setLocale("ar")             // switches to Arabic + applies dir="rtl"

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { dict, LOCALE_LABELS, LOCALE_ORDER, type DictKey, type Locale } from "./dictionary";

const STORAGE_KEY = "sgtx.locale";
const CHANGE_EVENT = "sgtx-locale-change";
const RTL_LOCALES: Locale[] = ["ar"];

// ---- External store (useSyncExternalStore) ----
// Reads the locale from localStorage on the client; returns "en" on the server.
function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot(): Locale {
  if (typeof window === "undefined") return "en";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && LOCALE_ORDER.includes(stored as Locale)) return stored as Locale;
  } catch {
    // localStorage may be unavailable (private mode); fall through to default
  }
  return "en";
}

function getServerSnapshot(): Locale {
  return "en";
}

function writeLocale(l: Locale): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, l);
  } catch {
    // ignore storage errors
  }
  // Notify all hook instances (same-tab) — native "storage" event only fires cross-tab.
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export interface UseLocaleResult {
  locale: Locale;
  setLocale: (l: Locale) => void;
  /** Cycle through en → ar → fr → zh → en */
  cycleLocale: () => void;
  t: (key: DictKey) => string;
  label: string;
  isRtl: boolean;
}

export function useLocale(): UseLocaleResult {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Apply dir + lang on <html> whenever locale changes (FIX-12 — Arabic RTL).
  useEffect(() => {
    if (typeof document === "undefined") return;
    const isRtl = RTL_LOCALES.includes(locale);
    document.documentElement.dir = isRtl ? "rtl" : "ltr";
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    writeLocale(l);
  }, []);

  const cycleLocale = useCallback(() => {
    const current = getSnapshot();
    const idx = LOCALE_ORDER.indexOf(current);
    const next = LOCALE_ORDER[(idx + 1) % LOCALE_ORDER.length];
    writeLocale(next);
  }, []);

  // Memoize t so its identity is stable per locale (avoid re-renders of consumers).
  const t = useMemo(() => {
    return (key: DictKey): string => {
      // Fall back to English, then to the key itself, so we never render "undefined".
      return dict[locale]?.[key] ?? dict.en[key] ?? String(key);
    };
  }, [locale]);

  return {
    locale,
    setLocale,
    cycleLocale,
    t,
    label: LOCALE_LABELS[locale],
    isRtl: RTL_LOCALES.includes(locale),
  };
}

export { dict, LOCALE_LABELS, LOCALE_ORDER };
export type { DictKey, Locale };

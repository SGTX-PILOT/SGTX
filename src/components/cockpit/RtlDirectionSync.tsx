"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// COCKPIT-Phase 6: RTL direction + lang attribute sync.
// ═════════════════════════════════════════════════════════════════════════════════
//
// The root <html> tag in src/app/layout.tsx is a server component with
// hardcoded lang="en". This client component sets the `dir` and `lang`
// attributes on <html> based on the active locale, so the entire app
// (including the legacy / page) renders RTL when Arabic is selected.
//
// Drop this component inside the root <body> — it renders nothing visible
// but applies the document-level attributes on mount + whenever the locale
// changes.

import { useEffect } from "react";
import { useLocale } from "@/lib/i18n";

export function RtlDirectionSync() {
  const { locale } = useLocale();
  const isRtl = locale === "ar";

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = locale || "en";
    document.documentElement.dir = isRtl ? "rtl" : "ltr";
  }, [locale, isRtl]);

  return null;
}

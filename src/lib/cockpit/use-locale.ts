"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// COCKPIT-Phase 6: useCockpitLocale() hook + t() translation function.
// ═════════════════════════════════════════════════════════════════════════════════
//
// Wraps the legacy `useLocale()` from `@/lib/i18n` so the cockpit routes
// can use the cockpit dictionary without changing the legacy dictionary's
// type signature.
//
// Usage in a cockpit component:
//   const { t, locale, dir, isRtl } = useCockpitLocale();
//   t("nav.home")        // -> "Home" / "الرئيسية" / "Accueil" / "主页"
//   dir                  // -> "ltr" or "rtl" (Arabic)
//   isRtl                // -> boolean
//
// Law #6: every string goes through `t()`. No hardcoded English text.

import { useCallback, useMemo } from "react";
import { useLocale } from "@/lib/i18n";
import { cockpitDict, type CockpitKey, type CockpitLocale, RTL_COCKPIT_LOCALES } from "./i18n";

export function useCockpitLocale() {
  const { locale: legacyLocale, setLocale: legacySetLocale } = useLocale();
  // The legacy locale is typed as a broader Locale; we cast to CockpitLocale
  // because the cockpit dictionary supports the same 4 locales.
  const locale = (legacyLocale || "en") as CockpitLocale;
  const isRtl = RTL_COCKPIT_LOCALES.includes(locale);
  const dir = isRtl ? "rtl" : "ltr";

  const t = useCallback(
    (key: CockpitKey): string => {
      // Try the current locale first, then fall back to English.
      const val = cockpitDict[locale]?.[key] ?? cockpitDict.en[key];
      return val || key; // last resort: return the key itself
    },
    [locale],
  );

  return useMemo(() => ({ t, locale, dir, isRtl, setLocale: legacySetLocale }), [t, locale, dir, isRtl, legacySetLocale]);
}

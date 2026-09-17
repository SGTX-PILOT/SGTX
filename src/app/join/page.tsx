"use client";

// COCKPIT-Phase 0: /join route.
//
// Replaces the legacy Zustand `view: "join"` state. Wraps the existing
// RegistrationGateway component (the 6-step onboarding wizard) so the
// backend onboarding flow is untouched.
//
// When the cockpit feature flag is fully cut over, the legacy / page will
// stop rendering the join view and this route becomes the canonical
// registration entry point.

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCockpitLocale } from "@/lib/cockpit/use-locale";

// Lazy-load to keep the /join route bundle small (Phase 6: route-level
// code splitting).
const RegistrationGateway = dynamic(
  () => import("@/components/sgtx/RegistrationGateway").then((m) => m.RegistrationGateway),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex-1 flex items-center justify-center text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        Loading onboarding…
      </div>
    ),
  },
);

export default function JoinPage() {
  const { t, dir } = useCockpitLocale();
  return (
    <div dir={dir} className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm min-h-[44px] inline-flex items-center"
          >
            {t("join.backHome")}
          </Link>
          <Link
            href="/login"
            className="text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm min-h-[44px] inline-flex items-center"
          >
            {t("join.alreadyOnboarded")}
          </Link>
        </div>
      </header>
      <main className="flex-1">
        <RegistrationGateway />
      </main>
      <footer className="mt-auto border-t border-border/40 bg-card/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>SGTX · Sovereign Governed Trade Execution</span>
          <span className="hidden sm:inline">
            {t("footer.nonCustodial")} · {t("footer.aiGoverned")} · {t("footer.sovereign")}
          </span>
        </div>
      </footer>
    </div>
  );
}

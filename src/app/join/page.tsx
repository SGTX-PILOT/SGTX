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

// Lazy-load to keep the /join route bundle small (Phase 6: route-level
// code splitting).
const RegistrationGateway = dynamic(
  () => import("@/components/sgtx/RegistrationGateway").then((m) => m.RegistrationGateway),
  { ssr: false, loading: () => <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading onboarding…</div> },
);

export default function JoinPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to home
          </Link>
          <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
            Already onboarded? Sign in
          </Link>
        </div>
      </header>
      <main className="flex-1">
        <RegistrationGateway />
      </main>
    </div>
  );
}

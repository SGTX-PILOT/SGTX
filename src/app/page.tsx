"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// COCKPIT-Phase 7: / route — redirect to /home or /login.
// ═════════════════════════════════════════════════════════════════════════════════
//
// Law #5 (Phase 0 directive): "Migrate zustand view state to route state.
// The old single-page switcher is deleted, not kept in parallel."
//
// The legacy / page rendered the full Zustand SPA (landing → auth → join →
// launcher → portal → tcc). The cockpit rebuild replaces this with real
// App Router routes. The / route now redirects:
//   * authenticated → /home (the action-first home)
//   * unauthenticated → /login (the sign-in page)
//
// The marketing landing page is preserved at /landing for anyone who wants
// to see it (e.g. via a "Learn more" link from /login).

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/cockpit/session";

export default function RootRedirect() {
  const router = useRouter();
  const { ready, token } = useSession();

  useEffect(() => {
    if (!ready) return;
    if (token) {
      router.replace("/home");
    } else {
      router.replace("/login");
    }
  }, [ready, token, router]);

  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
      Loading…
    </div>
  );
}

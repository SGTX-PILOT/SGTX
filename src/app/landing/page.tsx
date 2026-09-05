"use client";

// COCKPIT-Phase 7: /landing — the marketing landing page.
//
// The legacy / route used to render the full Zustand SPA (landing → auth →
// join → launcher → portal → tcc). The cockpit rebuild replaces this with
// real App Router routes. The marketing landing page is now at /landing so
// it remains accessible without being the default entry point.
//
// The / route now redirects to /home (if authenticated) or /login (if not).

import { SgtxLanding } from "@/components/sgtx/SgtxLanding";

export default function LandingPage() {
  return <SgtxLanding />;
}

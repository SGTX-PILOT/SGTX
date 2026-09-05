"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// / route — the SGTX marketing landing page.
// ═════════════════════════════════════════════════════════════════════════════════
//
// This is the PUBLIC marketing landing page — the first thing a visitor
// sees at sgtx.vercel.app. It renders the SgtxLanding component which
// contains the hero, the 4 constitutional pillars, the 12 institutional
// roles, the public GTID/USTN verification, and the proof section.
//
// The landing page has "Sign in" and "Get Started" buttons that link to
// /login and /join respectively. Authenticated users who visit / will see
// the landing page (they can click "Sign in" to go to /login, which will
// redirect them to /home if they already have a session).
//
// IMPORTANT: this page must NEVER be deleted or redirected. It is the
// public face of SGTX. The cockpit routes (/home, /trades, etc.) are
// auth-gated and live at their own URLs.

import { SgtxLanding } from "@/components/sgtx/SgtxLanding";

export default function Home() {
  return <SgtxLanding />;
}

"use client";

import { Button } from "@/components/ui/button";
import { Home, Compass, Shield } from "lucide-react";

/**
 * 404 Not-Found Boundary.
 *
 * "use client" is kept (added in IMPL-1) because the "Go Home" button uses
 * `window.location.href` for a full reload — this guarantees the SPA store
 * resets when the user returns to the landing page (the landing page reads
 * from `useAppStore` and we want a clean view state, not a stale portal view).
 *
 * Branded with SGTX gold/black theme to match the error + loading boundaries.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
      {/* Subtle gold radial wash — matches the app shell */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 20%, oklch(0.75 0.13 75 / 0.10) 0%, transparent 70%)",
        }}
      />

      <div className="relative w-full max-w-md space-y-8 text-center">
        {/* SGTX wordmark */}
        <div className="flex items-center justify-center gap-2">
          <Shield className="w-5 h-5 text-primary" strokeWidth={2.25} />
          <span className="font-display text-lg font-bold tracking-[0.18em] text-gold-gradient">
            SGTX
          </span>
        </div>

        {/* Large 404 with gold gradient */}
        <div className="space-y-3">
          <h1 className="font-display text-8xl font-black tracking-tighter text-gold-gradient leading-none">
            404
          </h1>
          <div className="flex justify-center">
            <Compass className="w-8 h-8 text-muted-foreground/60" strokeWidth={1.5} />
          </div>
        </div>

        {/* Copy */}
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">
            Page not found
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The page you&apos;re looking for doesn&apos;t exist, has been moved,
            or you may not have access. Return home to continue your trade
            journey.
          </p>
        </div>

        {/* Action */}
        <div className="flex justify-center pt-2">
          <Button
            onClick={() => {
              window.location.href = "/";
            }}
            variant="default"
            size="lg"
          >
            <Home className="w-4 h-4" />
            Go Home
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground/70">
          If you believe this is an error, contact SGTX Support.
        </p>
      </div>
    </div>
  );
}

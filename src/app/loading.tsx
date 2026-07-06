import { Loader2 } from "lucide-react";

/**
 * Global Loading Boundary (Next.js App Router).
 *
 * IMPORTANT: This is a Server Component. Do NOT add "use client" — keeping it
 * server-rendered lets Next.js stream this skeleton immediately while the
 * route segment's server work (DB queries, Brain AI calls, etc.) is still
 * in flight. Converting it to a Client Component would defeat streaming.
 *
 * Renders a branded SGTX gold/black loading state with the SGTX wordmark
 * pulsing and a gold spinner. Shown automatically for any route segment that
 * suspends (e.g. during `await db.trade.findUnique(...)` in a Server Component).
 */
export default function Loading() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
      {/* Subtle gold radial wash — matches the app shell + error boundary */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 20%, oklch(0.75 0.13 75 / 0.10) 0%, transparent 70%)",
        }}
      />

      <div className="relative flex flex-col items-center gap-6">
        {/* SGTX wordmark + spinner */}
        <div className="flex flex-col items-center gap-5">
          <div className="flex items-center gap-2">
            <Loader2
              className="w-6 h-6 animate-spin text-primary"
              strokeWidth={2.5}
            />
            <span
              className="font-display text-2xl font-bold tracking-[0.22em] text-gold-gradient animate-pulse"
              style={{ animationDuration: "2.4s" }}
            >
              SGTX
            </span>
          </div>

          {/* Gold underline pulse */}
          <div
            aria-hidden
            className="h-px w-24 bg-gold-gradient animate-pulse"
            style={{ animationDuration: "1.8s" }}
          />
        </div>

        <p className="text-sm text-muted-foreground tracking-wide">
          Loading…
        </p>

        <p className="text-[11px] text-muted-foreground/70">
          Sovereign Governed Trade Execution
        </p>
      </div>
    </div>
  );
}

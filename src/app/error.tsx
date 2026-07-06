"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Home, ShieldAlert } from "lucide-react";

/**
 * Global Error Boundary (Next.js App Router).
 *
 * This file MUST start with "use client" — error boundaries are React Client
 * Components by design (they need an effect to log the error and a callback
 * for the reset button).
 *
 * Behaviour:
 *  - Renders a branded SGTX gold/black error page.
 *  - Logs the error + digest to the console for dev/observability.
 *  - "Try Again" calls `reset()` (re-renders the errored route segment).
 *  - "Go Home" performs a full navigation to "/".
 *  - Displays the Next.js-provided `error.digest` so users can quote it to
 *    support / when filing incident reports.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Structured console log — digest lets support correlate the user report
    // to the production error stream. In production this would be forwarded
    // to the SGTX observability stack (Prometheus / Loki / Sentry).
    console.error("[sgtx:error-boundary]", {
      message: error?.message,
      digest: error?.digest,
      stack: error?.stack,
      name: error?.name,
    });
  }, [error]);

  const digest = error?.digest;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
      {/* Subtle gold radial wash — matches the sovereign brand wash used in the app shell */}
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
          <ShieldAlert className="w-5 h-5 text-primary" strokeWidth={2.25} />
          <span className="font-display text-lg font-bold tracking-[0.18em] text-gold-gradient">
            SGTX
          </span>
        </div>

        {/* Error icon with gold glow */}
        <div className="flex justify-center">
          <div className="relative">
            <div
              aria-hidden
              className="absolute inset-0 rounded-full glow-gold-sm"
              style={{ transform: "scale(1.4)" }}
            />
            <div className="relative w-20 h-20 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center">
              <AlertTriangle className="w-9 h-9 text-destructive" strokeWidth={2} />
            </div>
          </div>
        </div>

        {/* Copy */}
        <div className="space-y-3">
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
            Something went wrong
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            An unexpected error occurred while rendering this page. Our team has
            been notified. You can try again, or return home to continue.
          </p>
        </div>

        {/* Digest chip */}
        {digest && (
          <div className="inline-flex items-center gap-2 rounded-md border border-gold/40 bg-card/60 px-3 py-1.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Error ID
            </span>
            <code className="text-xs font-mono text-primary">{digest}</code>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Button onClick={reset} variant="default" size="lg">
            <RefreshCw className="w-4 h-4" />
            Try Again
          </Button>
          <Button
            onClick={() => {
              window.location.href = "/";
            }}
            variant="outline"
            size="lg"
          >
            <Home className="w-4 h-4" />
            Go Home
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground/70 pt-2">
          If the problem persists, contact SGTX Support and quote the Error ID above.
        </p>
      </div>
    </div>
  );
}

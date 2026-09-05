"use client";

// COCKPIT-Phase 0: /login route.
//
// Real route (replaces the legacy Zustand `view: "auth"` state). Calls the
// existing /api/v1/auth/login endpoint (or /api/v1/auth/demo-login for the
// demo portals). On success, sets the session JWT as a cookie via the
// cockpit session helper, then redirects to the `next` query param (default
// /home).
//
// Backend untouched. The auth API + middleware + JWT signing are reused.

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { setSession } from "@/lib/cockpit/session";
import { useCockpitLocale } from "@/lib/cockpit/use-locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Loader2, ArrowRight } from "lucide-react";

const DEMO_PORTALS = [
  { id: "trader-buyer", label: "Trader · Buyer", desc: "European Importer GmbH" },
  { id: "trader-seller", label: "Trader · Seller", desc: "Strawberry Export Co." },
  { id: "lsp", label: "Logistics Provider", desc: "Delta Freight" },
  { id: "ship", label: "Shipping Line", desc: "Maersk Levant" },
  { id: "lab", label: "Laboratory", desc: "Cairo Analytical" },
  { id: "qc", label: "Quality Control", desc: "Nile Quality" },
  { id: "cbr", label: "Customs Broker", desc: "Pyramid Customs" },
  { id: "bank", label: "Bank · Financier", desc: "Commercial International Bank" },
  { id: "pfi", label: "Private Financier", desc: "Sovereign Capital" },
  { id: "gov", label: "Government", desc: "Egyptian Customs Authority" },
  { id: "admin", label: "Platform Admin", desc: "Platform Admin" },
  { id: "marketplace-partner", label: "Marketplace Partner", desc: "Marketplace Partner" },
];

export default function LoginPage() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/home";
  const { t, dir } = useCockpitLocale();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoLoading, setDemoLoading] = useState<string | null>(null);

  // If already authenticated, redirect away.
  useEffect(() => {
    const token = document.cookie.match(/sgtx-session=([^;]+)/);
    if (token) {
      router.replace(next);
    }
  }, [router, next]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError("Email and password are required.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed.");
        return;
      }
      setSession(data.session_token, 60 * 60);
      router.replace(next);
    } catch (err: any) {
      setError(err?.message || "Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function demoLogin(portalId: string) {
    setDemoLoading(portalId);
    setError(null);
    try {
      const res = await fetch("/api/v1/auth/demo-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portal_id: portalId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Demo login failed.");
        return;
      }
      setSession(data.session_token, 60 * 60);
      router.replace(next);
    } catch (err: any) {
      setError(err?.message || "Network error.");
    } finally {
      setDemoLoading(null);
    }
  }

  return (
    <div dir={dir} className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 max-w-md w-full mx-auto px-4 py-10 sm:py-16">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8"
        >
          {t("login.backHome")}
        </Link>

        <h1 className="text-2xl font-semibold tracking-tight">{t("login.title")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("login.subtitle")} {" "}
          <Link href="/join" className="text-primary hover:underline">
            {t("login.beginOnboarding")}
          </Link>
          .
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="email" className="text-xs">{t("login.email")}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              className="mt-1.5"
              disabled={loading}
            />
          </div>
          <div>
            <Label htmlFor="password" className="text-xs">{t("login.password")}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="mt-1.5"
              disabled={loading}
            />
          </div>
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-red-50 dark:bg-red-950/20 border border-red-500/30 text-xs text-red-700 dark:text-red-300" role="alert">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : null}
            {t("login.signIn")}
          </Button>
        </form>

        {/* Demo logins — for pilot / non-production use */}
        <div className="mt-10 pt-8 border-t border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {t("login.demoLogin")}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {DEMO_PORTALS.map((p) => (
              <button
                key={p.id}
                onClick={() => demoLogin(p.id)}
                disabled={!!demoLoading}
                className="text-start p-3 rounded-md border border-border bg-card/50 hover:bg-muted transition disabled:opacity-50"
              >
                <div className="text-sm font-medium">{p.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{p.desc}</div>
              </button>
            ))}
          </div>
          {demoLoading && (
            <p className="mt-3 text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" /> Signing in as {demoLoading}…
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

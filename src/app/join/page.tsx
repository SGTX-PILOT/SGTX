"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// /join route — SGTX Registration (Cinematic Dark Theme)
// ═════════════════════════════════════════════════════════════════════════════════
//
// Matches the uploaded "SGTX REGISTRATION UI" design:
//   - Deep space background (#020617) + grid overlay
//   - Hexagonal SGTX emblem header + "Sign in" link
//   - Glass-panel registration card wrapping the existing RegistrationGateway
//     6-step wizard (KYC, Country, Entity, Address, Role, Sandbox).
//   - Footer with trust badges (Ed25519, WasmEdge+OPA, Loom, 24/7).
//
// KEEPS the existing RegistrationGateway component untouched — only wraps it
// in a dark cinematic container.

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCockpitLocale } from "@/lib/cockpit/use-locale";
import { CheckCircle2 } from "lucide-react";

// Lazy-load to keep the /join route bundle small (Phase 6: route-level code splitting).
const RegistrationGateway = dynamic(
  () => import("@/components/sgtx/RegistrationGateway").then((m) => m.RegistrationGateway),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex-1 flex items-center justify-center text-sm text-slate-400 py-20"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          Loading sovereign onboarding…
        </div>
      </div>
    ),
  },
);

const TRUST_BADGES = [
  { label: "Ed25519", sub: "Signatures" },
  { label: "WasmEdge + OPA", sub: "Policy Engine" },
  { label: "Loom", sub: "Audit Ledger" },
  { label: "24/7", sub: "Governed" },
];

export default function JoinPage() {
  const { t, dir } = useCockpitLocale();

  return (
    <div dir={dir} className="relative min-h-screen bg-space text-slate-100 overflow-hidden">
      {/* Background grid overlay */}
      <div className="fixed inset-0 grid-overlay grid-overlay-fade pointer-events-none" aria-hidden />
      {/* Ambient gradient washes */}
      <div className="fixed inset-0 pointer-events-none" aria-hidden>
        <div
          className="absolute top-0 left-1/4 w-[60%] h-[50%]"
          style={{ background: "radial-gradient(ellipse, rgba(59,130,246,0.16), transparent 60%)" }}
        />
        <div
          className="absolute bottom-0 right-1/4 w-[60%] h-[50%]"
          style={{ background: "radial-gradient(ellipse, rgba(168,85,247,0.12), transparent 60%)" }}
        />
      </div>

      <div className="relative min-h-screen flex flex-col">
        {/* ═══ Top nav ═══ */}
        <header className="px-4 sm:px-6 pt-6">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <Link
              href="/"
              className="flex items-center gap-2.5 group"
            >
              <span className="sovereign-emblem" aria-hidden />
              <div className="flex flex-col leading-none">
                <span className="text-base font-bold tracking-tight text-white">SGTX</span>
                <span className="text-[9px] tracking-[0.18em] text-slate-400 uppercase">Sovereign Trade OS</span>
              </div>
            </Link>
            <Link
              href="/login"
              className="btn-secondary-dark inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-[12px] font-medium"
            >
              {t("join.alreadyOnboarded")}
            </Link>
          </div>
        </header>

        {/* ═══ Hero strip ═══ */}
        <section className="px-4 sm:px-6 pt-8 pb-4">
          <div className="max-w-3xl mx-auto text-center animate-fade-up">
            <div className="pill-dark mb-4 inline-flex">
              <span className="status-dot" aria-hidden />
              Sovereign Onboarding · 6 Steps · ~4 Minutes
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white leading-tight">
              Join the{" "}
              <span className="text-gradient-blue">Sovereign</span>{" "}
              Trade Operating System
            </h1>
            <p className="mt-3 text-sm text-slate-400 max-w-xl mx-auto">
              Tell us about your entity. We&apos;ll issue your GTID, generate your Ed25519
              keypair, and route you to a sovereign sandbox portal — all in one sitting.
            </p>
          </div>
        </section>

        {/* ═══ Registration wizard (wrapped in glass) ═══ */}
        <main className="flex-1 px-4 sm:px-6 pb-8">
          <div className="max-w-5xl mx-auto">
            <div className="glass-panel rounded-2xl p-4 sm:p-6 lg:p-8 animate-scale-in">
              <RegistrationGateway />
            </div>
          </div>
        </main>

        {/* ═══ Footer ═══ */}
        <footer className="px-4 sm:px-6 pb-6 pt-4 mt-auto">
          <div className="max-w-7xl mx-auto">
            <div className="hairline-gradient mb-4" />
            <div className="flex flex-wrap items-center justify-center gap-2 mb-3">
              {TRUST_BADGES.map((b) => (
                <span key={b.label} className="pill-dark text-[10px] py-1.5 px-3">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" aria-hidden />
                  <span className="font-semibold text-slate-200">{b.label}</span>
                  <span className="text-slate-500">· {b.sub}</span>
                </span>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] text-slate-500">
              <span>SGTX · Sovereign Governed Trade Execution · {t("footer.nonCustodial")}</span>
              <div className="flex items-center gap-3">
                <span className="pill-dark text-[10px] py-1 px-2">ISO 27001</span>
                <span className="pill-dark text-[10px] py-1 px-2">GDPR Ready</span>
                <span className="pill-dark text-[10px] py-1 px-2">FATF Aligned</span>
                <span className="pill-dark text-[10px] py-1 px-2">Privacy by Design</span>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

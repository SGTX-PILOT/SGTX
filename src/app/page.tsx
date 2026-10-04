"use client";


// ═══════════════════════════════════════════════════════════════════════════════
// / route — SGTX Sovereign Global Trade Exchange — PIXEL-PERFECT CLONE
// ═════════════════════════════════════════════════════════════════════════════════
//
// This page is a pixel-perfect clone of the uploaded HTML design.
// It uses the exact same PNG image as background with interactive hotspots.
// All navigation hotspots route to /login?next=/route (for non-auth visitors).
// Interactive elements (coverage, status, cards, play) show modals.

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

// ── Hotspot definitions (exact pixel coordinates from uploaded HTML) ────────
interface Hotspot {
  cls: string;
  left: number; top: number; width: number; height: number;
  action: string; name?: string; aria?: string;
  route?: string; // Where to navigate (for nav hotspots)
}

const HOTSPOTS: Hotspot[] = [
  // Nav links
  { cls: "home", left: 272, top: 8, width: 83, height: 53, action: "nav", name: "Home", route: "/login?next=/home" },
  { cls: "inbox", left: 360, top: 8, width: 108, height: 53, action: "nav", name: "Smart Inbox", route: "/login?next=/home" },
  { cls: "trade", left: 469, top: 8, width: 118, height: 53, action: "nav", name: "Trade Execution", route: "/login?next=/trades" },
  { cls: "network", left: 591, top: 8, width: 92, height: 53, action: "nav", name: "Network", route: "/login?next=/network" },
  { cls: "analytics", left: 685, top: 8, width: 87, height: 53, action: "nav", name: "Analytics", route: "/login?next=/home" },
  { cls: "compliance", left: 775, top: 8, width: 101, height: 53, action: "nav", name: "Compliance", route: "/login?next=/trust" },
  { cls: "ai", left: 879, top: 8, width: 123, height: 53, action: "nav", name: "AI Intelligence", route: "/login?next=/home" },
  { cls: "resources", left: 1003, top: 8, width: 102, height: 53, action: "nav", name: "Resources", route: "/login?next=/network" },
  // Top right controls
  { cls: "language", left: 1138, top: 12, width: 107, height: 49, action: "language", aria: "Change language" },
  { cls: "notifications", left: 1250, top: 12, width: 47, height: 49, action: "notifications", aria: "Open notifications" },
  { cls: "theme", left: 1301, top: 11, width: 50, height: 50, action: "theme", aria: "Toggle theme" },
  { cls: "request", left: 1364, top: 10, width: 144, height: 48, action: "request", aria: "Request access" },
  // Right sidebar panels
  { cls: "coverage", left: 1124, top: 82, width: 387, height: 249, action: "coverage", aria: "Global coverage" },
  { cls: "status", left: 1124, top: 340, width: 387, height: 267, action: "status", aria: "Live system status" },
  // Hero play button
  { cls: "play", left: 685, top: 409, width: 87, height: 89, action: "demo", aria: "See how SGTX works" },
  { cls: "how", left: 649, top: 494, width: 160, height: 46, action: "demo", aria: "See how SGTX works" },
  // Feature cards
  { cls: "card1", left: 21, top: 622, width: 259, height: 158, action: "card", name: "Trade Execution", route: "/login?next=/trades" },
  { cls: "card2", left: 284, top: 622, width: 259, height: 158, action: "card", name: "Compliance Assurance", route: "/login?next=/trust" },
  { cls: "card3", left: 547, top: 622, width: 231, height: 158, action: "card", name: "Network & Intelligence", route: "/login?next=/network" },
  { cls: "card4", left: 783, top: 622, width: 219, height: 158, action: "card", name: "Logistics & Tracking", route: "/login?next=/operations" },
  { cls: "card5", left: 1005, top: 622, width: 228, height: 158, action: "card", name: "Financing Hub", route: "/login?next=/money" },
  { cls: "card6", left: 1237, top: 622, width: 275, height: 158, action: "card", name: "Documents & Contracts", route: "/login?next=/trades" },
];

// ── Card descriptions (from uploaded HTML JS) ────────────────────────────────
const DESCRIPTIONS: Record<string, string> = {
  "Trade Execution": "Create, manage and execute seamless global trades through a governed execution layer.",
  "Compliance Assurance": "AI-powered jurisdiction, sanctions and regulatory intelligence with constitutional controls.",
  "Network & Intelligence": "Your relationships, your data, your sovereign control across the trade network.",
  "Logistics & Tracking": "Multi-modal visibility from origin to final destination across shipment milestones.",
  "Financing Hub": "Connect with banks, private financiers and capital providers without turning SGTX into a broker.",
  "Documents & Contracts": "Smart contracts, e-signature workflows and immutable audit evidence for trade documents.",
};

// ── Modal content builder ─────────────────────────────────────────────────────
function getModalContent(kind: string, name?: string) {
  if (kind === "request") {
    return {
      title: "Request Access",
      body: (
        <>
          <p>SGTX provides sovereign-governed infrastructure for global trade execution. Access is controlled rather than marketplace-style.</p>
          <div className="modal-grid">
            <div className="modal-item"><b>Organization</b><span>Government, enterprise or institution</span></div>
            <div className="modal-item"><b>Operating Model</b><span>Non-custodial execution infrastructure</span></div>
            <div className="modal-item"><b>Governance</b><span>Constitutional decision controls</span></div>
            <div className="modal-item"><b>Security</b><span>Identity, policy and immutable audit</span></div>
          </div>
        </>
      ),
    };
  }
  if (kind === "demo") {
    return {
      title: "How SGTX Works",
      body: (
        <>
          <p>The landing page represents SGTX as a governed execution operating system: parties submit trade actions, governance checks them, and the execution layer coordinates approved workflows.</p>
          <div className="modal-grid">
            <div className="modal-item"><b>01 — Intake</b><span>Trade request and supporting evidence</span></div>
            <div className="modal-item"><b>02 — Governance</b><span>Constitutional rules and jurisdiction checks</span></div>
            <div className="modal-item"><b>03 — Execution</b><span>Bank-to-bank / logistics workflow coordination</span></div>
            <div className="modal-item"><b>04 — Audit</b><span>Deterministic, immutable decision record</span></div>
          </div>
        </>
      ),
    };
  }
  if (kind === "coverage") {
    return {
      title: "Global Coverage",
      body: (
        <>
          <p>Coverage panel details shown in the reference landing page.</p>
          <div className="modal-grid">
            <div className="modal-item"><b>212</b><span>Countries</span></div>
            <div className="modal-item"><b>185K+</b><span>Verified Entities</span></div>
            <div className="modal-item"><b>98.7%</b><span>Sanctions Clear</span></div>
            <div className="modal-item"><b>24/7</b><span>Governed</span></div>
          </div>
        </>
      ),
    };
  }
  if (kind === "status") {
    const systems = ["Governor Decision Engine", "Sanctions & Jurisdiction Monitor", "AI Compliance Intelligence", "Trade Execution Layer", "Security & Identity (ZITADEL)"];
    return {
      title: "Live System Status",
      body: (
        <>
          <p>Reference status panel: all systems operational in the supplied visual.</p>
          <div className="modal-grid">
            {systems.map(s => <div key={s} className="modal-item"><b>{s}</b><span>Operational</span></div>)}
          </div>
        </>
      ),
    };
  }
  if (kind === "notifications") {
    return {
      title: "Notifications",
      body: <p>You have no new notifications. All systems are operational.</p>,
    };
  }
  // Default: section card
  return {
    title: name || "SGTX",
    body: <p>{DESCRIPTIONS[name || ""] || "This control is represented in the SGTX landing page reference image."}</p>,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function LandingPage() {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalKind, setModalKind] = useState("section");
  const [modalName, setModalName] = useState<string | undefined>(undefined);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const showModal = useCallback((kind: string, name?: string) => {
    setModalKind(kind);
    setModalName(name);
    setModalOpen(true);
  }, []);

  const handleHotspot = useCallback((hs: Hotspot) => {
    if (hs.route) {
      router.push(hs.route);
      return;
    }
    if (hs.action === "request") return showModal("request");
    if (hs.action === "demo") return showModal("demo");
    if (hs.action === "coverage") return showModal("coverage");
    if (hs.action === "status") return showModal("status");
    if (hs.action === "notifications") return showModal("notifications");
    if (hs.action === "language") return showToast("Language selector — English is active in the reference design.");
    if (hs.action === "theme") return showToast("The reference image is already in dark mode.");
    if (hs.action === "nav" || hs.action === "card") return showModal("section", hs.name);
  }, [router, showModal, showToast]);

  const modalContent = getModalContent(modalKind, modalName);

  return (
    <>
      {/* ── Exact CSS from uploaded HTML ── */}
      <style dangerouslySetInnerHTML={{ __html: `
        :root{--bg:#020712;--text:#fff;--panel:#061328}
        *{box-sizing:border-box}
        html,body{margin:0;min-height:100%;background:var(--bg);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
        body{overflow-x:hidden}
        .sgtx-page{min-height:100vh;background:#020712;display:flex;justify-content:center;align-items:flex-start}
        .sgtx-stage{position:relative;width:min(100vw,1536px);aspect-ratio:1536/1024;overflow:hidden;isolation:isolate}
        .sgtx-reference{position:absolute;inset:0;width:100%;height:100%;display:block;user-select:none;-webkit-user-drag:none;object-fit:fill}
        .sgtx-hotspot-layer{position:absolute;inset:0;z-index:5}
        .sgtx-hotspot{position:absolute;border:0;background:transparent;padding:0;margin:0;cursor:pointer;outline:none;border-radius:10px}
        .sgtx-hotspot:focus-visible{box-shadow:0 0 0 2px #fff,0 0 0 5px rgba(59,156,255,.95)}
        .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}

        .modal-backdrop{position:fixed;inset:0;z-index:30;background:rgba(0,0,0,.74);backdrop-filter:blur(8px);display:none;align-items:center;justify-content:center;padding:24px}
        .modal-backdrop.open{display:flex}
        .modal{width:min(680px,calc(100vw - 32px));background:linear-gradient(180deg,rgba(9,22,48,.98),rgba(3,12,27,.98));border:1px solid rgba(77,141,255,.48);border-radius:18px;box-shadow:0 30px 100px rgba(0,0,0,.65),0 0 40px rgba(0,110,255,.15);color:#f5f8ff;overflow:hidden}
        .modal-head{padding:18px 22px 16px;border-bottom:1px solid rgba(120,165,255,.16);display:flex;align-items:center;justify-content:space-between;gap:18px}
        .modal-title{font-size:18px;font-weight:700;letter-spacing:.2px}
        .modal-close{width:34px;height:34px;border-radius:10px;border:1px solid rgba(155,190,255,.22);background:rgba(255,255,255,.04);color:#dce8ff;cursor:pointer;font-size:18px;line-height:1}
        .modal-body{padding:22px}
        .modal-body p{margin:0 0 12px;color:#c7d5ef;line-height:1.65;font-size:14px}
        .modal-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:16px}
        .modal-item{border:1px solid rgba(119,160,235,.16);background:rgba(255,255,255,.025);border-radius:12px;padding:13px}
        .modal-item b{display:block;font-size:12px;color:#fff;margin-bottom:4px}
        .modal-item span{font-size:12px;color:#91a6c8}
        .modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}
        .sgtx-btn{border:0;border-radius:11px;padding:10px 15px;font-weight:700;cursor:pointer}
        .btn-primary{background:linear-gradient(135deg,#168cff,#7b2dff);color:#fff;box-shadow:0 8px 24px rgba(49,100,255,.28)}
        .btn-secondary{background:rgba(255,255,255,.05);color:#dce8ff;border:1px solid rgba(155,190,255,.2)}

        .sgtx-toast{position:fixed;right:22px;bottom:22px;z-index:40;display:none;max-width:min(420px,calc(100vw - 44px));padding:13px 15px;border-radius:12px;background:rgba(8,19,39,.95);border:1px solid rgba(75,155,255,.36);color:#eaf2ff;box-shadow:0 14px 40px rgba(0,0,0,.45);font-size:13px}
        .sgtx-toast.show{display:block;animation:toastIn .18s ease-out}
        @keyframes toastIn{from{transform:translateY(8px);opacity:0}to{transform:translateY(0);opacity:1}}

        @media (max-width:900px){
          .sgtx-stage{width:100vw}
          .sgtx-hotspot{cursor:pointer}
          .modal-grid{grid-template-columns:1fr}
        }
        @media (max-width:620px){
          .modal-backdrop{padding:12px}
          .modal-body{padding:17px}
          .modal-head{padding:15px 17px}
        }
      `}} />

      <main className="sgtx-page">
        <section className="sgtx-stage" aria-label="SGTX Sovereign Global Trade Exchange landing page">
          {/* The pixel-perfect reference image */}
          <img className="sgtx-reference" src="/sgtx-landing.jpg" alt="SGTX Sovereign Global Trade Exchange landing page" />

          {/* Hotspot overlay layer */}
          <div className="sgtx-hotspot-layer">
            {HOTSPOTS.map((hs) => (
              <button
                key={hs.cls}
                className="sgtx-hotspot"
                style={{
                  left: `${(hs.left / 1536) * 100}%`,
                  top: `${(hs.top / 1024) * 100}%`,
                  width: `${(hs.width / 1536) * 100}%`,
                  height: `${(hs.height / 1024) * 100}%`,
                }}
                onClick={() => handleHotspot(hs)}
                aria-label={hs.aria || hs.name || hs.cls}
              >
                <span className="sr-only">{hs.name || hs.action}</span>
              </button>
            ))}
          </div>
        </section>
      </main>

      {/* ── Modal ── */}
      <div
        className={`modal-backdrop${modalOpen ? " open" : ""}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) setModalOpen(false);
        }}
        aria-hidden={!modalOpen}
      >
        <div className="modal">
          <div className="modal-head">
            <div className="modal-title">{modalContent.title}</div>
            <button className="modal-close" onClick={() => setModalOpen(false)}>×</button>
          </div>
          <div className="modal-body">
            {modalContent.body}
            <div className="modal-actions">
              <button className="sgtx-btn btn-secondary" onClick={() => setModalOpen(false)}>Close</button>
              {modalKind === "request" && (
                <button className="sgtx-btn btn-primary" onClick={() => router.push("/login?next=/home")}>Continue</button>
              )}
              {modalKind === "card" && (
                <button className="sgtx-btn btn-primary" onClick={() => router.push("/login?next=/home")}>Explore</button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Toast ── */}
      {toast && (
        <div className="sgtx-toast show">{toast}</div>
      )}
    </>
  );
}

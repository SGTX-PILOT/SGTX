"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// /portal — the legacy 204-tab portal experience.
// ═════════════════════════════════════════════════════════════════════════════════
//
// This route preserves the full legacy WorkspaceShell + PortalShell +
// PortalContent experience with all 204 tabs, 6 workspaces, Expert Mode,
// Smart Worklist, Active Trade Context Bar, AI Assistant, and all the
// role-specific screens that were built over months of development.
//
// The cockpit routes (/home, /trades, etc.) are the simplified cockpit
// view. This /portal route is the full-featured view for users who need
// the complete portal experience.

import { use, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { WorkspaceShell } from "@/components/sgtx/WorkspaceShell";
import { PORTAL_MAP, type PortalConfig } from "@/lib/sgtx/portal-config";
import { useSession } from "@/lib/cockpit/session";

const ROLE_TO_PORTAL: Record<string, string> = {
  TRADER_BUYER: "trader-buyer",
  TRADER_SELLER: "trader-seller",
  LSP: "lsp",
  CARRIER: "ship",
  LAB: "lab",
  QC: "qc",
  CUSTOMS_BROKER: "cbr",
  BANK: "bank",
  PRIVATE_FINANCIER: "pfi",
  REGULATOR: "gov",
  PLATFORM_ADMIN: "admin",
  MARKETPLACE_PARTNER: "marketplace-partner",
};

export default function PortalPage() {
  const search = useSearchParams();
  const router = useRouter();
  const { payload, ready } = useSession();

  // Derive the portal ID from the URL or the JWT role — NO useEffect needed.
  const portalId = useMemo(() => {
    const urlPortalId = search.get("portal_id");
    if (urlPortalId && PORTAL_MAP[urlPortalId]) return urlPortalId;
    const role = (payload as any)?.role || "";
    return ROLE_TO_PORTAL[role] || "trader-buyer";
  }, [search, payload]);

  if (!ready) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading session…</div>;
  }
  if (!payload) {
    router.push("/login?next=/portal");
    return null;
  }

  const portal: PortalConfig | null = portalId ? PORTAL_MAP[portalId] : null;

  if (!portal) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Loading portal…
      </div>
    );
  }

  return <WorkspaceShell portal={portal} />;
}

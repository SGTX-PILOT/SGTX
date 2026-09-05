"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// COCKPIT-Phase 5: /network route — counterparties, saved contacts, corridors.
// ═════════════════════════════════════════════════════════════════════════════════
//
// Two sections:
//   1. Saved contacts — counterparties you've traded with (or explicitly saved).
//   2. Trade corridors — the routes you've used (origin → destination).
//
// Law #7: NOTHING FABRICATED. Real data from the existing /api/sgtx/contacts
// endpoint (or honest empty states if no contacts exist yet).

import { useQuery } from "@tanstack/react-query";
import { CockpitShell, shouldShowAdmin } from "@/components/cockpit/CockpitShell";
import { useSession, fetchWithAuth } from "@/lib/cockpit/session";
import { useCockpitLocale } from "@/lib/cockpit/use-locale";
import { Badge } from "@/components/ui/badge";
import {
  Network, Users, Globe2, Loader2, ChevronRight, MapPin,
} from "lucide-react";
import Link from "next/link";

interface DashboardData {
  tenant?: { gtid: string; legalName: string; type: string };
  tradesAsBuyer?: any[];
  tradesAsSeller?: any[];
}

interface Contact {
  gtid: string;
  legalName: string;
  type: string;
  country?: string;
  trustScore?: number;
}

export default function NetworkPage() {
  const { payload, ready } = useSession();
  const { t } = useCockpitLocale();

  const { data: dashData, isLoading: dashLoading } = useQuery<DashboardData>({
    queryKey: ["cockpit-dashboard", payload?.tenantGtid],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/sgtx/dashboard?tenant=${encodeURIComponent(payload!.tenantGtid!)}`);
      if (!res.ok) throw new Error(`Failed to load dashboard (${res.status})`);
      return res.json();
    },
    enabled: ready && !!payload?.tenantGtid,
  });

  // Fetch saved contacts via the existing /api/sgtx/contacts endpoint.
  const { data: contactsData, isLoading: contactsLoading } = useQuery<{ contacts: Contact[] }>({
    queryKey: ["cockpit-contacts", payload?.tenantGtid],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/sgtx/contacts");
      if (!res.ok) return { contacts: [] };
      const data = await res.json();
      // The endpoint may return { contacts: [...] } or an array directly.
      return { contacts: data.contacts || data || [] };
    },
    enabled: ready && !!payload?.tenantGtid,
  });

  // Derive corridors from the dashboard trades.
  const corridors = useCorridors(dashData);

  if (!ready) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">{t("common.loadingSession")}</div>;
  if (!payload) return null;

  const tenantType = dashData?.tenant?.type || "";
  const contacts = contactsData?.contacts || [];

  return (
    <CockpitShell
      roleLabel={payload.role}
      tenantName={dashData?.tenant?.legalName}
      showAdmin={shouldShowAdmin(tenantType)}
    >
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">{t("net.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("net.subtitle")}
          </p>
        </header>

        {/* Saved contacts */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-3.5 h-3.5 text-muted-foreground" />
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Saved contacts
            </h2>
            <span className="text-xs text-muted-foreground/70">({contacts.length})</span>
          </div>
          {contactsLoading ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2 py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : contacts.length > 0 ? (
            <ul className="divide-y divide-border border border-border rounded-md bg-card/40">
              {contacts.map((c) => (
                <li key={c.gtid} className="flex items-center justify-between gap-3 p-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.legalName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono">{c.gtid}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {c.country && <Badge variant="outline" className="text-[0.6rem]">{c.country}</Badge>}
                    {c.trustScore !== undefined && (
                      <Badge variant="outline" className="text-[0.6rem]">{c.trustScore}/100</Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-4 rounded-md border border-dashed border-border text-sm text-muted-foreground">
              <Users className="w-5 h-5 text-muted-foreground/40 mb-2" />
              <p>No saved contacts yet.</p>
              <p className="text-xs mt-1">When you create a trade request, the counterparty is added to your network automatically.</p>
            </div>
          )}
        </section>

        {/* Trade corridors */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <Globe2 className="w-3.5 h-3.5 text-muted-foreground" />
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Trade corridors
            </h2>
            <span className="text-xs text-muted-foreground/70">({corridors.length})</span>
          </div>
          {dashLoading ? (
            <div className="text-sm text-muted-foreground flex items-center gap-2 py-4">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : corridors.length > 0 ? (
            <ul className="divide-y divide-border border border-border rounded-md bg-card/40">
              {corridors.map((c, i) => (
                <li key={i} className="flex items-center justify-between gap-3 p-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium">{c.origin} → {c.destination}</span>
                  </div>
                  <Badge variant="outline" className="text-[0.6rem]">{c.count} trade{c.count !== 1 ? "s" : ""}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No trade corridors yet. Create your first trade to see the route here.</p>
          )}
        </section>
      </div>
    </CockpitShell>
  );
}

function useCorridors(data?: DashboardData): { origin: string; destination: string; count: number }[] {
  if (!data) return [];
  const trades = [...(data.tradesAsBuyer || []), ...(data.tradesAsSeller || [])];
  const counts: Record<string, { origin: string; destination: string; count: number }> = {};
  for (const t of trades) {
    const origin = t.originCountry || "—";
    const destination = t.destinationCountry || "—";
    const key = `${origin}-${destination}`;
    if (!counts[key]) counts[key] = { origin, destination, count: 0 };
    counts[key].count++;
  }
  return Object.values(counts).sort((a, b) => b.count - a.count);
}

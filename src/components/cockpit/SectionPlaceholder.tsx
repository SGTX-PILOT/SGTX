"use client";

// COCKPIT-Phase 0: Placeholder for role-gated sections.
//
// The full content for /operations /money /trust /network /admin will be
// built in Phase 5 (role perspectives). For Phase 0, these routes must
// exist so the top-nav links resolve to real pages (not 404s) and so
// middleware can gate them by role.

import { CockpitShell, shouldShowAdmin } from "@/components/cockpit/CockpitShell";
import { useSession } from "@/lib/cockpit/session";
import { Card } from "@/components/ui/card";
import { Wrench } from "lucide-react";
import Link from "next/link";

interface PlaceholderProps {
  title: string;
  description: string;
  roleNote?: string;
  /** If true, this section is only visible to ADM-type tenants. */
  adminOnly?: boolean;
}

export function SectionPlaceholder({ title, description, roleNote, adminOnly }: PlaceholderProps) {
  const { payload, ready } = useSession();
  if (!ready) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading session…</div>;
  if (!payload) return null;

  return (
    <CockpitShell
      roleLabel={payload.role}
      showAdmin={shouldShowAdmin(adminOnly ? "ADM" : undefined)}
    >
      <div className="max-w-2xl space-y-4">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </header>

        <Card className="p-4 border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/10">
          <div className="flex items-start gap-3">
            <Wrench className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="text-xs">
              <p className="font-medium text-amber-700 dark:text-amber-300">
                This section is being built (Phase 5 of the cockpit rebuild).
              </p>
              <p className="text-muted-foreground mt-1">
                For now, the surfaces that lived under the legacy{" "}
                <Link href="/" className="underline">portal launcher</Link>{" "}
                remain available via the original SPA until each one is
                re-packaged into the new 7-item top-nav structure.
              </p>
              {roleNote && (
                <p className="text-muted-foreground mt-2">
                  Role note: {roleNote}
                </p>
              )}
            </div>
          </div>
        </Card>
      </div>
    </CockpitShell>
  );
}

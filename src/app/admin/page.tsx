"use client";
// COCKPIT-Phase 0: /admin route — platform admin only.
// Law: Admin hidden entirely for non-admin tenants — internal machinery
// (Loom, OPA, Governor, QES, chaos testing, competitor benchmark, journey
// maps) is invisible to external roles, not just disabled.
import { SectionPlaceholder } from "@/components/cockpit/SectionPlaceholder";
export default function AdminPage() {
  return (
    <SectionPlaceholder
      title="Admin"
      description="Platform governance — Loom, OPA, Governor, QES, integration status, tenant management."
      roleNote="This section is only visible to ADM-type platform admin tenants. The middleware enforces this; the top nav hides it for everyone else."
      adminOnly
    />
  );
}
